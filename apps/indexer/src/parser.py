import structlog
from substrateinterface import SubstrateInterface
from .config import settings
from .identity import extrinsic_event_key, system_event_key, DEFAULT_CHAIN_ID
from .assets import (
    format_display_amount,
    resolve_from_asset_kind,
    resolve_native_dot,
)
from .models import Proposal, Vote, TreasurySpend, Extrinsic


logger = structlog.get_logger()

# Polkadot OpenGov + legacy governance calls we index
GOVERNANCE_PROPOSAL_CALLS = {
    ("Democracy", "propose"),
    ("Democracy", "second"),
    ("Referenda", "submit"),
    ("Referenda", "submit_unsigned"),
    ("Referenda", "place_decision_deposit"),
    ("Referenda", "decide"),
}

GOVERNANCE_VOTE_CALLS = {
    ("Democracy", "vote"),
    ("ConvictionVoting", "vote"),
    ("ConvictionVoting", "remove_vote"),
    ("ConvictionVoting", "delegate"),
}

TREASURY_SPEND_CALLS = {
    ("Treasury", "spend"),
    ("Treasury", "spend_local"),
    ("Treasury", "propose_spend"),
    ("Treasury", "approve_proposal"),
    ("Treasury", "payout"),
    ("Spender", "spend"),
    ("Spender", "spend_local"),
}

# Nested call wrappers that hide the real governance/treasury call
WRAPPER_CALLS = {
    ("Utility", "batch"),
    ("Utility", "batch_all"),
    ("Utility", "force_batch"),
    ("Utility", "as_derivative"),
    ("Utility", "with_weight"),
    ("Proxy", "proxy"),
    ("Proxy", "proxy_announced"),
    ("Multisig", "as_multi"),
    ("Multisig", "approve_as_multi"),
}

# System events that confirm governance outcomes (module, event)
GOVERNANCE_EVENTS = {
    ("Referenda", "Submitted"),
    ("Referenda", "DecisionStarted"),
    ("Referenda", "Confirmed"),
    ("Referenda", "Approved"),
    ("Referenda", "Rejected"),
    ("Referenda", "TimedOut"),
    ("Referenda", "Cancelled"),
    ("Democracy", "Proposed"),
    ("Democracy", "Started"),
    ("Democracy", "Passed"),
    ("Democracy", "NotPassed"),
    ("ConvictionVoting", "Voted"),
    ("Treasury", "SpendApproved"),
    ("Treasury", "AssetSpendApproved"),
    ("Treasury", "Awarded"),
    ("Treasury", "Proposed"),
}


def empty_parse_result() -> dict:
    return {
        "proposals": [],
        "votes": [],
        "treasury_spends": [],
        "extrinsics": [],
    }


def call_args_to_dict(call: dict) -> dict:
    """Normalize substrate call_args into a flat name -> value dict."""
    result = {}
    for item in call.get("call_args") or []:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name is not None:
            result[name] = item.get("value")
    return result


def extrinsic_hash(extrinsic_value: dict, block_number: int, index: int) -> str:
    if extrinsic_value.get("extrinsic_hash"):
        return str(extrinsic_value["extrinsic_hash"])
    return f"{block_number}-{index}"


def signer_address(extrinsic_value: dict) -> str | None:
    address = extrinsic_value.get("address")
    return str(address) if address is not None else None


def _normalize_vote_value(vote_value) -> str:
    if vote_value is None:
        return "unknown"
    if isinstance(vote_value, dict):
        if "Aye" in vote_value:
            return "Aye"
        if "Nay" in vote_value:
            return "Nay"
        # Modern AccountVote / Vote types: {"aye": bool, "conviction": ...}
        if "aye" in vote_value and isinstance(vote_value.get("aye"), bool):
            return "Aye" if vote_value["aye"] else "Nay"
        if "nay" in vote_value and isinstance(vote_value.get("nay"), bool):
            return "Nay" if vote_value["nay"] else "Aye"
        if "Standard" in vote_value:
            inner = vote_value["Standard"]
            if isinstance(inner, dict):
                vote_bit = inner.get("vote")
                if isinstance(vote_bit, int):
                    return "Aye" if vote_bit & 0x80 else "Nay"
                return _normalize_vote_value(vote_bit if vote_bit is not None else inner.get("vote"))
        if "Split" in vote_value:
            return "Split"
        if "SplitAbstain" in vote_value:
            return "SplitAbstain"
        keys = list(vote_value.keys())
        return keys[0] if keys else str(vote_value)
    return str(vote_value)


