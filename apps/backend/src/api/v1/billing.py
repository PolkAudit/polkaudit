from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.dependencies import get_current_active_user, get_current_project, RoleChecker
from src.models.user import User
from src.services.billing_service import BillingService

router = APIRouter()
allow_admin = RoleChecker(["admin"])


class PlanResponse(BaseModel):
    id: int
    slug: str
    name: str
    export_limit_daily: int
    retention_blocks: int

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    id: int
    project_id: int
    plan_id: int
    status: str
    billing_note: Optional[str] = None
    starts_at: Optional[datetime] = None
    plan: Optional[PlanResponse] = None

    class Config:
        from_attributes = True


class SetSubscriptionRequest(BaseModel):
    project_id: int
    plan_slug: str = Field(pattern="^(free|pilot|pro)$")
    status: str = "active"
    billing_note: Optional[str] = None


@router.get("/plans", response_model=List[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    service = BillingService(db)
    return await service.list_plans()


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = BillingService(db)
    sub = await service.get_subscription(project_id)
    plan = await service.get_plan_for_project(project_id)
    if not sub:
        # Synthetic free entitlement
        return SubscriptionResponse(
            id=0,
            project_id=project_id,
            plan_id=plan.id if plan else 0,
            status="active",
            billing_note="default free",
            plan=PlanResponse.model_validate(plan) if plan else None,
        )
    return SubscriptionResponse(
        id=sub.id,
        project_id=sub.project_id,
        plan_id=sub.plan_id,
        status=sub.status,
        billing_note=sub.billing_note,
        starts_at=sub.starts_at,
        plan=PlanResponse.model_validate(plan) if plan else None,
    )


@router.post("/subscription", response_model=SubscriptionResponse, dependencies=[Depends(allow_admin)])
async def admin_set_subscription(
    body: SetSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
):
    service = BillingService(db)
    try:
        sub = await service.set_subscription(
            body.project_id, body.plan_slug, body.status, body.billing_note
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    plan = await service.get_plan_for_project(body.project_id)
    return SubscriptionResponse(
        id=sub.id,
        project_id=sub.project_id,
        plan_id=sub.plan_id,
        status=sub.status,
        billing_note=sub.billing_note,
        starts_at=sub.starts_at,
        plan=PlanResponse.model_validate(plan) if plan else None,
    )
