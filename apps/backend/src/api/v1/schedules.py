from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.dependencies import get_current_active_user, get_current_project
from src.models.user import User
from src.models.usage import ExportSchedule
from src.services.schedule_runner import run_one_schedule

router = APIRouter()


class ScheduleCreate(BaseModel):
    name: str = "weekly-exports"
    export_type: str = Field(default="proposals", pattern="^(proposals|treasury|both)$")
    cadence: str = Field(default="weekly", pattern="^(daily|weekly|monthly)$")
    notify_email: Optional[EmailStr] = None


class ScheduleResponse(BaseModel):
    id: int
    project_id: int
    name: str
    export_type: str
    cadence: str
    is_active: bool
    notify_email: Optional[str] = None
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None

    class Config:
        from_attributes = True


def _to_response(r: ExportSchedule) -> ScheduleResponse:
    return ScheduleResponse(
        id=r.id,
        project_id=r.project_id,
        name=r.name,
        export_type=r.export_type,
        cadence=r.cadence,
        is_active=bool(r.is_active),
        notify_email=r.notify_email,
        last_run_at=r.last_run_at,
        last_status=r.last_status,
        last_error=r.last_error,
    )


@router.get("/", response_model=List[ScheduleResponse])
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(ExportSchedule).where(ExportSchedule.project_id == project_id)
    )
    return [_to_response(r) for r in result.scalars().all()]


@router.post("/", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    row = ExportSchedule(
        project_id=project_id,
        name=body.name,
        export_type=body.export_type,
        cadence=body.cadence,
        notify_email=str(body.notify_email) if body.notify_email else None,
        is_active=1,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.post("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(ExportSchedule).where(
            ExportSchedule.id == schedule_id,
            ExportSchedule.project_id == project_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    row.is_active = 0 if row.is_active else 1
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.post("/{schedule_id}/run")
async def run_schedule_now(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(ExportSchedule).where(
            ExportSchedule.id == schedule_id,
            ExportSchedule.project_id == project_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return await run_one_schedule(db, row)


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    result = await db.execute(
        select(ExportSchedule).where(
            ExportSchedule.id == schedule_id,
            ExportSchedule.project_id == project_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.execute(delete(ExportSchedule).where(ExportSchedule.id == schedule_id))
    await db.commit()
    return None
