from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.services.auth_service import AuthService
from src.services.tenant_service import (
    TenantService,
    TenantCreateRequest,
    MembershipRequest,
)
from src.services.platform_settings_service import PlatformSettingsService
from src.services.mailer import send_email
from src.schemas.user import UserCreate, UserResponse
from src.dependencies import RoleChecker
from src.models.user import User

router = APIRouter()

allow_admin = RoleChecker(["admin"])


class SmtpSettingsResponse(BaseModel):
    host: str = ""
    port: int = 587
    user: str = ""
    from_address: str = ""
    use_tls: bool = True
    source: str = "env"
    configured: bool = False
    password_set: bool = False


class SmtpSettingsUpdate(BaseModel):
    host: str = ""
    port: int = Field(587, ge=1, le=65535)
    user: str = ""
    from_address: str = "PolkAudit <noreply@polkaudit.xyz>"
    use_tls: bool = True
    password: Optional[str] = None  # omit / empty = keep existing
    clear_password: bool = False


class SmtpTestRequest(BaseModel):
    to: EmailStr


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


@router.get(
    "/settings/smtp",
    response_model=SmtpSettingsResponse,
    dependencies=[Depends(allow_admin)],
)
async def get_smtp_settings(db: AsyncSession = Depends(get_db)):
    svc = PlatformSettingsService(db)
    return SmtpSettingsResponse(**(await svc.get_smtp_public()))


@router.put(
    "/settings/smtp",
    response_model=SmtpSettingsResponse,
    dependencies=[Depends(allow_admin)],
)
async def update_smtp_settings(
    body: SmtpSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    svc = PlatformSettingsService(db)
    data = await svc.save_smtp(
        host=body.host,
        port=body.port,
        user=body.user,
        from_address=body.from_address,
        use_tls=body.use_tls,
        password=body.password,
        clear_password=body.clear_password,
    )
    return SmtpSettingsResponse(**data)


@router.post("/settings/smtp/test", dependencies=[Depends(allow_admin)])
async def test_smtp(
    body: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
):
    svc = PlatformSettingsService(db)
    public = await svc.get_smtp_public()
    if not public.get("configured"):
        raise HTTPException(
            status_code=400,
            detail="SMTP is not configured. Save host settings first.",
        )
    ok = await send_email(
        body.to,
        "PolkAudit SMTP test",
        "This is a test email from PolkAudit Console platform admin settings.",
    )
    if not ok:
        raise HTTPException(
            status_code=502,
            detail="SMTP send failed. Check host/credentials and server logs.",
        )
    return {"message": f"Test email sent to {body.to}", "source": public.get("source")}