def _extract_nested_calls(call: dict) -> list[dict]:
    """Flatten Utility/Proxy/Multisig wrappers into leaf calls."""
    if not call:
        return []
    module = call.get("call_module", "")
    function = call.get("call_function", "")
    key = (module, function)
    args = call_args_to_dict(call)

    if key in WRAPPER_CALLS:
        nested: list[dict] = []
        # Utility.batch* → calls: [...]
        calls = args.get("calls")
        if isinstance(calls, list):
            for c in calls:
                if isinstance(c, dict):
                    nested.extend(_extract_nested_calls(c))
            return nested or [call]
        # Proxy.proxy / Utility.as_derivative → call: {...}
        inner = args.get("call")
        if isinstance(inner, dict):
            return _extract_nested_calls(inner) or [call]
    return [call]


class ChainParser:
    """Decodes block extrinsics (+ optional events) into governance records."""

    def __init__(self, substrate: SubstrateInterface | None = None):
        self._substrate = substrate

    @property
    def substrate(self) -> SubstrateInterface:
        if self._substrate is None:
            logger.info("Initializing SubstrateInterface", url=settings.SUBSTRATE_RPC_URL)
            self._substrate = SubstrateInterface(
                url=settings.SUBSTRATE_RPC_URL,
                type_registry_preset="polkadot",
            )
            logger.info("SubstrateInterface initialized successfully")
        return self._substrate

    def parse_block(
        self,
        block_number: int,
        extrinsics: list,
        events: list | None = None,
        block_hash: str | None = None,
        chain_id: str = DEFAULT_CHAIN_ID,
    ) -> dict:
        """
        Decode extrinsics and extract:
        - Proposals (Democracy, Referenda/OpenGov)
        - Votes (Democracy, ConvictionVoting)
        - Treasury spends
        - All decoded extrinsics (audit trail)
        Optionally merge confirmed governance from system events.

        block_hash is required for chain-derived event_key identity. When omitted
        (legacy unit tests), a synthetic hash `0xblock{number}` is used so keys
        remain deterministic offline.
        """
        results = empty_parse_result()
        bhash = block_hash or f"0xblock{int(block_number)}"

        for idx, ext_hex in enumerate(extrinsics):
            try:
                extrinsic = self.substrate.decode_scale(
                    "Extrinsic", ext_hex, return_scale_obj=True
                )
                self._process_decoded_extrinsic(
                    results, block_number, idx, extrinsic.value, bhash, chain_id
                )
            except Exception as exc:
                logger.debug(
                    "Failed to decode extrinsic",
                    block_number=block_number,
                    index=idx,
                    error=str(exc),
                )

        if events:
            self._process_events(results, block_number, events, bhash, chain_id)

        return results

    def _process_decoded_extrinsic(
        self,
        results: dict,
        block_number: int,
        index: int,
        extrinsic_value: dict,
        block_hash: str,
        chain_id: str,
    ) -> None:
        call = extrinsic_value.get("call") or {}
        call_module = call.get("call_module", "Unknown")
        call_function = call.get("call_function", "unknown")
        args = call_args_to_dict(call)
        signer = signer_address(extrinsic_value)
        ext_key = extrinsic_event_key(
            block_number,
            index,
            call_module,
            call_function,
            block_hash=block_hash,
            chain_id=chain_id,
        )

        results["extrinsics"].append(
            Extrinsic(
                block_number=block_number,
                extrinsic_index=index,
                event_key=ext_key,
                extrinsic_hash=extrinsic_hash(extrinsic_value, block_number, index),
                module=call_module,
                call=call_function,
                signer=signer,
                args=args or None,
                success="True",
            )
        )

        leaf_calls = _extract_nested_calls(call)
        multi_leaf = len(leaf_calls) > 1
        for leaf_i, leaf in enumerate(leaf_calls):
            self._classify_call(
                results,
                block_number,
                index,
                leaf,
                signer,
                block_hash,
                chain_id,
                leaf_index=leaf_i if multi_leaf else None,
            )

    def _classify_call(
        self,
        results: dict,
        block_number: int,
        index: int,
        call: dict,
        signer: str | None,
        block_hash: str,
        chain_id: str,
        leaf_index: int | None = None,
    ) -> None:
        call_module = call.get("call_module", "Unknown")
        call_function = call.get("call_function", "unknown")
        args = call_args_to_dict(call)
        key = (call_module, call_function)
        event_key = extrinsic_event_key(
            block_number,
            index,
            call_module,
            call_function,
            block_hash=block_hash,
            chain_id=chain_id,
            leaf_index=leaf_index,
        )

        if key in GOVERNANCE_PROPOSAL_CALLS:
            proposal = self._build_proposal(
                block_number,
                index,
                call_module,
                call_function,
                signer,
                args,
                event_key=event_key,
            )
            if proposal is not None:
                results["proposals"].append(proposal)
            else:
                logger.info(
                    "Skipped proposal without authoritative on-chain index",
                    block=block_number,
                    extrinsic_index=index,
                    call=f"{call_module}.{call_function}",
                )
        elif key in GOVERNANCE_VOTE_CALLS:
            results["votes"].append(
                self._build_vote(
                    block_number,
                    call_module,
                    call_function,
                    signer,
                    args,
                    extrinsic_index=index,
                    event_key=event_key,
                    leaf_index=leaf_index,
                )
            )
        elif key in TREASURY_SPEND_CALLS:
            spend = self._build_treasury_spend(
                block_number,
                args,
                extrinsic_index=index,
                event_key=event_key,
            )
            if spend:
                results["treasury_spends"].append(spend)

    def _process_events(
        self,
        results: dict,
        block_number: int,
        events: list,
        block_hash: str,
        chain_id: str,
    ) -> None:
        """Supplement extrinsic parsing with system events (distinct event_key per index)."""
        seen_submit_refs = {
            p.proposal_index
            for p in results["proposals"]
            if p.method in ("submit", "submit_unsigned", "Submitted", "propose")
        }

        for event_index, ev in enumerate(events):
            try:
                event = ev.get("event") if isinstance(ev, dict) else None
                if event is None and isinstance(ev, dict):
                    event = ev
                if not isinstance(event, dict):
                    continue

                module = (
                    event.get("module_id")
                    or event.get("event_module")
                    or event.get("pallet")
                    or ""
                )
                event_id = (
                    event.get("event_id")
                    or event.get("event_method")
                    or event.get("method")
                    or ""
                )
                key = (str(module), str(event_id))
                if key not in GOVERNANCE_EVENTS:
                    continue

                attrs = event.get("attributes") or event.get("params") or {}
                if isinstance(attrs, list):
                    attr_dict = {}
                    for item in attrs:
                        if isinstance(item, dict) and "name" in item:
                            attr_dict[item["name"]] = item.get("value")
                    attrs = attr_dict
                if not isinstance(attrs, dict):
                    attrs = {}

                ekey = system_event_key(
                    block_number,
                    event_index,
                    str(module),
                    str(event_id),
                    block_hash=block_hash,
                    chain_id=chain_id,
                )

                if module == "Referenda" and event_id == "Submitted":
                    idx = attrs.get("index") or attrs.get("ref_index")
                    if idx is not None and int(idx) not in seen_submit_refs:
                        results["proposals"].append(
                            Proposal(
                                proposal_index=int(idx),
                                event_key=ekey,
                                block_number=block_number,
                                event_index=event_index,
                                source="event",
                                section="Referenda",
                                method="Submitted",
                                proposer=str(attrs.get("who") or attrs.get("proposer") or "unknown"),
                                args=attrs,
                                status="Proposed",
                            )
                        )
                        seen_submit_refs.add(int(idx))
                elif module == "ConvictionVoting" and event_id == "Voted":
                    poll = (
                        attrs.get("poll_index")
                        or attrs.get("ref_index")
                        or attrs.get("index")
                    )
                    # Polkadot Voted attributes may omit poll_index; do not invent 0.
                    if poll is None:
                        logger.debug(
                            "Voted event missing poll_index; skipping event path",
                            block=block_number,
                            event_index=event_index,
                        )
                        continue
                    balance = attrs.get("balance") or attrs.get("amount")
                    vote_raw = attrs.get("vote")
                    if balance is None and isinstance(vote_raw, dict):
                        standard = vote_raw.get("Standard")
                        if isinstance(standard, dict):
                            balance = standard.get("balance")
                    results["votes"].append(
                        Vote(
                            proposal_index=int(poll),
                            event_key=ekey,
                            block_number=block_number,
                            event_index=event_index,
                            source="event",
                            voter=str(attrs.get("who") or attrs.get("voter") or "unknown"),
                            vote=_normalize_vote_value(vote_raw),
                            balance=str(balance or "0"),
                        )
                    )
                elif module == "Treasury" and event_id in (
                    "Awarded",
                    "SpendApproved",
                    "AssetSpendApproved",
                ):
                    beneficiary = attrs.get("beneficiary") or attrs.get("who")
                    amount = attrs.get("amount") or attrs.get("value") or attrs.get("award")
                    if beneficiary is not None and amount is not None:
                        if event_id == "AssetSpendApproved":
                            asset = resolve_from_asset_kind(attrs.get("asset_kind"))
                        else:
                            asset = resolve_native_dot()
                        raw = str(amount)
                        results["treasury_spends"].append(
                            TreasurySpend(
                                event_key=ekey,
                                block_number=block_number,
                                event_index=event_index,
                                source="event",
                                beneficiary=str(beneficiary),
                                value=raw,
                                source_chain=asset.source_chain,
                                asset_id=asset.asset_id,
                                asset_symbol=asset.asset_symbol,
                                decimals=asset.decimals,
                                amount_display=format_display_amount(raw, asset.decimals),
                                display_status=asset.display_status,
                            )
                        )
                elif module == "Referenda" and event_id in (
                    "Confirmed",
                    "Approved",
                    "Rejected",
                    "TimedOut",
                    "Cancelled",
                ):
                    idx = attrs.get("index") or attrs.get("ref_index")
                    status_map = {
                        "Confirmed": "Approved",
                        "Approved": "Approved",
                        "Rejected": "Rejected",
                        "TimedOut": "Rejected",
                        "Cancelled": "Rejected",
                    }
                    if idx is not None:
                        results["proposals"].append(
                            Proposal(
                                proposal_index=int(idx),
                                event_key=ekey,
                                block_number=block_number,
                                event_index=event_index,
                                source="event",
                                section="Referenda",
                                method=event_id,
                                proposer=str(attrs.get("who") or "unknown"),
                                args=attrs,
                                status=status_map.get(event_id, event_id),
                            )
                        )
            except Exception as exc:
                logger.debug("Failed to process event", block=block_number, error=str(exc))

    def _build_proposal(
        self,
        block_number: int,
        index: int,
        module: str,
        method: str,
        signer: str | None,
        args: dict,
        *,
        event_key: str,
    ) -> Proposal | None:
        """Build a proposal only when an authoritative on-chain index is present.

        Never substitute extrinsic index for referendum/proposal identity.
        """
        ref_index = args.get("ref_index") or args.get("poll_index") or args.get("index")
        if ref_index is None:
            # Explicit unsupported case — wait for System.Events (e.g. Referenda.Submitted)
            return None

        return Proposal(
            proposal_index=int(ref_index),
            event_key=event_key,
            block_number=block_number,
            extrinsic_index=index,
            source="extrinsic",
            section=module,
            method=method,
            proposer=signer or "unknown",
            args=args or None,
            status="Proposed",
        )

    def _build_vote(
        self,
        block_number: int,
        module: str,
        method: str,
        signer: str | None,
        args: dict,
        *,
        extrinsic_index: int,
        event_key: str,
        leaf_index: int | None = None,
    ) -> Vote:
        ref_index = (
            args.get("poll_index")
            or args.get("ref_index")
            or args.get("index")
            or 0
        )

        vote_value = args.get("vote")
        if vote_value is None and method == "remove_vote":
            vote_value = "removed"

        balance = args.get("balance") or args.get("amount")
        if balance is None and isinstance(args.get("vote"), dict):
            standard = args["vote"].get("Standard") if isinstance(args["vote"], dict) else None
            if isinstance(standard, dict):
                balance = standard.get("balance")

        return Vote(
            proposal_index=int(ref_index) if ref_index is not None else 0,
            event_key=event_key,
            block_number=block_number,
            extrinsic_index=extrinsic_index,
            source="extrinsic",
            voter=signer or "unknown",
            vote=_normalize_vote_value(vote_value),
            balance=str(balance or "0"),
        )

    def _build_treasury_spend(
        self,
        block_number: int,
        args: dict,
        *,
        extrinsic_index: int,
        event_key: str,
    ) -> TreasurySpend | None:
        beneficiary = args.get("beneficiary")
        amount = args.get("amount") or args.get("value") or args.get("award")
        # approve_proposal only has proposal_id — skip without amount
        if beneficiary is None or amount is None:
            return None

        # Extrinsic spend/spend_local are native DOT unless asset_kind present
        if args.get("asset_kind") is not None:
            asset = resolve_from_asset_kind(args.get("asset_kind"))
        else:
            asset = resolve_native_dot()
        raw = str(amount)
        return TreasurySpend(
            event_key=event_key,
            block_number=block_number,
            extrinsic_index=extrinsic_index,
            source="extrinsic",
            beneficiary=str(beneficiary),
            value=raw,
            source_chain=asset.source_chain,
            asset_id=asset.asset_id,
            asset_symbol=asset.asset_symbol,
            decimals=asset.decimals,
            amount_display=format_display_amount(raw, asset.decimals),
            display_status=asset.display_status,
        )
