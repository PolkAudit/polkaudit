"""Internal job triggers for schedule runner + subscription lifecycle."""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import get_db, async_session
from src.dependencies import RoleChecker
from src.services.schedule_runner import run_due_schedules
from src.services.subscription_lifecycle import sweep_past_due

router = APIRouter()
allow_admin = RoleChecker(["admin"])


def _authorize_cron(x_cron_secret: Optional[str]) -> None:
    secret = (getattr(settings, "CRON_SECRET", None) or "").strip()
    if secret:
        if not x_cron_secret or x_cron_secret != secret:
            raise HTTPException(status_code=401, detail="Invalid cron secret")
        return
    # No CRON_SECRET configured — require that callers use admin JWT instead


@router.post("/run-schedules", dependencies=[Depends(allow_admin)])
async def admin_run_schedules(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
):
    results = await run_due_schedules(db, force_all=force)
    return {"ran": len(results), "results": results}


@router.post("/run-schedules/cron")
async def cron_run_schedules(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
):
    _authorize_cron(x_cron_secret)
    if not (getattr(settings, "CRON_SECRET", None) or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Set CRON_SECRET to use the cron endpoint, or call /run-schedules as admin",
        )
    results = await run_due_schedules(db, force_all=force)
    return {"ran": len(results), "results": results}


@router.post("/sweep-subscriptions", dependencies=[Depends(allow_admin)])
async def admin_sweep_subscriptions(db: AsyncSession = Depends(get_db)):
    results = await sweep_past_due(db)
    return {"updated": len(results), "results": results}


@router.post("/sweep-subscriptions/cron")
async def cron_sweep_subscriptions(
    db: AsyncSession = Depends(get_db),
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
):
    _authorize_cron(x_cron_secret)
    if not (getattr(settings, "CRON_SECRET", None) or "").strip():
        raise HTTPException(status_code=400, detail="Set CRON_SECRET first")
    results = await sweep_past_due(db)
    return {"updated": len(results), "results": results}


async def background_worker_loop(stop_event: asyncio.Event):
    """Optional in-process poller for single-instance SAS."""
    import structlog

    log = structlog.get_logger()
    interval = int(getattr(settings, "SCHEDULE_WORKER_SECONDS", 900) or 900)
    log.info("schedule_worker_started", interval_seconds=interval)
    while not stop_event.is_set():
        try:
            async with async_session() as db:
                ran = await run_due_schedules(db, force_all=False)
                swept = await sweep_past_due(db)
                if ran or swept:
                    log.info(
                        "schedule_worker_tick",
                        schedules=len(ran),
                        subscriptions=len(swept),
                    )
        except Exception as e:
            log.error("schedule_worker_error", error=str(e))
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
    log.info("schedule_worker_stopped")
