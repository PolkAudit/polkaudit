from fastapi import Security, HTTPException, status, Request, Depends
from fastapi.security.api_key import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=True)


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
        return api_key

    from src.services.api_key_service import ApiKeyService

    service = ApiKeyService(db)
    project_id = await service.resolve_project_id(api_key)
    if project_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )
    request.state.project_id = project_id
    request.state.api_key_scope = "project"
    return api_key
