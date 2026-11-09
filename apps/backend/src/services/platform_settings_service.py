from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.platform_setting import PlatformSetting

SMTP_KEY = "smtp"


def _env_smtp() -> dict[str, Any]:
    return {
        "host": settings.SMTP_HOST or "",
        "port": settings.SMTP_PORT,
        "user": settings.SMTP_USER or "",
        "password": settings.SMTP_PASSWORD or "",
        "from_address": settings.SMTP_FROM,
        "use_tls": settings.SMTP_USE_TLS,
        "source": "env",
    }


class PlatformSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_raw(self, key: str) -> Optional[dict[str, Any]]:
        result = await self.db.execute(
            select(PlatformSetting).where(PlatformSetting.key == key)
        )
        row = result.scalars().first()
        if not row or not isinstance(row.value, dict):
            return None
        return dict(row.value)

    async def upsert(self, key: str, value: dict[str, Any]) -> dict[str, Any]:
        result = await self.db.execute(
            select(PlatformSetting).where(PlatformSetting.key == key)
        )
        row = result.scalars().first()
        if row:
            row.value = value
        else:
            row = PlatformSetting(key=key, value=value)
            self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return dict(row.value)

    async def get_smtp_effective(self) -> dict[str, Any]:
        """DB overrides env when host is set in platform_settings."""
        stored = await self.get_raw(SMTP_KEY)
        env = _env_smtp()
        if not stored or not (stored.get("host") or "").strip():
            return env
        return {
            "host": (stored.get("host") or "").strip(),
            "port": int(stored.get("port") or 587),
            "user": (stored.get("user") or "").strip(),
            "password": stored.get("password") or "",
            "from_address": (stored.get("from_address") or env["from_address"]).strip(),
            "use_tls": bool(stored.get("use_tls", True)),
            "source": "database",
        }

    async def get_smtp_public(self) -> dict[str, Any]:
        """Safe for admin GET — never returns raw password."""
        cfg = await self.get_smtp_effective()
        password = cfg.get("password") or ""
        return {
            "host": cfg.get("host") or "",
            "port": int(cfg.get("port") or 587),
            "user": cfg.get("user") or "",
            "from_address": cfg.get("from_address") or "",
            "use_tls": bool(cfg.get("use_tls", True)),
            "source": cfg.get("source") or "env",
            "configured": bool((cfg.get("host") or "").strip()),
            "password_set": bool(password),
        }

    async def save_smtp(
        self,
        *,
        host: str,
        port: int,
        user: str,
        from_address: str,
        use_tls: bool,
        password: Optional[str] = None,
        clear_password: bool = False,
    ) -> dict[str, Any]:
        existing = await self.get_raw(SMTP_KEY) or {}
        next_password = existing.get("password") or ""
        if clear_password:
            next_password = ""
        elif password is not None and password != "":
            next_password = password

        port_i = int(port)
        # use_tls = STARTTLS. Port 465 is implicit SSL — never STARTTLS.
        starttls = False if port_i == 465 else bool(use_tls)
        value = {
            "host": host.strip(),
            "port": port_i,
            "user": user.strip(),
            "password": next_password,
            "from_address": from_address.strip(),
            "use_tls": starttls,
        }
        await self.upsert(SMTP_KEY, value)
        return await self.get_smtp_public()
