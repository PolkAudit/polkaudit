"""P0-3 regression: referendum identity, assets, replay stability."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select, func

from src.parser import ChainParser
from src.assets import format_display_amount, resolve_from_asset_kind, resolve_native_dot
from src.persistence import insert_entities_idempotent
from src.models import Proposal, TreasurySpend
from src.identity import system_event_key

FIXTURES = Path(__file__).parent / "fixtures" / "golden"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def _mock_scale(module, function, args=None, address="5Account"):
    obj = MagicMock()
    obj.value = {
        "address": address,
        "extrinsic_hash": "0xabc",
        "call": {
            "call_module": module,
            "call_function": function,
            "call_args": args or [],
        },
    }
    return obj


def test_01_submit_without_index_does_not_fabricate_proposal_index():
    parser = ChainParser(substrate=MagicMock())
    # Real Referenda.submit args have proposal/origin but NOT referendum index
    parser.substrate.decode_scale.return_value = _mock_scale(
        "Referenda",
        "submit",
        [
            {"name": "proposal_origin", "value": "SmallTipper"},
            {"name": "proposal", "value": {"Lookup": {"hash": "0xbe", "len": 59}}},
            {"name": "enactment_moment", "value": {"After": 100}},
        ],
    )
    result = parser.parse_block(26863938, ["0xsub"], events=[], block_hash="0xea69")
    assert result["proposals"] == []
    assert len(result["extrinsics"]) == 1


def test_01b_golden_submit_event_keeps_authoritative_index():
    fx = _load("ref1674_submit_and_vote.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    result = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    indices = {p.proposal_index for p in result["proposals"]}
    assert 1674 in indices
    assert 2 not in indices


def test_03_dot_raw_unit_conversion():
    assert format_display_amount("10000000000", 10) == "1"
    assert format_display_amount("15000000000", 10) == "1.5"
    asset = resolve_native_dot()
    assert asset.asset_symbol == "DOT"
    assert asset.decimals == 10


def test_04_usdc_asset_native_units():
    fx = _load("treasury_spend201_asset_approved.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("x")
    result = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    assert len(result["treasury_spends"]) == 1
    spend = result["treasury_spends"][0]
    assert spend.value == "795500000000"
    assert spend.asset_symbol == "USDC"
    assert spend.decimals == 6
    assert spend.amount_display == "795500"
    assert spend.display_status == "resolved"
    assert spend.asset_id == "1337"


def test_05_unknown_asset_metadata_unresolved():
    asset = resolve_from_asset_kind({"V3": {"asset_id": {"Concrete": {"interior": {"X2": [{"GeneralIndex": 99999}]}}}}})
    assert asset.display_status == "unresolved"
    assert asset.asset_symbol is None
    assert format_display_amount("1000", asset.decimals) is None


@pytest.mark.asyncio
async def test_10_historical_replay_identity_stable(session_maker):
    fx = _load("treasury_spend201_asset_approved.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("x")
    first = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    async with session_maker() as session:
        await insert_entities_idempotent(session, first["treasury_spends"], session.bind.dialect.name)
        await session.commit()
    second = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    async with session_maker() as session:
        n = await insert_entities_idempotent(
            session, second["treasury_spends"], session.bind.dialect.name
        )
        await session.commit()
        assert n == 0
        assert await session.scalar(select(func.count(TreasurySpend.id))) == 1
        row = (await session.execute(select(TreasurySpend))).scalar_one()
        assert row.event_key == system_event_key(
            fx["block_number"], 0, "Treasury", "AssetSpendApproved", block_hash=fx["block_hash"]
        )
        assert row.amount_display == "795500"
