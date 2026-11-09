import structlog
import aiosmtplib
from email.message import EmailMessage
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import async_session
from src.services.platform_settings_service import PlatformSettingsService

logger = structlog.get_logger()


async def _resolve_smtp(db: AsyncSession | None = None) -> dict:
    if db is not None:
        try:
            return await PlatformSettingsService(db).get_smtp_effective()
        except Exception as e:
            logger.warning("smtp_settings_resolve_failed", error=str(e))

    try:
        async with async_session() as session:
            return await PlatformSettingsService(session).get_smtp_effective()
    except Exception as e:
        logger.warning("smtp_settings_resolve_failed", error=str(e))
        return {
            "host": settings.SMTP_HOST or "",
            "port": settings.SMTP_PORT,
            "user": settings.SMTP_USER or "",
            "password": settings.SMTP_PASSWORD or "",
            "from_address": settings.SMTP_FROM,
            "use_tls": settings.SMTP_USE_TLS,
            "source": "env",
        }


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send email via SMTP when configured; otherwise log (dev/SAS without SMTP)."""
    cfg = await _resolve_smtp()
    host = (cfg.get("host") or "").strip()
    if not host:
        logger.info(
            "email_not_sent_smtp_unset",
            to=to,
            subject=subject,
            body=body,
        )
        return True

    msg = EmailMessage()
    msg["From"] = cfg.get("from_address") or settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    port = int(cfg.get("port") or 587)
    # Platform setting `use_tls` means STARTTLS (typical for 587).
    # Port 465 uses implicit SSL/TLS from connect (Zoho/Gmail SSL) — not STARTTLS.
    want_starttls = bool(cfg.get("use_tls", True))
    if port == 465:
        use_tls, start_tls = True, False
    else:
        use_tls, start_tls = False, want_starttls

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=(cfg.get("user") or None) or None,
            password=(cfg.get("password") or None) or None,
            use_tls=use_tls,
            start_tls=start_tls,
        )
        logger.info(
            "email_sent",
            to=to,
            subject=subject,
            source=cfg.get("source"),
            port=port,
            use_tls=use_tls,
            start_tls=start_tls,
        )
        return True
    except Exception as e:
        logger.error("email_send_failed", to=to, error=str(e), port=port)
        logger.info("email_fallback_log", to=to, subject=subject, body=body)
        return False
