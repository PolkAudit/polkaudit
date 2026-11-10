"""Idempotent insert helpers and contiguous coverage cursor management."""

from __future__ import annotations

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .integrity import (
    IntegrityConflictError,
    assert_compatible_or_raise,
    PROPOSAL_COMPARE,
    VOTE_COMPARE,
    TREASURY_COMPARE,
    EXTRINSIC_COMPARE,
)
from .models import (
    Extrinsic,
    Proposal,
    Vote,
    TreasurySpend,
    Block,
    ProcessedBlock,
    IndexerCursor,
)


def _insert(table, dialect_name: str):
    if dialect_name == "postgresql":
        return pg_insert(table)
    return sqlite_insert(table)


COMPARE_BY_TABLE = {
    "proposals": (Proposal, PROPOSAL_COMPARE),
    "votes": (Vote, VOTE_COMPARE),
    "treasury_spends": (TreasurySpend, TREASURY_COMPARE),
    "extrinsics": (Extrinsic, EXTRINSIC_COMPARE),
}


async def upsert_block(session, block: Block, dialect_name: str) -> None:
    # Conflict on block_number with different hash is an integrity failure
    existing = await session.scalar(
        select(Block).where(Block.block_number == block.block_number)
    )
    if existing is not None:
        if existing.block_hash != block.block_hash:
            raise IntegrityConflictError(
                f"Block {block.block_number} hash conflict: "
                f"stored={existing.block_hash} incoming={block.block_hash}"
            )
        return
    stmt = (
        _insert(Block.__table__, dialect_name)
        .values(
            block_number=block.block_number,
            block_hash=block.block_hash,
            parent_hash=block.parent_hash,
            events_count=block.events_count,
            extrinsics_count=block.extrinsics_count,
        )
        .on_conflict_do_nothing(index_elements=["block_number"])
    )
    await session.execute(stmt)


async def insert_entities_idempotent(
    session, entities: list, dialect_name: str, conflict_column: str = "event_key"
) -> int:
    """Insert rows; identical replay is a no-op; conflicting payload raises.

    Never silently discards a legitimate new key. Never silently accepts a
    conflicting payload for an existing key.
    """
    if not entities:
        return 0

    table_name = entities[0].__table__.name
    model, compare_fields = COMPARE_BY_TABLE[table_name]
    inserted = 0

    for ent in entities:
        key = getattr(ent, conflict_column)
        if not key:
            raise IntegrityConflictError(f"{table_name} row missing {conflict_column}")

        existing = await session.scalar(select(model).where(getattr(model, conflict_column) == key))
        if existing is not None:
            assert_compatible_or_raise(existing, ent, compare_fields, table_name)
            continue  # expected replay

        session.add(ent)
        inserted += 1
        # Flush so subsequent entities in the same batch see prior keys
        await session.flush()

    return inserted


async def insert_extrinsics_idempotent(session, extrinsics: list[Extrinsic], dialect_name: str) -> int:
    if not extrinsics:
        return 0
    return await insert_entities_idempotent(session, extrinsics, dialect_name, "event_key")


def coverage_status(cursor: IndexerCursor | None) -> dict:
    """Distinguish forward progress, verified contiguous coverage, and historical gaps."""
    if cursor is None:
        return {
            "forward_progress": None,
            "verified_contiguous_range": None,
            "historical_gaps": [],
            "claims_full_history": False,
        }

    gaps = list(cursor.historical_gaps or [])
    # Implicit gap below range_start when coverage does not begin at genesis
    if cursor.range_start > 1:
        below = {"start": 1, "end": int(cursor.range_start) - 1, "reason": "below_verified_range"}
        if not any(g.get("start") == 1 and g.get("end") == below["end"] for g in gaps):
            gaps = [below, *gaps]

    claims_full = (
        int(cursor.range_start) <= 1
        and not gaps
        and bool(cursor.coverage_complete)
    )
    return {
        "forward_progress": int(cursor.contiguous_through),
        "verified_contiguous_range": [int(cursor.range_start), int(cursor.contiguous_through)],
        "historical_gaps": gaps,
        "claims_full_history": claims_full,
    }


async def bootstrap_cursor_from_processed(session) -> IndexerCursor | None:
    """Initialize singleton cursor without claiming false full-history coverage."""
    existing = await session.get(IndexerCursor, 1)
    if existing:
        return existing

    stats = await session.execute(
        select(
            func.min(ProcessedBlock.block_number),
            func.max(ProcessedBlock.block_number),
            func.count(ProcessedBlock.block_number),
        )
    )
    min_bn, max_bn, count = stats.one()
    if max_bn is None:
        return None

    span = int(max_bn) - int(min_bn) + 1
    gaps: list[dict] = []
    if int(count) == span:
        range_start = int(min_bn)
        contiguous_through = int(max_bn)
    else:
        # Gaps inside [min,max] — only certify tip height; record unknown interior gap
        range_start = int(max_bn)
        contiguous_through = int(max_bn)
        gaps.append(
            {
                "start": int(min_bn),
                "end": int(max_bn) - 1,
                "reason": "non_dense_processed_blocks",
            }
        )

    cursor = IndexerCursor(
        id=1,
        range_start=range_start,
        contiguous_through=contiguous_through,
        historical_gaps=gaps,
        coverage_complete=False,
    )
    session.add(cursor)
    await session.flush()
    return cursor


async def advance_cursor(session, block_number: int, range_start: int | None = None) -> IndexerCursor:
    """Advance contiguous_through only when block_number == contiguous_through + 1 (or new segment)."""
    cursor = await session.get(IndexerCursor, 1)
    if cursor is None:
        start = range_start if range_start is not None else block_number
        if block_number != start:
            raise RuntimeError(
                f"Cannot initialize cursor at {block_number}; expected range start {start}"
            )
        gaps = []
        if start > 1:
            gaps.append({"start": 1, "end": start - 1, "reason": "below_verified_range"})
        cursor = IndexerCursor(
            id=1,
            range_start=start,
            contiguous_through=block_number,
            historical_gaps=gaps,
            coverage_complete=False,
        )
        session.add(cursor)
        return cursor

    if range_start is not None:
        if block_number != range_start:
            raise RuntimeError(
                f"New range must begin at range_start={range_start}, got {block_number}"
            )
        gaps = list(cursor.historical_gaps or [])
        if range_start > 1:
            below = {"start": 1, "end": range_start - 1, "reason": "below_verified_range"}
            if not any(g.get("reason") == "below_verified_range" for g in gaps):
                gaps.append(below)
        # If we abandoned a prior tip segment above the new start, record it as a gap
        if cursor.contiguous_through >= range_start:
            # rewind case handled by deletes; keep gaps explicit
            pass
        cursor.range_start = range_start
        cursor.contiguous_through = block_number
        cursor.historical_gaps = gaps
        cursor.coverage_complete = False
        return cursor

    expected = cursor.contiguous_through + 1
    if block_number != expected:
        raise RuntimeError(
            f"Contiguity violation: expected block {expected}, got {block_number} "
            f"(range_start={cursor.range_start}, contiguous_through={cursor.contiguous_through})"
        )
    cursor.contiguous_through = block_number
    return cursor
