from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.database import get_db
from src.services.alert_service import AlertService
from pydantic import BaseModel, Field
from src.models.alert import NotificationChannel, AlertRule, AlertHistory
from src.dependencies import get_current_active_user, get_current_project
from src.models.user import User

router = APIRouter()


class ChannelCreate(BaseModel):
    name: str
    type: str = Field(description="email | webhook | telegram")
    config: dict


class RuleCreate(BaseModel):
    name: str
    rule_type: str = Field(description="treasury_threshold | proposal_status_change")
    condition: dict
    channel_id: int


@router.post("/channels", status_code=201)
async def create_channel(
    channel: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = AlertService(db)
    return await service.create_channel(channel.name, channel.type, channel.config, project_id)


@router.get("/channels")
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.project_id == project_id)
    )
    return result.scalars().all()


@router.post("/rules", status_code=201)
async def create_rule(
    rule: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    # Ensure channel belongs to project
    ch = await db.get(NotificationChannel, rule.channel_id)
    if not ch or ch.project_id != project_id:
        raise HTTPException(status_code=400, detail="Invalid channel_id for this project")
    service = AlertService(db)
    return await service.create_rule(
        rule.name, rule.rule_type, rule.condition, rule.channel_id, project_id
    )


@router.get("/rules")
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(select(AlertRule).where(AlertRule.project_id == project_id))
    return result.scalars().all()


@router.get("/history")
async def list_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.project_id == project_id)
        .order_by(AlertHistory.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/trigger")
async def trigger_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = AlertService(db)
    await service.check_alerts(project_id)
    return {"status": "triggered"}
