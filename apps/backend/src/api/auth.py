from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db
from src.services.auth_service import AuthService
from src.security import create_access_token
from src.schemas.user import UserResponse, Token, UserCreate
from src.dependencies import get_current_active_user
from src.models.user import UserRole
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


async def _ensure_default_project(db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.slug == "polkadot-main"))
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
    form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)
):
    auth_service = AuthService(db)
    user = await auth_service.authenticate_user(form_data.username, form_data.password)
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
async def read_users_me(current_user = Depends(get_current_active_user)):
    return current_user


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
