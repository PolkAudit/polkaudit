from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.database import get_db
from src.auth import get_api_key
from src.entitlements import require_export_entitlement
from src.models.proposal import Proposal, TreasurySpend
import csv
import io

router = APIRouter()

@router.get("/proposals/csv")
async def export_proposals_csv(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
    _plan=Depends(require_export_entitlement),
):
    async def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "index", "block", "section", "method", "proposer", "status"])
        output.seek(0)
        yield output.read()

        result = await db.stream(select(Proposal).order_by(Proposal.proposal_index.desc()))
        async for row in result:
             proposal = row[0]
             output = io.StringIO()
             writer = csv.writer(output)
             writer.writerow([
                 proposal.id, 
                 proposal.proposal_index, 
                 proposal.block_number, 
                 proposal.section, 
                 proposal.method, 
                 proposal.proposer,
                 proposal.status
             ])
             output.seek(0)
             yield output.read()

    return StreamingResponse(iter_csv(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=proposals.csv"})


@router.get("/treasury/csv")
async def export_treasury_csv(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
    _plan=Depends(require_export_entitlement),
):
    async def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "block", "beneficiary", "value_planck"])
        output.seek(0)
        yield output.read()

        result = await db.stream(
            select(TreasurySpend).order_by(TreasurySpend.block_number.desc())
        )
        async for row in result:
            spend = row[0]
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([spend.id, spend.block_number, spend.beneficiary, spend.value])
            output.seek(0)
            yield output.read()

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=treasury.csv"},
    )
