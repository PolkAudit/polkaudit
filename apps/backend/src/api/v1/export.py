from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth import get_api_key, require_api_scopes
from src.entitlements import require_export_entitlement
from src.services.plan_rate_limit import enforce_plan_rate_limit
from src.services.export_csv import build_proposals_csv, build_treasury_csv

router = APIRouter(
    dependencies=[
        Depends(enforce_plan_rate_limit),
        Depends(require_api_scopes("export")),
    ]
)


@router.get("/proposals/csv")
async def export_proposals_csv(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
    _plan=Depends(require_export_entitlement),
):
    _ = api_key
    csv_text = await build_proposals_csv(db)

    async def iter_csv():
        yield csv_text

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=proposals.csv"},
    )


@router.get("/treasury/csv")
async def export_treasury_csv(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
    _plan=Depends(require_export_entitlement),
):
    _ = api_key
    csv_text = await build_treasury_csv(db)

    async def iter_csv():
        yield csv_text

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=treasury.csv"},
    )
