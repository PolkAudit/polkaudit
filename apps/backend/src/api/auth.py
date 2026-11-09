from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.services.auth_service import AuthService
from src.services.auth_token_service import AuthTokenService
from src.security import create_access_token
from src.schemas.user import UserResponse, Token, UserCreate
from src.dependencies import get_current_active_user
from src.models.user import User, UserRole
from src.models.project import Project, UserProject
from src.models.billing import Plan, Subscription

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterResponse(BaseModel):
    user: UserResponse
    project_id: int
    access_token: str
    token_type: str = "bearer"


class TokenBody(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MessageResponse(BaseModel):
    message: str


async def _ensure_default_project(db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.slug == "polkadot-main")
    )
    project = result.scalars().first()
    if project:
        return project
    project = Project(
        name="Polkadot Main",
        slug="polkadot-main",
        chain_id="polkadot",
        rpc_url="wss://rpc.polkadot.io",
        chain_type="polkadot",
        is_public=True,
    )
    db.add(project)
    await db.flush()

    # Attach free plan subscription for default project
    plan_result = await db.execute(select(Plan).where(Plan.slug == "free"))
    plan = plan_result.scalars().first()
    if plan:
        db.add(
            Subscription(
                project_id=project.id,
                plan_id=plan.id,
                status="active",
                billing_note="default shared project",
            )
        )
    return project


@router.post("/register", response_model=RegisterResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    user = await auth_service.create_user(
        UserCreate(
            email=body.email,
            password=body.password,
            role=UserRole.MEMBER,
            is_active=True,
        )
    )
    project = await _ensure_default_project(db)
    db.add(UserProject(user_id=user.id, project_id=project.id, role="member"))
    await db.commit()

    tokens = AuthTokenService(db)
    await tokens.send_verify_email(user)

    access_token = create_access_token(
        subject=user.email, expires_delta=timedelta(hours=24)
    )
    return RegisterResponse(
        user=UserResponse.model_validate(user),
        project_id=project.id,
        access_token=access_token,
    )


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    auth_service = AuthService(db)
    user = await auth_service.authenticate_user(
        form_data.username, form_data.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(hours=24)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user=Depends(get_current_active_user)):
    return current_user


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(body: TokenBody, db: AsyncSession = Depends(get_db)):
    tokens = AuthTokenService(db)
    user = await tokens.consume(body.token, "verify_email")
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification token",
        )
    if not user.email_verified_at:
        user.email_verified_at = datetime.now(timezone.utc)
        await db.commit()
    return MessageResponse(message="Email verified")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.email_verified_at:
        return MessageResponse(message="Email already verified")
    tokens = AuthTokenService(db)
    await tokens.send_verify_email(current_user)
    return MessageResponse(message="Verification email sent")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_email(body.email)
    if user:
        tokens = AuthTokenService(db)
        await tokens.send_reset_password(user)
    # Always 200 — no email enumeration
    return MessageResponse(
        message="If that email exists, a reset link was sent"
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    tokens = AuthTokenService(db)
    user = await tokens.consume(body.token, "reset_password")
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset token",
        )
    auth_service = AuthService(db)
    await auth_service.set_password(user, body.password)
    return MessageResponse(message="Password updated")


class MyProject(BaseModel):
    project_id: int
    role: str
    name: str | None = None
    slug: str | None = None


@router.get("/projects", response_model=list[MyProject])
async def list_my_projects(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    result = await db.execute(
        select(UserProject, Project)
        .join(Project, Project.id == UserProject.project_id)
        .where(UserProject.user_id == current_user.id)
    )
    rows = result.all()
    return [
        MyProject(
            project_id=up.project_id,
            role=up.role,
            name=proj.name,
            slug=proj.slug,
        )
        for up, proj in rows
    ]
