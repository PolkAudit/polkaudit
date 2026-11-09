from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.usage import UsageCounter
from src.services.billing_service import BillingService

# Landing-aligned monthly API call quotas (approx midpoints of plan intent)
MONTHLY_API_QUOTA = {
    "free": 1_000,
    "pilot": 20_000,
    "starter": 5_000,
    "pro": 100_000,
    "enterprise": 0,  # 0 = unlimited
    "demo": 0,
}


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


class UsageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_or_create(self, project_id: int, period: str | None = None) -> UsageCounter:
        period = period or current_period()
        result = await self.db.execute(
            select(UsageCounter).where(
                UsageCounter.project_id == project_id,
                UsageCounter.period == period,
            )
        )
        row = result.scalars().first()
        if row:
            return row
        row = UsageCounter(
            project_id=project_id,
            period=period,
            api_calls=0,
            export_calls=0,
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def increment_api(self, project_id: int, n: int = 1) -> UsageCounter:
        row = await self._get_or_create(project_id)
        row.api_calls = int(row.api_calls or 0) + n
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def increment_export(self, project_id: int, n: int = 1) -> UsageCounter:
        row = await self._get_or_create(project_id)
        row.export_calls = int(row.export_calls or 0) + n
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def get_usage_summary(self, project_id: int) -> dict:
        period = current_period()
        row = await self._get_or_create(project_id, period)
        billing = BillingService(self.db)
        plan = await billing.get_plan_for_project(project_id)
        slug = (plan.slug if plan else "free") or "free"
        quota = MONTHLY_API_QUOTA.get(slug, MONTHLY_API_QUOTA["free"])
        api_calls = int(row.api_calls or 0)
        return {
            "project_id": project_id,
            "period": period,
            "plan_slug": slug,
            "api_calls": api_calls,
            "export_calls": int(row.export_calls or 0),
            "api_quota_monthly": quota,
            "api_remaining": None if quota == 0 else max(quota - api_calls, 0),
            "unlimited": quota == 0,
        }

    async def assert_within_monthly_quota(self, project_id: int) -> None:
        from fastapi import HTTPException

        summary = await self.get_usage_summary(project_id)
        quota = summary["api_quota_monthly"]
        if quota == 0:
            return
        if summary["api_calls"] >= quota:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Monthly API quota reached ({quota}/month for plan "
                    f"{summary['plan_slug']}). Upgrade or wait until next month."
                ),
            )
