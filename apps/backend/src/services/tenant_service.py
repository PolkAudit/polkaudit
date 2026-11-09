"""Admin tenant provisioning: project + membership + optional key + plan."""

from typing import Optional

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from src.models.project import Project, UserProject
from src.models.user import User
from src.schemas.user import UserCreate, UserRole
from src.services.auth_service import AuthService
from src.services.api_key_service import ApiKeyService
from src.services.billing_service import BillingService


class TenantCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    chain_id: str = "polkadot"
    rpc_url: str = "wss://rpc.polkadot.io"
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=128)
    # Platform user role for the invitee
    user_role: UserRole = UserRole.MEMBER
    # Role inside the project workspace
    project_role: str = Field(default="admin", pattern="^(admin|auditor|member|viewer)$")
    plan_slug: str = Field(default="free", pattern="^(free|pilot|starter|pro|enterprise)$")
    create_api_key: bool = True
    api_key_name: str = "default"


class MembershipRequest(BaseModel):
    user_id: int
    project_id: int
    role: str = Field(default="member", pattern="^(admin|auditor|member|viewer)$")


class TenantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_tenant(self, body: TenantCreateRequest) -> dict:
        existing = await self.db.execute(select(Project).where(Project.slug == body.slug))
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Project slug already exists")

        auth = AuthService(self.db)
        user = await auth.get_user_by_email(body.admin_email)
        created_user = False
        if not user:
            user = await auth.create_user(
                UserCreate(
                    email=body.admin_email,
                    password=body.admin_password,
                    role=body.user_role,
                    is_active=True,
                )
            )
            created_user = True
        elif not user.is_active:
            raise HTTPException(status_code=400, detail="User exists but is inactive")

        project = Project(
            name=body.name,
            slug=body.slug,
            chain_id=body.chain_id,
            rpc_url=body.rpc_url,
        )
        self.db.add(project)
        await self.db.flush()

        membership = await self.db.execute(
            select(UserProject).where(
                UserProject.user_id == user.id,
                UserProject.project_id == project.id,
            )
        )
        if not membership.scalars().first():
            self.db.add(
                UserProject(
                    user_id=user.id,
                    project_id=project.id,
                    role=body.project_role,
                )
            )

        billing = BillingService(self.db)
        try:
            sub = await billing.set_subscription(
                project.id,
                body.plan_slug,
                status="active",
                billing_note="tenant onboard",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        raw_key: Optional[str] = None
        key_prefix: Optional[str] = None
        if body.create_api_key:
            key_svc = ApiKeyService(self.db)
            record, raw_key = await key_svc.create_key(project.id, body.api_key_name)
            key_prefix = record.key_prefix

        await self.db.commit()
        await self.db.refresh(project)
        await self.db.refresh(user)

        return {
            "project": {
                "id": project.id,
                "name": project.name,
                "slug": project.slug,
                "chain_id": project.chain_id,
                "rpc_url": project.rpc_url,
            },
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "created": created_user,
            },
            "membership_role": body.project_role,
            "subscription": {
                "id": sub.id,
                "plan_slug": body.plan_slug,
                "status": sub.status,
            },
            "api_key": (
                {"raw_key": raw_key, "key_prefix": key_prefix} if raw_key else None
            ),
        }

    async def assign_membership(self, body: MembershipRequest) -> UserProject:
        user = await self.db.get(User, body.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        project = await self.db.get(Project, body.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        result = await self.db.execute(
            select(UserProject).where(
                UserProject.user_id == body.user_id,
                UserProject.project_id == body.project_id,
            )
        )
        row = result.scalars().first()
        if row:
            row.role = body.role
        else:
            row = UserProject(
                user_id=body.user_id,
                project_id=body.project_id,
                role=body.role,
            )
            self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def list_memberships(self, project_id: Optional[int] = None) -> list[dict]:
        q = (
            select(UserProject, User, Project)
            .join(User, User.id == UserProject.user_id)
            .join(Project, Project.id == UserProject.project_id)
        )
        if project_id is not None:
            q = q.where(UserProject.project_id == project_id)
        result = await self.db.execute(q)
        rows = result.all()
        return [
            {
                "user_id": up.user_id,
                "project_id": up.project_id,
                "role": up.role,
                "email": user.email,
                "project_name": project.name,
                "project_slug": project.slug,
            }
            for up, user, project in rows
        ]

    async def remove_membership(self, user_id: int, project_id: int) -> None:
        result = await self.db.execute(
            select(UserProject).where(
                UserProject.user_id == user_id,
                UserProject.project_id == project_id,
            )
        )
        row = result.scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="Membership not found")
        await self.db.execute(
            delete(UserProject).where(
                UserProject.user_id == user_id,
                UserProject.project_id == project_id,
            )
        )
        await self.db.commit()
