import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.api_key import ApiKey


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"pk_{secrets.token_hex(24)}"


class ApiKeyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_key(self, project_id: int, name: str = "default") -> Tuple[ApiKey, str]:
        raw = generate_api_key()
        record = ApiKey(
            project_id=project_id,
            name=name,
            key_prefix=raw[:12],
            key_hash=hash_api_key(raw),
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

    async def resolve_project_id(self, raw_key: str) -> Optional[int]:
        digest = hash_api_key(raw_key)
        prefix = raw_key[:12]
        result = await self.db.execute(
            select(ApiKey).where(
                ApiKey.key_prefix == prefix,
                ApiKey.key_hash == digest,
                ApiKey.revoked_at.is_(None),
            )
        )
        key = result.scalars().first()
        return key.project_id if key else None
