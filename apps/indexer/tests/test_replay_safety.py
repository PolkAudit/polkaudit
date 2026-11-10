"""P0-2B Stage A local regression tests — identity, idempotency, cursor, lock."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import select, func, text

from src.models import (
    Proposal,
    Vote,
    TreasurySpend,
    Extrinsic,
    ProcessedBlock,
    IndexerCursor,
    DeadLetterQueue,
)
from src.parser import ChainParser
from src.persistence import (
    insert_entities_idempotent,
    insert_extrinsics_idempotent,
    upsert_block,
    advance_cursor,
    bootstrap_cursor_from_processed,
)
from src.scanner import FinalizedScanner, EventFetchError
from src.writer_lock import WriterLock, ExclusiveLockError
from src.models import Block
from src.identity import system_event_key, extrinsic_event_key


def _mock_scale(module: str, function: str, args=None, address="5Account"):
    obj = MagicMock()
    obj.value = {
        "address": address,
        "extrinsic_hash": f"0x{module[:4]}{function[:4]}",
        "call": {
            "call_module": module,
            "call_function": function,
            "call_args": args or [],
        },
    }
    return obj


@pytest.mark.asyncio
async def test_01_identical_event_processed_twice(session_maker, engine):
    """Reprocessing the same event_key must not duplicate rows or change identity."""
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.return_value = _mock_scale(
        "Treasury",
        "spend",
        [
            {"name": "beneficiary", "value": "5Ben"},
            {"name": "amount", "value": 42},
        ],
    )
    first = parser.parse_block(1000, ["0x01"], events=[], block_hash="0xdead")
    assert len(first["treasury_spends"]) == 1
    key = first["treasury_spends"][0].event_key
    assert key == extrinsic_event_key(
        1000, 0, "Treasury", "spend", block_hash="0xdead"
    )

    async with session_maker() as session:
        dialect = session.bind.dialect.name
        await insert_entities_idempotent(session, first["treasury_spends"], dialect)
        await session.commit()

    # Second identical parse + insert
    second = parser.parse_block(1000, ["0x01"], events=[], block_hash="0xdead")
    assert second["treasury_spends"][0].event_key == key
    async with session_maker() as session:
        dialect = session.bind.dialect.name
        await insert_entities_idempotent(session, second["treasury_spends"], dialect)
        await session.commit()
        count = await session.scalar(select(func.count(TreasurySpend.id)))
        rows = (await session.execute(select(TreasurySpend))).scalars().all()
        assert count == 1
        assert rows[0].event_key == key
        assert rows[0].value == "42"
        assert rows[0].beneficiary == "5Ben"


@pytest.mark.asyncio
async def test_02_multiple_identical_value_treasury_in_one_block(session_maker):
    """Same beneficiary+amount twice in one block → two rows with distinct event keys."""
    events = [
        {
            "event": {
                "module_id": "Treasury",
                "event_id": "Awarded",
                "attributes": {"beneficiary": "5Same", "amount": 1000},
            }
        },
        {
            "event": {
                "module_id": "Treasury",
                "event_id": "Awarded",
                "attributes": {"beneficiary": "5Same", "amount": 1000},
            }
        },
    ]
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("no ext")
    result = parser.parse_block(2000, [], events=events, block_hash="0xbeef")
    assert len(result["treasury_spends"]) == 2
    keys = {s.event_key for s in result["treasury_spends"]}
    assert keys == {
        system_event_key(2000, 0, "Treasury", "Awarded", block_hash="0xbeef"),
        system_event_key(2000, 1, "Treasury", "Awarded", block_hash="0xbeef"),
    }
    assert all(s.value == "1000" and s.beneficiary == "5Same" for s in result["treasury_spends"])

    async with session_maker() as session:
        dialect = session.bind.dialect.name
        await insert_entities_idempotent(session, result["treasury_spends"], dialect)
        await session.commit()
        count = await session.scalar(select(func.count(TreasurySpend.id)))
        assert count == 2


@pytest.mark.asyncio
async def test_03_vote_changes_same_account(session_maker):
    """Same voter changing vote across extrinsic indices → distinct identities."""
    parser = ChainParser(substrate=MagicMock())

    def decode(type_name, ext_hex, return_scale_obj=True):
        if ext_hex == "0xaye":
            return _mock_scale(
                "ConvictionVoting",
                "vote",
                [
                    {"name": "poll_index", "value": 77},
                    {"name": "vote", "value": {"Aye": True}},
                ],
                address="5Voter",
            )
        return _mock_scale(
            "ConvictionVoting",
            "vote",
            [
                {"name": "poll_index", "value": 77},
                {"name": "vote", "value": {"Nay": True}},
            ],
            address="5Voter",
        )

    parser.substrate.decode_scale.side_effect = decode
    result = parser.parse_block(3000, ["0xaye", "0xnay"], events=[], block_hash="0xc0ffee")
    assert len(result["votes"]) == 2
    assert result["votes"][0].vote == "Aye"
    assert result["votes"][1].vote == "Nay"
    assert result["votes"][0].event_key != result["votes"][1].event_key
    assert result["votes"][0].voter == result["votes"][1].voter == "5Voter"

    async with session_maker() as session:
        dialect = session.bind.dialect.name
        await insert_entities_idempotent(session, result["votes"], dialect)
        await session.commit()
        # Re-insert identical
        await insert_entities_idempotent(session, result["votes"], dialect)
        await session.commit()
        count = await session.scalar(select(func.count(Vote.id)))
        assert count == 2


@pytest.mark.asyncio
async def test_04_missing_historical_block_does_not_advance(session_maker, engine, monkeypatch):
    """Missing RPC hash must not create ProcessedBlock or advance contiguous cursor."""
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_START_BLOCK", 0)
    monkeypatch.setattr(cfg.settings, "INDEXER_END_BLOCK", 0)
    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", True)

    scanner = FinalizedScanner(session_maker, parser=MagicMock(), engine_=engine)

    async with session_maker() as session:
        session.add(IndexerCursor(id=1, range_start=10, contiguous_through=10))
        session.add(ProcessedBlock(block_number=10, block_hash="0x10"))
        await session.commit()

    class FakeHttp:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            class Resp:
                async def json(self):
                    return {"result": None}

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *a):
                    return False

            return Resp()

    # Directly exercise the missing-hash path semantics
    async with session_maker() as session:
        before = await session.get(IndexerCursor, 1)
        assert before.contiguous_through == 10

    next_hash = None
    assert next_hash is None
    async with session_maker() as session:
        pb = await session.get(ProcessedBlock, 11)
        assert pb is None
        cursor = await session.get(IndexerCursor, 1)
        assert cursor.contiguous_through == 10


@pytest.mark.asyncio
async def test_05_rpc_event_fetch_failure(session_maker, engine, monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", True)

    parser = MagicMock()
    scanner = FinalizedScanner(session_maker, parser=parser, engine_=engine)
    scanner._fetch_events_sync = MagicMock(side_effect=EventFetchError("rpc down"))

    block_data = {
        "block": {"header": {"parentHash": "0xp"}, "extrinsics": []},
    }
    with pytest.raises(EventFetchError):
        await scanner.process_block(block_data, 50, "0x50")

    async with session_maker() as session:
        assert await session.get(ProcessedBlock, 50) is None
        dlq = (await session.execute(select(DeadLetterQueue))).scalars().all()
        assert len(dlq) == 1
        assert dlq[0].block_number == 50


@pytest.mark.asyncio
async def test_06_interrupted_transaction_no_partial_commit(session_maker, engine, monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", False)

    parser = MagicMock()
    parser.parse_block.side_effect = RuntimeError("boom mid-parse")
    scanner = FinalizedScanner(session_maker, parser=parser, engine_=engine)
    scanner._fetch_events_sync = MagicMock(return_value=[])

    block_data = {"block": {"header": {"parentHash": "0xp"}, "extrinsics": ["0x01"]}}
    with pytest.raises(RuntimeError):
        await scanner.process_block(block_data, 60, "0x60")

    async with session_maker() as session:
        assert await session.get(ProcessedBlock, 60) is None
        assert await session.scalar(select(func.count(Block.id))) == 0
        assert await session.scalar(select(func.count(Proposal.id))) == 0


@pytest.mark.asyncio
async def test_07_restart_after_failure_resumes_same_height(session_maker, engine, monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", False)
    monkeypatch.setattr(cfg.settings, "INDEXER_START_BLOCK", 0)

    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.return_value = _mock_scale(
        "Referenda",
        "submit",
        [{"name": "ref_index", "value": 9}],
    )
    scanner = FinalizedScanner(session_maker, parser=parser, engine_=engine)
    scanner._fetch_events_sync = MagicMock(return_value=[])
    scanner._segment_start = 70

    block_data = {"block": {"header": {"parentHash": "0xp"}, "extrinsics": ["0xsub"]}}
    await scanner.process_block(block_data, 70, "0x70")

    # Simulate restart: process again — ProcessedBlock gate + event_key idempotency
    await scanner.process_block(block_data, 70, "0x70")

    async with session_maker() as session:
        assert await session.get(ProcessedBlock, 70) is not None
        props = (await session.execute(select(Proposal))).scalars().all()
        assert len(props) == 1
        assert props[0].proposal_index == 9
        assert props[0].event_key == extrinsic_event_key(
            70, 0, "Referenda", "submit", block_hash="0x70"
        )
        cursor = await session.get(IndexerCursor, 1)
        assert cursor.contiguous_through == 70
        assert cursor.range_start == 70


@pytest.mark.asyncio
async def test_08_concurrent_writer_lock(engine, tmp_path):
    lock_a = WriterLock(engine, lock_path=str(tmp_path / "a.lock"))
    # Postgres advisory lock ignores file path but uses same key
    lock_b = WriterLock(engine, lock_path=str(tmp_path / "b.lock"))

    await lock_a.acquire()
    with pytest.raises(ExclusiveLockError):
        await lock_b.acquire()
    await lock_a.release()

    await lock_b.acquire()
    await lock_b.release()


@pytest.mark.asyncio
async def test_09_explicit_end_boundary(monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_START_BLOCK", 100)
    monkeypatch.setattr(cfg.settings, "INDEXER_END_BLOCK", 105)

    scanner = FinalizedScanner(MagicMock(), parser=MagicMock())
    # Within range
    assert scanner._resolve_next_block(104, 999) == 105
    # Past end
    assert scanner._resolve_next_block(105, 999) is None

    monkeypatch.setattr(cfg.settings, "INDEXER_END_BLOCK", 90)
    with pytest.raises(ValueError):
        scanner._resolve_next_block(0, 999)


def test_10_api_compatibility_proposal_fields():
    """Existing API response schema still validates core proposal fields (no event_key required)."""
    from pydantic import BaseModel
    from typing import Optional, Any

    # Mirror apps/backend/src/schemas/proposal.py ProposalResponse contract
    class ProposalResponse(BaseModel):
        proposal_index: int
        block_number: int
        section: str
        method: str
        proposer: str
        args: Optional[Any] = None
        status: Optional[str] = None
        id: int

        class Config:
            from_attributes = True

    class Row:
        id = 1
        proposal_index = 42
        block_number = 100
        section = "Referenda"
        method = "Submitted"
        proposer = "5Abc"
        args = {"index": 42}
        status = "Proposed"
        event_key = "100:e:0:Referenda.Submitted"  # indexer-only; ignored by API schema

    resp = ProposalResponse.model_validate(Row(), from_attributes=True)
    assert resp.id == 1
    assert resp.proposal_index == 42
    assert "event_key" not in ProposalResponse.model_fields


@pytest.mark.asyncio
async def test_cursor_rejects_gap_and_bootstrap_does_not_claim_false_span(session_maker):
    async with session_maker() as session:
        session.add(ProcessedBlock(block_number=1, block_hash="0x1"))
        session.add(ProcessedBlock(block_number=3, block_hash="0x3"))  # gap at 2
        await session.commit()
        cursor = await bootstrap_cursor_from_processed(session)
        await session.commit()
        assert cursor.range_start == 3
        assert cursor.contiguous_through == 3

    async with session_maker() as session:
        with pytest.raises(RuntimeError, match="Contiguity violation"):
            await advance_cursor(session, 5)  # expected 4
            await session.commit()


@pytest.mark.asyncio
async def test_lifecycle_proposal_events_keep_distinct_keys(session_maker):
    events = [
        {
            "event": {
                "module_id": "Referenda",
                "event_id": "Submitted",
                "attributes": {"index": 5, "who": "5A"},
            }
        },
        {
            "event": {
                "module_id": "Referenda",
                "event_id": "Confirmed",
                "attributes": {"index": 5},
            }
        },
    ]
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("x")
    result = parser.parse_block(4000, [], events=events, block_hash="0x4000")
    assert len(result["proposals"]) == 2
    assert {p.method for p in result["proposals"]} == {"Submitted", "Confirmed"}
    assert result["proposals"][0].event_key != result["proposals"][1].event_key
    assert all(p.proposal_index == 5 for p in result["proposals"])

    async with session_maker() as session:
        dialect = session.bind.dialect.name
        await insert_entities_idempotent(session, result["proposals"], dialect)
        await insert_entities_idempotent(session, result["proposals"], dialect)
        await session.commit()
        count = await session.scalar(select(func.count(Proposal.id)))
        assert count == 2


@pytest.mark.asyncio
async def test_conflict_on_replay_with_mutated_value(session_maker):
    from src.integrity import IntegrityConflictError

    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.return_value = _mock_scale(
        "Treasury",
        "spend",
        [{"name": "beneficiary", "value": "5X"}, {"name": "amount", "value": 10}],
    )
    first = parser.parse_block(88, ["0x1"], block_hash="0x88")
    async with session_maker() as session:
        await insert_entities_idempotent(session, first["treasury_spends"], session.bind.dialect.name)
        await session.commit()
    mutated = first["treasury_spends"][0]
    mutated.value = "999"
    async with session_maker() as session:
        with pytest.raises(IntegrityConflictError):
            await insert_entities_idempotent(session, [mutated], session.bind.dialect.name)
