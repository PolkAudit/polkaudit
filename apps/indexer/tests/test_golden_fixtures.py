"""Validate parser against recorded Polkadot golden fixtures (no live RPC)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from src.parser import ChainParser
from src.identity import system_event_key, extrinsic_event_key

FIXTURES = Path(__file__).parent / "fixtures" / "golden"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_golden_ref1674_submitted():
    fx = _load("ref1674_submit_and_vote.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    result = parser.parse_block(
        fx["block_number"],
        [],
        events=fx["parser_events"],
        block_hash=fx["block_hash"],
        chain_id=fx["chain_id"],
    )
    props = [p for p in result["proposals"] if p.proposal_index == 1674]
    assert len(props) == 1
    p = props[0]
    assert p.method == "Submitted"
    assert p.status == "Proposed"
    assert p.event_key == system_event_key(
        fx["block_number"],
        61,
        "Referenda",
        "Submitted",
        block_hash=fx["block_hash"],
    )
    # Voted event in same fixture lacks poll_index — must not invent proposal_index=0
    assert all(v.proposal_index != 0 or v.event_key for v in result["votes"])
    assert result["votes"] == []  # skipped without poll_index


def test_golden_ref1674_confirmed_lifecycle():
    fx = _load("ref1674_confirmed.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    result = parser.parse_block(
        fx["block_number"],
        [],
        events=fx["parser_events"],
        block_hash=fx["block_hash"],
    )
    # Fixture includes Confirmed for 1674 and 1673
    by_idx = {p.proposal_index: p for p in result["proposals"]}
    assert 1674 in by_idx
    assert by_idx[1674].method == "Confirmed"
    assert by_idx[1674].status == "Approved"
    assert by_idx[1674].event_key == system_event_key(
        fx["block_number"], 3, "Referenda", "Confirmed", block_hash=fx["block_hash"]
    )


def test_golden_ref1676_submitted():
    fx = _load("ref1676_submitted.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    result = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    assert len(result["proposals"]) == 1
    assert result["proposals"][0].proposal_index == 1676


def test_golden_treasury_asset_spend_approved():
    fx = _load("treasury_spend201_asset_approved.json")
    parser = ChainParser(substrate=MagicMock())
    parser.substrate.decode_scale.side_effect = Exception("offline")
    result = parser.parse_block(
        fx["block_number"], [], events=fx["parser_events"], block_hash=fx["block_hash"]
    )
    spends = result["treasury_spends"]
    assert len(spends) == 1
    assert spends[0].value == "795500000000"
    assert "0xa26556769ad6581b7beb103590a5c378955244aa349bbacc2f148c51205e055a" in spends[0].beneficiary
    assert spends[0].event_key == system_event_key(
        fx["block_number"],
        0,
        "Treasury",
        "AssetSpendApproved",
        block_hash=fx["block_hash"],
    )


def test_golden_vote_via_extrinsic_poll1666():
    """Vote identity comes from extrinsic call args (event lacks poll_index on Polkadot)."""
    fx = _load("vote_extrinsic_poll1666.json")
    parser = ChainParser(substrate=MagicMock())

    class Scale:
        def __init__(self, value):
            self.value = value

    call = fx["call"]
    parser.substrate.decode_scale.return_value = Scale(
        {
            "address": "11fx8xKPNd4zVSBxkpN8qhhaGEmNJvPgKqwhDATZQXs7dkM",
            "extrinsic_hash": "0xvote",
            "call": call,
        }
    )
    result = parser.parse_block(
        fx["block_number"],
        ["0xvotehex"],
        events=[],
        block_hash=fx["block_hash"],
    )
    assert len(result["votes"]) == 1
    vote = result["votes"][0]
    assert vote.proposal_index == 1666
    assert vote.vote == "Nay"
    assert vote.balance == "100000000000"
    assert vote.event_key == extrinsic_event_key(
        fx["block_number"],
        0,  # only one hex in list → index 0 in this offline replay
        "ConvictionVoting",
        "vote",
        block_hash=fx["block_hash"],
    )
