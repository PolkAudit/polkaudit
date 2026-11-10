"""Deterministic chain-derived event identities for idempotent indexing.

Business identity (e.g. referendum index / proposal_index) is separate from
on-chain event identity (event_key). Lifecycle transitions are distinct events.

Key format (v2) embeds chain id + finalized block hash so the same height on a
fork/wrong-hash cannot collide with the canonical finalized identity:

  {chain}/{block_hash}/{block_number}:x:{extrinsic_index}:{Pallet}.{call}[:leaf:N]
  {chain}/{block_hash}/{block_number}:e:{event_index}:{Pallet}.{Event}

Legacy Stage A keys (without chain/hash prefix) remain readable but are no longer
produced by the parser. Migration backfill uses `legacy:…` synthetic keys.
"""

from __future__ import annotations

DEFAULT_CHAIN_ID = "polkadot"


def normalize_block_hash(block_hash: str) -> str:
    h = (block_hash or "").strip().lower()
    if not h.startswith("0x"):
        h = "0x" + h
    return h


def _prefix(chain_id: str, block_hash: str, block_number: int) -> str:
    return f"{chain_id}/{normalize_block_hash(block_hash)}/{int(block_number)}"


def extrinsic_event_key(
    block_number: int,
    extrinsic_index: int,
    module: str,
    method: str,
    *,
    block_hash: str,
    chain_id: str = DEFAULT_CHAIN_ID,
    leaf_index: int | None = None,
) -> str:
    """Identity for a record derived from an extrinsic (or nested leaf call)."""
    base = (
        f"{_prefix(chain_id, block_hash, block_number)}"
        f":x:{extrinsic_index}:{module}.{method}"
    )
    if leaf_index is None:
        return base
    return f"{base}:leaf:{leaf_index}"


def system_event_key(
    block_number: int,
    event_index: int,
    module: str,
    method: str,
    *,
    block_hash: str,
    chain_id: str = DEFAULT_CHAIN_ID,
) -> str:
    """Identity for a record derived from a System.Events entry."""
    return (
        f"{_prefix(chain_id, block_hash, block_number)}"
        f":e:{event_index}:{module}.{method}"
    )


def block_identity(block_number: int, block_hash: str, chain_id: str = DEFAULT_CHAIN_ID) -> dict:
    """Chain identity for a finalized block (enforced by unique columns)."""
    return {
        "chain_id": chain_id,
        "block_number": block_number,
        "block_hash": normalize_block_hash(block_hash),
    }


def is_legacy_event_key(event_key: str | None) -> bool:
    return bool(event_key) and (
        event_key.startswith("legacy:") or event_key.count(":") < 3 or "/" not in event_key
    )
