import structlog
import aiosmtplib
from email.message import EmailMessage
from src.config import settings

logger = structlog.get_logger()


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send email via SMTP when configured; otherwise log (dev/SAS without SMTP)."""
    if not settings.SMTP_HOST:
        logger.info(
            "email_not_sent_smtp_unset",
            to=to,
            subject=subject,
            body=body,
        )
        return True

    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("email_sent", to=to, subject=subject)
        return True
    except Exception as e:
        logger.error("email_send_failed", to=to, error=str(e))
        # Still log body so ops can recover the magic link
        logger.info("email_fallback_log", to=to, subject=subject, body=body)
        return False
