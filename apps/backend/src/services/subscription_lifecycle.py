"""Subscription period ends + past_due / grace handling."""

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.billing import Plan, Subscription

logger = structlog.get_logger()

# Days after ends_at before cancelling (past_due grace)
GRACE_DAYS = 7


def compute_ends_at(starts_at: datetime, billing_interval: str | None) -> datetime | None:
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    interval = (billing_interval or "month").lower()
    if interval == "month":
        return starts_at + timedelta(days=30)
    if interval == "once_3mo":
        return starts_at + timedelta(days=90)
    if interval == "custom":
        return None
    return starts_at + timedelta(days=30)


async def apply_period_end(
    db: AsyncSession, sub: Subscription, plan: Plan | None = None
) -> Subscription:
    """Set ends_at from plan interval when activating."""
    if plan is None:
        plan = await db.get(Plan, sub.plan_id)
    starts = sub.starts_at or datetime.now(timezone.utc)
    sub.ends_at = compute_ends_at(starts, plan.billing_interval if plan else "month")
    await db.commit()
    await db.refresh(sub)
    return sub


async def sweep_past_due(db: AsyncSession) -> list[dict[str, Any]]:
    """Mark expired active subs past_due; after grace, cancel + leave free default."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription).where(Subscription.status.in_(["active", "past_due"]))
    )
    rows = list(result.scalars().all())
    out: list[dict[str, Any]] = []
    for sub in rows:
        ends = sub.ends_at
        if ends is None:
            continue
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        if sub.status == "active" and now > ends:
            sub.status = "past_due"
            note = (sub.billing_note or "").strip()
            marker = f"[past_due {now.date().isoformat()}]"
            sub.billing_note = f"{note}\n{marker}".strip() if note else marker
            await db.commit()
            out.append({"subscription_id": sub.id, "project_id": sub.project_id, "action": "past_due"})
            logger.info("subscription_past_due", project_id=sub.project_id, sub_id=sub.id)
        elif sub.status == "past_due" and now > ends + timedelta(days=GRACE_DAYS):
            sub.status = "cancelled"
            note = (sub.billing_note or "").strip()
            marker = f"[cancelled after grace {now.date().isoformat()}]"
            sub.billing_note = f"{note}\n{marker}".strip() if note else marker
            await db.commit()
            out.append({"subscription_id": sub.id, "project_id": sub.project_id, "action": "cancelled"})
            logger.info("subscription_grace_expired", project_id=sub.project_id, sub_id=sub.id)
    return out
