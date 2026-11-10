from typing import Callable, List

from fastapi import Security, HTTPException, status, Request, Depends
from fastapi.security.api_key import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=True)

ALL_SCOPES = ("read", "export", "alerts")


def parse_scopes(raw: str | None) -> set[str]:
    if not raw:
        return set(ALL_SCOPES)
    parts = {p.strip().lower() for p in raw.split(",") if p.strip()}
    return parts or set(ALL_SCOPES)


async def get_api_key(
    request: Request,
    api_key: str = Security(api_key_header),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept either:
    - Global demo/settings API_KEY (legacy MVP), or
    - A per-project key (pk_...) stored hashed in api_keys
    """
    if api_key == settings.API_KEY:
        request.state.project_id = getattr(request.state, "project_id", None) or 1
        request.state.api_key_scope = "global"
        request.state.api_key_scopes = set(ALL_SCOPES)
        return api_key

    from src.services.api_key_service import ApiKeyService

    service = ApiKeyService(db)
    record = await service.resolve_key(api_key)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )
    request.state.project_id = record.project_id
    request.state.api_key_scope = "project"
    request.state.api_key_scopes = parse_scopes(getattr(record, "scopes", None))
    return api_key


def require_api_scopes(*needed: str) -> Callable:
    """Dependency factory: ensure project API key includes required scopes."""

    async def _checker(
        request: Request,
        api_key: str = Depends(get_api_key),
    ):
        _ = api_key
        if getattr(request.state, "api_key_scope", None) == "global":
            return True
        have: set = getattr(request.state, "api_key_scopes", None) or set()
        missing = [s for s in needed if s not in have]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing scopes: {', '.join(missing)}",
            )
        return True

    return _checker
