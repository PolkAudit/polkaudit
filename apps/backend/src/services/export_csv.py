"""Shared CSV builders for HTTP export + scheduled jobs."""

import csv
import io
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.proposal import Proposal, TreasurySpend
from src.money import from_spend_row
from src.services.governance import lifecycle_sort_key

ExportKind = Literal["proposals", "treasury", "both"]


async def build_proposals_csv(db: AsyncSession, limit: int = 5000) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["id", "index", "block", "section", "method", "proposer", "status", "event_index"]
    )
    result = await db.execute(
        select(Proposal)
        .where(Proposal.proposal_index.is_not(None))
        .order_by(Proposal.proposal_index.desc(), Proposal.block_number.asc())
        .limit(limit)
    )
    rows = list(result.scalars().all())
    # Export canonical latest per index for consumer clarity
    by_index: dict[int, list] = {}
    for p in rows:
        by_index.setdefault(int(p.proposal_index), []).append(p)
    canonical = []
    for group in by_index.values():
        group.sort(key=lifecycle_sort_key)
        canonical.append(group[-1])
    canonical.sort(key=lambda p: int(p.proposal_index or 0), reverse=True)

    for proposal in canonical[:limit]:
        writer.writerow(
            [
                proposal.id,
                proposal.proposal_index,
                proposal.block_number,
                proposal.section,
                proposal.method,
                proposal.proposer,
                proposal.status,
                proposal.event_index,
            ]
        )
    return buf.getvalue()


async def build_treasury_csv(db: AsyncSession, limit: int = 5000) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "block",
            "beneficiary",
            "amount_raw",
            "source_chain",
            "asset_id",
            "asset_symbol",
            "decimals",
            "amount_display",
            "display_status",
        ]
    )
    result = await db.execute(
        select(TreasurySpend).order_by(TreasurySpend.block_number.desc()).limit(limit)
    )
    for spend in result.scalars().all():
        amt = from_spend_row(spend)
        writer.writerow(
            [
                spend.id,
                spend.block_number,
                spend.beneficiary,
                amt.amount_raw,
                amt.source_chain or "",
                amt.asset_id or "",
                amt.asset_symbol or "",
                "" if amt.decimals is None else amt.decimals,
                amt.amount_display or "",
                amt.display_status,
            ]
        )
    return buf.getvalue()


async def build_export_csv(db: AsyncSession, export_type: str) -> tuple[str, str]:
    """Return (filename, csv_text) for proposals | treasury | both."""
    kind = (export_type or "proposals").lower()
    if kind == "treasury":
        return "treasury.csv", await build_treasury_csv(db)
    if kind == "both":
        proposals = await build_proposals_csv(db)
        treasury = await build_treasury_csv(db)
        combined = (
            "# proposals\n"
            + proposals
            + "\n# treasury\n"
            + treasury
        )
        return "governance-export.csv", combined
    return "proposals.csv", await build_proposals_csv(db)
