from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.services.auth_service import AuthService
from src.services.tenant_service import (
    TenantService,
    TenantCreateRequest,
    MembershipRequest,
)
from src.schemas.user import UserCreate, UserResponse
from src.dependencies import RoleChecker
from src.models.user import User

router = APIRouter()

allow_admin = RoleChecker(["admin"])


class MembershipResponse(BaseModel):
    user_id: int
    project_id: int
    role: str
    email: Optional[str] = None
    project_name: Optional[str] = None
    project_slug: Optional[str] = None


@router.post("/users", response_model=UserResponse, dependencies=[Depends(allow_admin)])
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    return await auth_service.create_user(user)


@router.get("/users", response_model=list[UserResponse], dependencies=[Depends(allow_admin)])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.post("/tenants", dependencies=[Depends(allow_admin)])
async def create_tenant(body: TenantCreateRequest, db: AsyncSession = Depends(get_db)):
    """Provision project + user membership + plan + optional API key in one shot."""
    service = TenantService(db)
    return await service.create_tenant(body)


@router.get(
    "/memberships",
    response_model=list[MembershipResponse],
    dependencies=[Depends(allow_admin)],
)
async def list_memberships(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    service = TenantService(db)
    return await service.list_memberships(project_id)


@router.post(
    "/memberships",
    response_model=MembershipResponse,
    dependencies=[Depends(allow_admin)],
)
async def assign_membership(body: MembershipRequest, db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    row = await service.assign_membership(body)
    return MembershipResponse(
        user_id=row.user_id,
        project_id=row.project_id,
        role=row.role,
    )


@router.delete(
    "/memberships/{user_id}/{project_id}",
    status_code=204,
    dependencies=[Depends(allow_admin)],
)
async def remove_membership(
    user_id: int,
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    service = TenantService(db)
    await service.remove_membership(user_id, project_id)
    return None
