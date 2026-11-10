"""Due-schedule detection + CSV generation + email delivery."""

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.usage import ExportSchedule
from src.services.export_csv import build_export_csv
from src.services.platform_settings_service import PlatformSettingsService
from src.services.usage_service import UsageService
from src.config import settings

logger = structlog.get_logger()


def _is_due(row: ExportSchedule, now: datetime) -> bool:
    if not row.is_active:
        return False
    last = row.last_run_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last is None:
        return True
    cadence = (row.cadence or "weekly").lower()
    if cadence == "daily":
        return now - last >= timedelta(hours=20)
    if cadence == "monthly":
        return now - last >= timedelta(days=27)
    # weekly default
    return now - last >= timedelta(days=6)


async def _send_csv_email(
    *,
    to: str,
    subject: str,
    body: str,
    filename: str,
    csv_text: str,
    db: AsyncSession,
) -> None:
    cfg = await PlatformSettingsService(db).get_smtp_effective()
    host = (cfg.get("host") or "").strip()
    if not host:
        logger.info(
            "schedule_email_skipped_no_smtp",
            to=to,
            subject=subject,
            filename=filename,
            bytes=len(csv_text),
        )
        return

    port = int(cfg.get("port") or 587)
    want_starttls = bool(cfg.get("use_tls", True))
    if port == 465:
        use_tls, start_tls = True, False
    else:
        use_tls, start_tls = False, want_starttls

    msg = EmailMessage()
    msg["From"] = cfg.get("from_address") or settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    msg.add_attachment(
        csv_text.encode("utf-8"),
        maintype="text",
        subtype="csv",
        filename=filename,
    )
    await aiosmtplib.send(
        msg,
        hostname=host,
        port=port,
        username=(cfg.get("user") or None) or None,
        password=(cfg.get("password") or None) or None,
        use_tls=use_tls,
        start_tls=start_tls,
    )


async def run_one_schedule(db: AsyncSession, schedule: ExportSchedule) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    try:
        filename, csv_text = await build_export_csv(db, schedule.export_type)
        try:
            await UsageService(db).increment_export(schedule.project_id)
        except Exception:
            pass

        notify = (schedule.notify_email or "").strip()
        if notify:
            await _send_csv_email(
                to=notify,
                subject=f"PolkAudit scheduled export: {schedule.name}",
                body=(
                    f"Attached is your {schedule.cadence} {schedule.export_type} export "
                    f"for project #{schedule.project_id}.\n"
                ),
                filename=filename,
                csv_text=csv_text,
                db=db,
            )
        else:
            logger.info(
                "schedule_run_no_notify",
                schedule_id=schedule.id,
                filename=filename,
                bytes=len(csv_text),
            )

        schedule.last_run_at = now
        schedule.last_status = "ok"
        schedule.last_error = None
        await db.commit()
        await db.refresh(schedule)
        return {
            "schedule_id": schedule.id,
            "status": "ok",
            "filename": filename,
            "bytes": len(csv_text),
            "emailed": bool(notify),
        }
    except Exception as e:
        logger.error("schedule_run_failed", schedule_id=schedule.id, error=str(e))
        schedule.last_run_at = now
        schedule.last_status = "error"
        schedule.last_error = str(e)[:500]
        await db.commit()
        return {"schedule_id": schedule.id, "status": "error", "error": str(e)}


async def run_due_schedules(db: AsyncSession, *, force_all: bool = False) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    result = await db.execute(select(ExportSchedule).where(ExportSchedule.is_active == 1))
    rows = list(result.scalars().all())
    out: list[dict[str, Any]] = []
    for row in rows:
        if force_all or _is_due(row, now):
            out.append(await run_one_schedule(db, row))
    return out
