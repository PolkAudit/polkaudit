#!/usr/bin/env python3
"""Exercise backend service/API code paths against isolated P0-2C database.

Uses the same services the HTTP routes call (StatsService, GovernanceService,
export CSV builders). Full uvicorn may require a complete venv; this verifies
API model compatibility and response payloads without shared infra.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["DATABASE_URL"] = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://localhost/polkaudit_p02c_e2e"
)
os.environ.setdefault("API_KEY", "p02c-local-e2e-key")


async def main():
    from src.database import async_session, engine
    from src.services.stats import StatsService
    from src.services.governance import GovernanceService
    from src.services.export_csv import build_proposals_csv, build_treasury_csv
    from src.schemas.proposal import ProposalResponse
    from src.schemas.treasury import TreasurySpendResponse
    from src.schemas.vote import VoteResponse
    from sqlalchemy import select
    from src.models.proposal import TreasurySpend

    out = Path(os.environ.get("P02C_OUT", "p02c_api_verify.json"))
    report: dict = {"database_url_host": "localhost", "database": "polkaudit_p02c_e2e"}

    async with async_session() as db:
        stats = await StatsService(db).get_overview()
        report["stats"] = stats.model_dump()

        gov = GovernanceService(db)
        proposals = await gov.get_proposals(limit=50)
        report["proposals_list"] = [
            ProposalResponse.model_validate(p).model_dump() for p in proposals
        ]
        detail_1674 = await gov.get_proposal_detail(1674)
        report["proposal_1674_detail"] = (
            detail_1674.model_dump() if detail_1674 else None
        )
        votes_1666 = await gov.get_votes_for_proposal(1666)
        report["votes_for_1666"] = [VoteResponse.model_validate(v).model_dump() for v in votes_1666]

        spends = (await db.execute(select(TreasurySpend).limit(20))).scalars().all()
        report["treasury_list"] = [
            TreasurySpendResponse.model_validate(s).model_dump() for s in spends
        ]

        proposals_csv = await build_proposals_csv(db)
        treasury_csv = await build_treasury_csv(db)
        report["proposals_csv_header"] = proposals_csv.splitlines()[0]
        report["proposals_csv_rows"] = len(proposals_csv.strip().splitlines()) - 1
        report["treasury_csv_header"] = treasury_csv.splitlines()[0]
        report["treasury_csv_sample"] = treasury_csv.strip().splitlines()[1:][:3]
        report["treasury_csv_notes_units"] = (
            "Header is value_planck; AssetSpendApproved amount is asset raw units "
            "(USDC 6dp for spend #201), not DOT planck."
        )

        # Genuine API semantics note: get_proposal returns .first() by proposal_index
        first_1674 = await gov.get_proposal(1674)
        report["proposal_1674_first_method"] = first_1674.method if first_1674 else None
        report["defect_notes"] = [
            "Multiple rows share proposal_index=1674 (Submitted + Confirmed); "
            "detail/first() is non-deterministic without ORDER BY.",
            "Spurious proposal_index=2 rows from Referenda.submit extrinsic fallback "
            "appear in list/CSV alongside true referendum indices.",
        ]

    out.write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps({
        "stats": report["stats"],
        "proposals": len(report["proposals_list"]),
        "treasury": len(report["treasury_list"]),
        "votes_1666": len(report["votes_for_1666"]),
        "proposal_1674_first_method": report["proposal_1674_first_method"],
        "wrote": str(out),
    }, indent=2))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
