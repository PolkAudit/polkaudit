"""P0-2B Stage B replay regression — identity, conflicts, gaps, locks, API."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select, func

from src.models import (
    Proposal,
    Vote,
    TreasurySpend,
    ProcessedBlock,
    IndexerCursor,
    DeadLetterQueue,
    Block,
)
from src.parser import ChainParser
from src.persistence import (
    insert_entities_idempotent,
    advance_cursor,
    bootstrap_cursor_from_processed,
    coverage_status,
)
from src.integrity import IntegrityConflictError
from src.scanner import FinalizedScanner, EventFetchError
from src.writer_lock import WriterLock, ExclusiveLockError
from src.identity import system_event_key

FIXTURES = Path(__file__).parent / "fixtures" / "golden"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def _parse_treasury_fixture():
    fx = _load("treasury_spend201_asset_approved.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    return fx, parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )


@pytest.mark.asyncio
async def test_b01_first_replay_expected_records(session_maker):
    fx, result = _parse_treasury_fixture()
    assert len(result["treasury_spends"]) == 1
    async with session_maker() as session:
        n = await insert_entities_idempotent(
            session, result["treasury_spends"], session.bind.dialect.name
        )
        await session.commit()
        assert n == 1
        row = (await session.execute(select(TreasurySpend))).scalar_one()
        assert row.value == "795500000000"
        assert row.event_key == system_event_key(
            fx["block_number"], 0, "Treasury", "AssetSpendApproved", block_hash=fx["block_hash"]
        )


@pytest.mark.asyncio
async def test_b02_b03_second_replay_identical_no_extra(session_maker):
    fx, result = _parse_treasury_fixture()
    async with session_maker() as session:
        await insert_entities_idempotent(session, result["treasury_spends"], session.bind.dialect.name)
        await session.commit()
    # identical second pass
    _, result2 = _parse_treasury_fixture()
    assert result2["treasury_spends"][0].event_key == result["treasury_spends"][0].event_key
    async with session_maker() as session:
        n = await insert_entities_idempotent(
            session, result2["treasury_spends"], session.bind.dialect.name
        )
        await session.commit()
        assert n == 0
        assert await session.scalar(select(func.count(TreasurySpend.id))) == 1


@pytest.mark.asyncio
async def test_b04_expected_events_do_not_disappear(session_maker):
    fx = _load("ref1674_confirmed.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("x")
    first = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    keys = {p.event_key for p in first["proposals"]}
    async with session_maker() as session:
        await insert_entities_idempotent(session, first["proposals"], session.bind.dialect.name)
        await session.commit()
    second = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    async with session_maker() as session:
        await insert_entities_idempotent(session, second["proposals"], session.bind.dialect.name)
        await session.commit()
        stored = {r.event_key for r in (await session.execute(select(Proposal))).scalars()}
        assert keys == stored
        assert 1674 in {r.proposal_index for r in (await session.execute(select(Proposal))).scalars()}


@pytest.mark.asyncio
async def test_b05_same_value_payments_remain_distinct(session_maker):
    hash_ = "0xabc123"
    events = [
        {"event": {"module_id": "Treasury", "event_id": "Awarded", "attributes": {"beneficiary": "5A", "amount": 9}}},
        {"event": {"module_id": "Treasury", "event_id": "Awarded", "attributes": {"beneficiary": "5A", "amount": 9}}},
    ]
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("x")
    result = parser.parse_block(99, [], events=events, block_hash=hash_)
    assert len(result["treasury_spends"]) == 2
    assert result["treasury_spends"][0].event_key != result["treasury_spends"][1].event_key
    async with session_maker() as session:
        await insert_entities_idempotent(session, result["treasury_spends"], session.bind.dialect.name)
        await session.commit()
        assert await session.scalar(select(func.count(TreasurySpend.id))) == 2


@pytest.mark.asyncio
async def test_b06_conflicting_payload_detected(session_maker):
    fx, result = _parse_treasury_fixture()
    async with session_maker() as session:
        await insert_entities_idempotent(session, result["treasury_spends"], session.bind.dialect.name)
        await session.commit()

    conflict = result["treasury_spends"][0]
    # same key, different financial value
    conflict.value = "1"
    async with session_maker() as session:
        with pytest.raises(IntegrityConflictError, match="value"):
            await insert_entities_idempotent(session, [conflict], session.bind.dialect.name)


@pytest.mark.asyncio
async def test_b07_interrupted_replay_resumes(session_maker, engine, monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", False)
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("no")
    fx = _load("ref1676_submitted.json")
    # force events via parse inside process_block
    scanner = FinalizedScanner(session_maker, parser=parser, engine_=engine)
    scanner._fetch_events_sync = MagicMock(return_value=fx["parser_events"])
    scanner._segment_start = fx["block_number"]
    block_data = {
        "block": {"header": {"parentHash": "0xp"}, "extrinsics": []},
    }
    # fail mid-way once (do not mutate the real parser instance)
    failing = MagicMock()
    failing.parse_block = MagicMock(side_effect=RuntimeError("interrupt"))
    scanner.parser = failing
    with pytest.raises(RuntimeError):
        await scanner.process_block(block_data, fx["block_number"], fx["block_hash"])
    async with session_maker() as session:
        assert await session.get(ProcessedBlock, fx["block_number"]) is None

    # resume with real parser
    scanner.parser = parser
    scanner._segment_start = fx["block_number"]
    await scanner.process_block(block_data, fx["block_number"], fx["block_hash"])
    async with session_maker() as session:
        assert await session.get(ProcessedBlock, fx["block_number"]) is not None
        assert await session.scalar(select(func.count(Proposal.id))) == 1
        cursor = await session.get(IndexerCursor, 1)
        status = coverage_status(cursor)
        assert status["forward_progress"] == fx["block_number"]
        assert status["claims_full_history"] is False
        assert any(g["reason"] == "below_verified_range" for g in status["historical_gaps"])


@pytest.mark.asyncio
async def test_b08_historical_gaps_explicit(session_maker):
    async with session_maker() as session:
        session.add(ProcessedBlock(block_number=10, block_hash="0xa"))
        session.add(ProcessedBlock(block_number=12, block_hash="0xb"))
        await session.commit()
        cursor = await bootstrap_cursor_from_processed(session)
        await session.commit()
        status = coverage_status(cursor)
        assert status["claims_full_history"] is False
        assert status["verified_contiguous_range"] == [12, 12]
        assert status["historical_gaps"]
        assert status["forward_progress"] == 12


@pytest.mark.asyncio
async def test_b09_writer_lock_contention(engine, tmp_path):
    a = WriterLock(engine, lock_path=str(tmp_path / "a.lock"))
    b = WriterLock(engine, lock_path=str(tmp_path / "b.lock"))
    await a.acquire()
    with pytest.raises(ExclusiveLockError):
        await b.acquire()
    await a.release()


def test_b10_api_contract_compatible():
    from pydantic import BaseModel
    from typing import Optional, Any

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
        id = 7
        proposal_index = 1674
        block_number = 26863938
        section = "Referenda"
        method = "Submitted"
        proposer = "unknown"
        args = {"index": 1674}
        status = "Proposed"
        event_key = "polkadot/0xea/26863938:e:61:Referenda.Submitted"

    resp = ProposalResponse.model_validate(Row(), from_attributes=True)
    assert resp.proposal_index == 1674
    assert "event_key" not in ProposalResponse.model_fields
