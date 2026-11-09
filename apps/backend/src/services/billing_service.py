from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.billing import Plan, Subscription


class BillingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_plans(self) -> List[Plan]:
        result = await self.db.execute(select(Plan).where(Plan.is_active.is_(True)))
        return list(result.scalars().all())

    async def get_subscription(self, project_id: int) -> Optional[Subscription]:
        result = await self.db.execute(
            select(Subscription)
            .where(Subscription.project_id == project_id, Subscription.status == "active")
            .order_by(Subscription.starts_at.desc())
        )
        return result.scalars().first()

    async def get_plan_for_project(self, project_id: int) -> Optional[Plan]:
        sub = await self.get_subscription(project_id)
        if not sub:
            # Default free plan
            result = await self.db.execute(select(Plan).where(Plan.slug == "free"))
            return result.scalars().first()
        result = await self.db.execute(select(Plan).where(Plan.id == sub.plan_id))
        return result.scalars().first()

    async def set_subscription(
        self,
        project_id: int,
        plan_slug: str,
        status: str = "active",
        billing_note: str | None = None,
    ) -> Subscription:
        plan_result = await self.db.execute(select(Plan).where(Plan.slug == plan_slug))
        plan = plan_result.scalars().first()
        if not plan:
            raise ValueError(f"Unknown plan: {plan_slug}")

        # Cancel existing active subs
        existing = await self.get_subscription(project_id)
        if existing:
            existing.status = "cancelled"

        sub = Subscription(
            project_id=project_id,
            plan_id=plan.id,
            status=status,
            billing_note=billing_note,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
