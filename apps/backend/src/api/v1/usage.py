from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.dependencies import get_current_active_user, get_current_project
from src.models.user import User
from src.services.usage_service import UsageService

router = APIRouter()


@router.get("/summary")
async def usage_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    project_id: int = Depends(get_current_project),
):
    _ = current_user
    return await UsageService(db).get_usage_summary(project_id)
