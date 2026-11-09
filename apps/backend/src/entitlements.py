"""Plan entitlement helpers for paid tenant workspaces."""

from collections import defaultdict
from datetime import timezone, datetime
from threading import Lock

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.auth import get_api_key
from src.services.billing_service import BillingService

# process-local daily export counters (fine for single SAS instance)
_export_counts: dict[tuple[int, str], int] = defaultdict(int)
_export_lock = Lock()


def _today_key() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def record_export_and_check(project_id: int, limit: int) -> int:
    """Increment and return count; raise if over limit."""
    key = (int(project_id), _today_key())
    with _export_lock:
        next_count = _export_counts[key] + 1
        if limit >= 0 and next_count > limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily export limit reached ({limit}). Upgrade plan or try tomorrow.",
            )
        _export_counts[key] = next_count
        return next_count


async def require_export_entitlement(
    request: Request,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
):
    """
    Gate exports on an active subscription plan and enforce daily export caps.
    Global demo API key remains allowed for the public dashboard.
    """
    _ = api_key
    if getattr(request.state, "api_key_scope", None) == "global":
        request.state.plan_slug = "demo"
        request.state.export_limit_daily = 1000
        record_export_and_check(0, 1000)
        return None

    project_id = int(getattr(request.state, "project_id", None) or 1)
    service = BillingService(db)

    sub = await service.get_subscription(project_id)
    if sub and sub.status not in ("active",):
        raise HTTPException(
            status_code=402,
            detail=f"Subscription is {sub.status}. Contact hello@polkaudit.xyz.",
        )

    plan = await service.get_plan_for_project(project_id)
    if not plan:
        request.state.plan_slug = "free"
        request.state.export_limit_daily = 10
        record_export_and_check(project_id, 10)
        return None

    if not plan.is_active:
        raise HTTPException(
            status_code=402,
            detail="Plan is inactive. Contact hello@polkaudit.xyz for a pilot.",
        )

    limit = int(plan.export_limit_daily or 0)
    request.state.plan_slug = plan.slug
    request.state.export_limit_daily = limit
    record_export_and_check(project_id, limit)
    try:
        from src.services.usage_service import UsageService

        await UsageService(db).increment_export(project_id)
    except Exception:
        pass
    return plan
