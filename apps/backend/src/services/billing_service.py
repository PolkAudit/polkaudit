from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.billing import Plan, Subscription
from src.services.subscription_lifecycle import compute_ends_at


class BillingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_plans(self) -> List[Plan]:
        result = await self.db.execute(select(Plan).where(Plan.is_active.is_(True)))
        return list(result.scalars().all())

    async def get_subscription(self, project_id: int) -> Optional[Subscription]:
        """Prefer active, else past_due (still entitled during grace)."""
        result = await self.db.execute(
            select(Subscription)
            .where(
                Subscription.project_id == project_id,
                Subscription.status.in_(["active", "past_due"]),
            )
            .order_by(Subscription.starts_at.desc())
        )
        return result.scalars().first()

    async def get_plan_for_project(self, project_id: int) -> Optional[Plan]:
        sub = await self.get_subscription(project_id)
        if not sub:
            result = await self.db.execute(select(Plan).where(Plan.slug == "free"))
            return result.scalars().first()
        # active + past_due (grace) keep billed plan entitlements
        result = await self.db.execute(select(Plan).where(Plan.id == sub.plan_id))
        return result.scalars().first()

    async def get_plan_by_slug(self, slug: str) -> Optional[Plan]:
        result = await self.db.execute(select(Plan).where(Plan.slug == slug))
        return result.scalars().first()

    async def set_subscription(
        self,
        project_id: int,
        plan_slug: str,
        status: str = "active",
        billing_note: str | None = None,
        razorpay_payment_link_id: str | None = None,
    ) -> Subscription:
        plan_result = await self.db.execute(select(Plan).where(Plan.slug == plan_slug))
        plan = plan_result.scalars().first()
        if not plan:
            raise ValueError(f"Unknown plan: {plan_slug}")

        # Cancel existing active / past_due subs
        existing_res = await self.db.execute(
            select(Subscription).where(
                Subscription.project_id == project_id,
                Subscription.status.in_(["active", "past_due"]),
            )
        )
        for existing in existing_res.scalars().all():
            existing.status = "cancelled"

        starts = datetime.now(timezone.utc)
        sub = Subscription(
            project_id=project_id,
            plan_id=plan.id,
            status=status,
            billing_note=billing_note,
            razorpay_payment_link_id=razorpay_payment_link_id,
            starts_at=starts,
            ends_at=compute_ends_at(starts, plan.billing_interval) if status == "active" else None,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
