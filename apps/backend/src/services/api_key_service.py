import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Union

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.api_key import ApiKey

DEFAULT_SCOPES = "read,export,alerts"
ALLOWED_SCOPES = {"read", "export", "alerts"}


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"pk_{secrets.token_hex(24)}"


def normalize_scopes(scopes: Optional[Union[List[str], str]]) -> str:
    if scopes is None:
        return DEFAULT_SCOPES
    if isinstance(scopes, str):
        parts = [p.strip().lower() for p in scopes.split(",") if p.strip()]
    else:
        parts = [str(p).strip().lower() for p in scopes if str(p).strip()]
    filtered = [p for p in parts if p in ALLOWED_SCOPES]
    return ",".join(filtered) if filtered else DEFAULT_SCOPES


class ApiKeyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_key(
        self,
        project_id: int,
        name: str = "default",
        scopes: Optional[Union[List[str], str]] = None,
    ) -> Tuple[ApiKey, str]:
        raw = generate_api_key()
        record = ApiKey(
            project_id=project_id,
            name=name,
            key_prefix=raw[:12],
            key_hash=hash_api_key(raw),
            scopes=normalize_scopes(scopes),
        )
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        return record, raw

    async def list_keys(self, project_id: int) -> List[ApiKey]:
        result = await self.db.execute(
            select(ApiKey)
            .where(ApiKey.project_id == project_id)
            .order_by(ApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke_key(self, project_id: int, key_id: int) -> Optional[ApiKey]:
        result = await self.db.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.project_id == project_id)
        )
        key = result.scalars().first()
        if not key:
            return None
        key.revoked_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(key)
        return key

    async def resolve_key(self, raw_key: str) -> Optional[ApiKey]:
        digest = hash_api_key(raw_key)
        prefix = raw_key[:12]
        result = await self.db.execute(
            select(ApiKey).where(
                ApiKey.key_prefix == prefix,
                ApiKey.key_hash == digest,
                ApiKey.revoked_at.is_(None),
            )
        )
        return result.scalars().first()

    async def resolve_project_id(self, raw_key: str) -> Optional[int]:
        key = await self.resolve_key(raw_key)
        return key.project_id if key else None
