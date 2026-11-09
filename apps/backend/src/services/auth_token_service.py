import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.auth_token import AuthToken
from src.models.user import User
from src.services.mailer import send_email
from src.config import settings


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AuthTokenService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def issue(
        self, user: User, purpose: str, ttl_hours: int = 24
    ) -> str:
        raw = secrets.token_urlsafe(32)
        token = AuthToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=_hash_token(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
        )
        self.db.add(token)
        await self.db.commit()
        return raw

    async def consume(self, raw: str, purpose: str) -> Optional[User]:
        digest = _hash_token(raw)
        result = await self.db.execute(
            select(AuthToken).where(
                AuthToken.token_hash == digest,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
            )
        )
        token = result.scalars().first()
        if not token:
            return None
        expires = token.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            return None
        token.used_at = datetime.now(timezone.utc)
        user = await self.db.get(User, token.user_id)
        await self.db.commit()
        return user

    async def send_verify_email(self, user: User) -> None:
        raw = await self.issue(user, "verify_email", ttl_hours=48)
        link = f"{settings.APP_PUBLIC_URL.rstrip('/')}/verify-email?token={raw}"
        await send_email(
            user.email,
            "Verify your PolkAudit email",
            f"Welcome to PolkAudit.\n\nVerify your email:\n{link}\n\nThis link expires in 48 hours.\n",
        )

    async def send_reset_password(self, user: User) -> None:
        raw = await self.issue(user, "reset_password", ttl_hours=2)
        link = f"{settings.APP_PUBLIC_URL.rstrip('/')}/reset-password?token={raw}"
        await send_email(
            user.email,
            "Reset your PolkAudit password",
            f"Reset your password:\n{link}\n\nIf you did not request this, ignore this email.\nLink expires in 2 hours.\n",
        )
