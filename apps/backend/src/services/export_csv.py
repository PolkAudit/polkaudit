"""Shared CSV builders for HTTP export + scheduled jobs."""

import csv
import io
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.proposal import Proposal, TreasurySpend

ExportKind = Literal["proposals", "treasury", "both"]


async def build_proposals_csv(db: AsyncSession, limit: int = 5000) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "index", "block", "section", "method", "proposer", "status"])
    result = await db.execute(
        select(Proposal).order_by(Proposal.proposal_index.desc()).limit(limit)
    )
    for proposal in result.scalars().all():
        writer.writerow(
            [
                proposal.id,
                proposal.proposal_index,
                proposal.block_number,
                proposal.section,
                proposal.method,
                proposal.proposer,
                proposal.status,
            ]
        )
    return buf.getvalue()


async def build_treasury_csv(db: AsyncSession, limit: int = 5000) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "block", "beneficiary", "value_planck"])
    result = await db.execute(
        select(TreasurySpend).order_by(TreasurySpend.block_number.desc()).limit(limit)
    )
    for spend in result.scalars().all():
        writer.writerow([spend.id, spend.block_number, spend.beneficiary, spend.value])
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
