"""Integrity checks for idempotent replay — detect conflicting payloads on same event_key."""

from __future__ import annotations

from typing import Any


class IntegrityConflictError(RuntimeError):
    """Same event_key already stored with incompatible financial/governance payload."""


# Fields compared per entity type (must match for an expected replay)
PROPOSAL_COMPARE = ("proposal_index", "section", "method", "proposer", "status", "block_number")
VOTE_COMPARE = ("proposal_index", "voter", "vote", "balance", "block_number")
TREASURY_COMPARE = ("beneficiary", "value", "block_number", "asset_id", "source_chain")
EXTRINSIC_COMPARE = ("extrinsic_hash", "module", "call", "signer", "block_number")


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def payload_conflicts(existing, incoming, fields: tuple[str, ...]) -> list[str]:
    diffs = []
    for field in fields:
        left = _norm(getattr(existing, field, None))
        right = _norm(getattr(incoming, field, None))
        if left != right:
            diffs.append(f"{field}: stored={left!r} incoming={right!r}")
    return diffs


def assert_compatible_or_raise(existing, incoming, fields: tuple[str, ...], label: str) -> None:
    diffs = payload_conflicts(existing, incoming, fields)
    if diffs:
        raise IntegrityConflictError(
            f"Integrity conflict on {label} event_key={getattr(incoming, 'event_key', None)}: "
            + "; ".join(diffs)
        )
