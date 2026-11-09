import json
from typing import List, Optional, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.dependencies import get_current_active_user, get_current_project, RoleChecker
from src.models.user import User
from src.models.billing import PaymentEvent
from src.services.billing_service import BillingService
from src.services.razorpay_service import RazorpayService
from src.config import settings

router = APIRouter()
allow_admin = RoleChecker(["admin"])


class PlanResponse(BaseModel):
    id: int
    slug: str
    name: str
    export_limit_daily: int
    retention_blocks: int
    price_inr_paise: int = 0

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


class CheckoutRequest(BaseModel):
    plan_slug: str = Field(pattern="^(pilot|pro)$")


class CheckoutResponse(BaseModel):
    mode: str  # razorpay | manual
    checkout_url: Optional[str] = None
    contact: Optional[str] = None
    plan_slug: Optional[str] = None
    amount_inr_paise: Optional[int] = None


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


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    service = BillingService(db)
    plan = await service.get_plan_by_slug(body.plan_slug)
    if not plan or not plan.is_active:
        raise HTTPException(status_code=400, detail="Unknown plan")
    amount = plan.price_inr_paise or 0
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Plan is not billable via checkout")

    rz = RazorpayService()
    if not rz.enabled:
        return CheckoutResponse(
            mode="manual",
            contact="hello@polkaudit.xyz",
            plan_slug=body.plan_slug,
            amount_inr_paise=amount,
        )

    try:
        link = await rz.create_payment_link(
            amount_paise=amount,
            description=f"PolkAudit {plan.name} plan",
            customer_email=current_user.email,
            notes={
                "project_id": str(project_id),
                "plan_slug": body.plan_slug,
                "user_id": str(current_user.id),
            },
            callback_url=f"{settings.APP_PUBLIC_URL.rstrip('/')}/settings",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    link_id = link.get("id")
    # Remember link on current subscription row (best-effort)
    sub = await service.get_subscription(project_id)
    if sub and link_id:
        sub.razorpay_payment_link_id = link_id
        await db.commit()

    return CheckoutResponse(
        mode="razorpay",
        checkout_url=link.get("short_url"),
        plan_slug=body.plan_slug,
        amount_inr_paise=amount,
    )


@router.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
):
    body = await request.body()
    rz = RazorpayService()
    if not x_razorpay_signature or not rz.verify_webhook_signature(body, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event: dict[str, Any] = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event.get("event") or ""
    event_id = event.get("id")

    # Idempotency: skip duplicate event ids
    if event_id:
        existing = await db.execute(
            select(PaymentEvent).where(PaymentEvent.event_id == str(event_id))
        )
        if existing.scalars().first():
            return {"status": "ok", "deduped": True}

    paid = None
    if event_type in ("payment_link.paid", "payment.captured"):
        paid = rz.parse_paid_link(event)

    project_id: Optional[int] = None
    if paid:
        try:
            project_id = int(paid["project_id"])
            plan_slug = paid["plan_slug"]
            service = BillingService(db)
            await service.set_subscription(
                project_id,
                plan_slug,
                status="active",
                billing_note=f"razorpay:{paid.get('payment_link_id') or event_id}",
                razorpay_payment_link_id=paid.get("payment_link_id") or None,
            )
        except (ValueError, KeyError) as e:
            # Log via payment_events even on parse failure below
            project_id = None
            _ = e

    db.add(
        PaymentEvent(
            provider="razorpay",
            event_id=str(event_id) if event_id else None,
            event_type=event_type,
            project_id=project_id,
            payload=event,
        )
    )
    await db.commit()
    return {"status": "ok"}
