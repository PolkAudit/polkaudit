from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.database import get_db
from src.dependencies import RoleChecker, get_current_project, get_current_user
from src.audit.service import AuditService
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter()
allow_auditor = RoleChecker(["admin", "auditor"])


class CaseCreate(BaseModel):
    title: str
    description: str
    auditor_id: Optional[int] = None


class EvidenceUpload(BaseModel):
    description: str = Field(min_length=1)
    file_url: str = Field(min_length=1, max_length=2000)


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


async def _case_for_project(service: AuditService, case_id: int, project_id: int):
    details = await service.get_case_details(case_id)
    if not details or details["case"].project_id != project_id:
        raise HTTPException(status_code=404, detail="Case not found")
    return details


@router.post("/cases", dependencies=[Depends(allow_auditor)])
async def create_case(
    case_data: CaseCreate,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
):
    service = AuditService(db)
    return await service.create_case(
        project_id, case_data.title, case_data.description, case_data.auditor_id
    )


@router.get("/cases", dependencies=[Depends(allow_auditor)])
async def list_cases(
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
):
    service = AuditService(db)
    return await service.list_cases(project_id)


@router.get("/cases/{case_id}", dependencies=[Depends(allow_auditor)])
async def get_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
):
    service = AuditService(db)
    return await _case_for_project(service, case_id, project_id)


@router.post("/cases/{case_id}/evidence", dependencies=[Depends(allow_auditor)])
async def add_evidence(
    case_id: int,
    evidence: EvidenceUpload,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
    user=Depends(get_current_user),
):
    service = AuditService(db)
    await _case_for_project(service, case_id, project_id)
    return await service.add_evidence(
        case_id, user.id, evidence.description, evidence.file_url
    )


@router.post("/cases/{case_id}/comments", dependencies=[Depends(allow_auditor)])
async def add_comment(
    case_id: int,
    comment: CommentCreate,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
    user=Depends(get_current_user),
):
    service = AuditService(db)
    await _case_for_project(service, case_id, project_id)
    return await service.add_comment(case_id, user.id, comment.content)


@router.post("/cases/{case_id}/close", dependencies=[Depends(allow_auditor)])
async def close_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
):
    service = AuditService(db)
    await _case_for_project(service, case_id, project_id)
    try:
        return await service.close_case(case_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/cases/{case_id}/reopen", dependencies=[Depends(allow_auditor)])
async def reopen_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    project_id: int = Depends(get_current_project),
):
    service = AuditService(db)
    await _case_for_project(service, case_id, project_id)
    return await service.reopen_case(case_id)
