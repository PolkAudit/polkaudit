import hashlib
import hmac
from typing import Any, Optional

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger()

RAZORPAY_API = "https://api.razorpay.com/v1"


class RazorpayService:
    @property
    def enabled(self) -> bool:
        return settings.razorpay_enabled

    def _auth(self) -> tuple[str, str]:
        assert settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET
        return (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)

    async def create_payment_link(
        self,
        *,
        amount_paise: int,
        description: str,
        customer_email: str,
        notes: dict[str, str],
        callback_url: str,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("Razorpay is not configured")

        payload = {
            "amount": amount_paise,
            "currency": "INR",
            "accept_partial": False,
            "description": description,
            "customer": {"email": customer_email},
            "notify": {"sms": False, "email": True},
            "reminder_enable": True,
            "notes": notes,
            "callback_url": callback_url,
            "callback_method": "get",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{RAZORPAY_API}/payment_links",
                json=payload,
                auth=self._auth(),
            )
            if res.status_code >= 400:
                logger.error(
                    "razorpay_payment_link_failed",
                    status=res.status_code,
                    body=res.text,
                )
                raise RuntimeError(f"Razorpay error: {res.status_code}")
            return res.json()

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        secret = settings.RAZORPAY_WEBHOOK_SECRET
        if not secret:
            logger.warning("razorpay_webhook_secret_unset")
            return False
        expected = hmac.new(
            secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_paid_link(self, event: dict[str, Any]) -> Optional[dict[str, str]]:
        """Extract project_id / plan_slug from payment_link.paid (or payment.captured notes)."""
        payload = event.get("payload") or {}
        link = (payload.get("payment_link") or {}).get("entity") or {}
        notes = link.get("notes") or {}
        if not notes:
            payment = (payload.get("payment") or {}).get("entity") or {}
            notes = payment.get("notes") or {}
        project_id = notes.get("project_id")
        plan_slug = notes.get("plan_slug")
        if not project_id or not plan_slug:
            return None
        return {
            "project_id": str(project_id),
            "plan_slug": str(plan_slug),
            "payment_link_id": str(link.get("id") or ""),
            "event_id": str(event.get("id") or ""),
        }
