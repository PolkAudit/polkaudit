from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.database import get_db
from src.security import SECRET_KEY, ALGORITHM
from src.schemas.user import TokenData
from src.services.auth_service import AuthService
from src.models.user import User
from src.models.project import UserProject
from src.models.project import UserProject

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

async def get_current_project(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> int:
    project_id = getattr(request.state, "project_id", None)
    if not project_id:
        pid = request.headers.get("X-Project-ID")
        if pid:
            project_id = int(pid)

    # Fallback: first project membership (shared-chain SaaS model)
    if not project_id:
        result = await db.execute(
            select(UserProject).where(UserProject.user_id == current_user.id).limit(1)
        )
        membership = result.scalars().first()
        if membership:
            project_id = membership.project_id

    if not project_id:
        raise HTTPException(status_code=400, detail="X-Project-ID header required")

    result = await db.execute(select(UserProject).where(
        UserProject.user_id == current_user.id,
        UserProject.project_id == project_id
    ))
    user_project = result.scalars().first()

    if current_user.role == "admin":
        return project_id

    if not user_project:
        raise HTTPException(status_code=403, detail="Not authorized for this project")

    return project_id

class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)):
        # This checks GLOBAL role.
        # Ideally we should check PROJECT role.
        # But keeping global role check for now for backward compatibility
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
