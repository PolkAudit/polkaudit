"""Simple plan entitlement helpers (manual billing era)."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth import get_api_key
from src.services.billing_service import BillingService


async def require_export_entitlement(
    request: Request,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
):
    """
    Soft gate for exports: ensure the resolved project has an active plan.
    Daily counters can be added later; for now we only verify plan exists.
    """
    # Global demo key always allowed (public dashboard)
    if getattr(request.state, "api_key_scope", None) == "global":
        request.state.plan_slug = "demo"
        request.state.export_limit_daily = 1000
        return None

    project_id = getattr(request.state, "project_id", None) or 1
    service = BillingService(db)
    plan = await service.get_plan_for_project(int(project_id))
    if not plan:
        # Pre-migration / no plans seeded — allow with free defaults
        request.state.plan_slug = "free"
        request.state.export_limit_daily = 10
        return None
    if not plan.is_active:
        raise HTTPException(
            status_code=402,
            detail="No active plan for exports. Contact hello@polkaudit.xyz for a pilot.",
        )
    request.state.plan_slug = plan.slug
    request.state.export_limit_daily = plan.export_limit_daily
    return plan
