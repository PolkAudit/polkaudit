"""Per-project RPM limits + monthly API quota metering."""

from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import get_api_key
from src.database import get_db
from src.services.billing_service import BillingService
from src.services.usage_service import UsageService

PLAN_RPM = {
    "free": 30,
    "pilot": 120,
    "starter": 60,
    "pro": 300,
    "enterprise": 600,
    "demo": 600,
}

_counts: dict[tuple[str, str], int] = defaultdict(int)
_lock = Lock()


def _minute_bucket() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M")


def check_and_increment(bucket_key: str, limit: int) -> int:
    key = (bucket_key, _minute_bucket())
    with _lock:
        nxt = _counts[key] + 1
        if limit > 0 and nxt > limit:
            raise HTTPException(
                status_code=429,
                detail=f"Plan rate limit exceeded ({limit}/minute). Upgrade for higher throughput.",
            )
        _counts[key] = nxt
        if len(_counts) > 5000:
            current = _minute_bucket()
            stale = [k for k in _counts if k[1] != current]
            for k in stale[:4000]:
                _counts.pop(k, None)
        return nxt


async def enforce_plan_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
):
    _ = api_key
    scope = getattr(request.state, "api_key_scope", None) or "project"
    project_id = int(getattr(request.state, "project_id", None) or 0)

    if scope == "global":
        slug = "demo"
        limit = PLAN_RPM["demo"]
        bucket = "global"
        meter_project = 0
    else:
        service = BillingService(db)
        plan = await service.get_plan_for_project(project_id or 1)
        slug = (plan.slug if plan else "free") or "free"
        limit = PLAN_RPM.get(slug, PLAN_RPM["free"])
        bucket = f"project:{project_id or 1}"
        meter_project = project_id or 1

    request.state.plan_slug = slug
    request.state.rate_limit_rpm = limit
    check_and_increment(bucket, limit)

    if meter_project > 0:
        usage = UsageService(db)
        await usage.assert_within_monthly_quota(meter_project)
        try:
            await usage.increment_api(meter_project)
        except Exception:
            # metering must not break reads if DB hiccups
            pass
    return None
