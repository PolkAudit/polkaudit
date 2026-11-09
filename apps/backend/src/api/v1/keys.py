from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.dependencies import get_current_active_user, get_current_project
from src.models.user import User
from src.services.api_key_service import ApiKeyService

router = APIRouter()


class ApiKeyCreate(BaseModel):
    name: str = Field(default="default", max_length=64)


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    created_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(ApiKeyResponse):
    raw_key: str


@router.get("/", response_model=List[ApiKeyResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = ApiKeyService(db)
    return await service.list_keys(project_id)


@router.post("/", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = ApiKeyService(db)
    record, raw = await service.create_key(project_id, body.name)
    return ApiKeyCreatedResponse(
        id=record.id,
        name=record.name,
        key_prefix=record.key_prefix,
        created_at=record.created_at,
        revoked_at=record.revoked_at,
        raw_key=raw,
    )


@router.post("/{key_id}/revoke", response_model=ApiKeyResponse)
async def revoke_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    service = ApiKeyService(db)
    key = await service.revoke_key(project_id, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    return key
