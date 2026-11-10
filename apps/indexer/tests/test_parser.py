"""Unit tests for ChainParser — no RPC connection required."""

from unittest.mock import MagicMock

import pytest

from src.parser import (
    ChainParser,
    call_args_to_dict,
    empty_parse_result,
    extrinsic_hash,
)
from src.models import Extrinsic, Proposal, TreasurySpend, Vote


def _mock_extrinsic(*, module: str, function: str, args: list | None = None, address="5GrwvaEF...") -> dict:
    return {
        "address": address,
        "extrinsic_hash": "0xabc123",
        "call": {
            "call_module": module,
            "call_function": function,
            "call_args": args or [],
        },
    }


def _mock_scale_obj(value: dict) -> MagicMock:
    obj = MagicMock()
    obj.value = value
    return obj


class TestParserHelpers:
    def test_call_args_to_dict(self):
        call = {
            "call_args": [
                {"name": "poll_index", "value": 42},
                {"name": "vote", "value": {"Aye": 1}},
            ]
        }
        assert call_args_to_dict(call) == {"poll_index": 42, "vote": {"Aye": 1}}

    def test_extrinsic_hash_fallback(self):
        assert extrinsic_hash({}, 100, 3) == "100-3"

    def test_extrinsic_hash_from_value(self):
        assert extrinsic_hash({"extrinsic_hash": "0xdead"}, 100, 3) == "0xdead"


class TestChainParser:
    @pytest.fixture
    def parser(self):
        mock_substrate = MagicMock()
        return ChainParser(substrate=mock_substrate), mock_substrate

    def test_empty_block_returns_empty_lists(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.side_effect = Exception("invalid hex")

        result = chain_parser.parse_block(100, ["0x00", "0x01"])

        assert result == empty_parse_result()

    def test_stores_extrinsic_on_successful_decode(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(module="System", function="remark", args=[])
        )

        result = chain_parser.parse_block(200, ["0xdeadbeef"])

        assert len(result["extrinsics"]) == 1
        ext = result["extrinsics"][0]
        assert isinstance(ext, Extrinsic)
        assert ext.module == "System"
        assert ext.call == "remark"
        assert ext.block_number == 200
        assert ext.extrinsic_hash == "0xabc123"
        assert result["proposals"] == []
        assert result["votes"] == []

    def test_conviction_voting_vote(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(
                module="ConvictionVoting",
                function="vote",
                args=[
                    {"name": "poll_index", "value": 99},
                    {"name": "vote", "value": {"Aye": 1}},
                ],
            )
        )

        result = chain_parser.parse_block(300, ["0x01"])

        assert len(result["votes"]) == 1
        vote = result["votes"][0]
        assert isinstance(vote, Vote)
        assert vote.proposal_index == 99
        assert vote.voter.startswith("5Grwva")
        assert len(result["extrinsics"]) == 1

    def test_referenda_submit_creates_proposal(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(
                module="Referenda",
                function="submit",
                args=[{"name": "ref_index", "value": 7}],
            )
        )

        result = chain_parser.parse_block(400, ["0x02"])

        assert len(result["proposals"]) == 1
        proposal = result["proposals"][0]
        assert isinstance(proposal, Proposal)
        assert proposal.section == "Referenda"
        assert proposal.method == "submit"
        assert proposal.proposal_index == 7
        assert proposal.status == "Proposed"

    def test_treasury_spend(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(
                module="Treasury",
                function="spend",
                args=[
                    {"name": "beneficiary", "value": "5FHneW46..."},
                    {"name": "amount", "value": 1_000_000_000_000},
                ],
            )
        )

        result = chain_parser.parse_block(500, ["0x03"])

        assert len(result["treasury_spends"]) == 1
        spend = result["treasury_spends"][0]
        assert isinstance(spend, TreasurySpend)
        assert spend.beneficiary == "5FHneW46..."
        assert spend.value == "1000000000000"

    def test_legacy_democracy_propose(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(module="Democracy", function="propose", args=[])
        )

        result = chain_parser.parse_block(600, ["0x04"])

        # No fabricated proposal_index — Democracy.propose without index is skipped
        assert result["proposals"] == []
        assert len(result["extrinsics"]) == 1

    def test_legacy_democracy_propose_with_index(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(
                module="Democracy",
                function="propose",
                args=[{"name": "index", "value": 3}],
            )
        )
        result = chain_parser.parse_block(601, ["0x05"])
        assert len(result["proposals"]) == 1
        assert result["proposals"][0].proposal_index == 3
        assert result["proposals"][0].section == "Democracy"

    def test_decode_failure_does_not_store_extrinsic(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.side_effect = ValueError("bad scale data")

        result = chain_parser.parse_block(700, ["0xbad"])

        assert result["extrinsics"] == []

    def test_mixed_block_extrinsics(self, parser):
        chain_parser, mock_substrate = parser

        def decode_side_effect(_type, ext_hex, return_scale_obj=True):
            if ext_hex == "0xvote":
                return _mock_scale_obj(
                    _mock_extrinsic(
                        module="ConvictionVoting",
                        function="vote",
                        args=[{"name": "poll_index", "value": 1}, {"name": "vote", "value": "Aye"}],
                    )
                )
            return _mock_scale_obj(_mock_extrinsic(module="System", function="remark"))

        mock_substrate.decode_scale.side_effect = decode_side_effect

        result = chain_parser.parse_block(800, ["0xvote", "0xremark"])

        assert len(result["extrinsics"]) == 2
        assert len(result["votes"]) == 1

    def test_utility_batch_unwraps_vote(self, parser):
        chain_parser, mock_substrate = parser
        inner_vote = {
            "call_module": "ConvictionVoting",
            "call_function": "vote",
            "call_args": [
                {"name": "poll_index", "value": 12},
                {"name": "vote", "value": {"Aye": True}},
            ],
        }
        mock_substrate.decode_scale.return_value = _mock_scale_obj(
            _mock_extrinsic(
                module="Utility",
                function="batch_all",
                args=[{"name": "calls", "value": [inner_vote]}],
            )
        )

        result = chain_parser.parse_block(900, ["0xbatch"])

        assert len(result["votes"]) == 1
        assert result["votes"][0].proposal_index == 12
        assert result["votes"][0].vote == "Aye"

    def test_event_referenda_submitted(self, parser):
        chain_parser, mock_substrate = parser
        mock_substrate.decode_scale.side_effect = Exception("no ext")

        events = [
            {
                "event": {
                    "module_id": "Referenda",
                    "event_id": "Submitted",
                    "attributes": {"index": 55, "who": "5ABC"},
                }
            }
        ]
        result = chain_parser.parse_block(1000, [], events=events)

        assert len(result["proposals"]) == 1
        assert result["proposals"][0].proposal_index == 55
        assert result["proposals"][0].method == "Submitted"
        assert result["proposals"][0].event_key.endswith(":e:0:Referenda.Submitted")
        assert "polkadot/" in result["proposals"][0].event_key
        assert result["proposals"][0].source == "event"
