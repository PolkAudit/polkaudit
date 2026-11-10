from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.models.audit import AuditCase, AuditEvidence, AuditComment, AuditCaseStatus
from src.models.user import User
from typing import Dict, Any, List, Optional
import hashlib
import structlog

logger = structlog.get_logger()

class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_case(self, project_id: int, title: str, description: str, auditor_id: Optional[int] = None):
        case = AuditCase(
            project_id=project_id,
            title=title,
            description=description,
            assigned_auditor_id=auditor_id,
            status=AuditCaseStatus.OPEN
        )
        self.db.add(case)
        await self.db.commit()
        await self.db.refresh(case)
        return case

    async def add_evidence(self, case_id: int, user_id: int, description: str, file_url: str):
        # In a real app, we would download the file and hash it.
        # Here we simulate hashing the URL + description as a proxy for file content
        content_to_hash =f"{file_url}-{description}".encode()
        file_hash = hashlib.sha256(content_to_hash).hexdigest()

        evidence = AuditEvidence(
            case_id=case_id,
            uploaded_by=user_id,
            description=description,
            file_url=file_url,
            file_hash=file_hash
        )
        self.db.add(evidence)
        await self.db.commit()
        await self.db.refresh(evidence)
        return evidence

    async def add_comment(self, case_id: int, user_id: int, content: str):
        comment = AuditComment(
            case_id=case_id,
            user_id=user_id,
            content=content
        )
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        return comment

    async def list_cases(self, project_id: int):
        result = await self.db.execute(
            select(AuditCase)
            .where(AuditCase.project_id == project_id)
            .order_by(AuditCase.id.desc())
        )
        return list(result.scalars().all())

    async def get_case_details(self, case_id: int):
        case = await self.db.get(AuditCase, case_id)
        if not case:
            return None
        
        # Fetch related data
        evidence = await self.db.execute(select(AuditEvidence).where(AuditEvidence.case_id == case_id))
        comments = await self.db.execute(select(AuditComment).where(AuditComment.case_id == case_id).order_by(AuditComment.created_at))
        
        return {
            "case": case,
            "evidence": evidence.scalars().all(),
            "comments": comments.scalars().all()
        }

    async def close_case(self, case_id: int):
        case = await self.db.get(AuditCase, case_id)
        if not case:
            raise ValueError("Case not found")
        case.status = AuditCaseStatus.CLOSED
        await self.db.commit()
        await self.db.refresh(case)
        return case

    async def reopen_case(self, case_id: int):
        case = await self.db.get(AuditCase, case_id)
        if not case:
            raise ValueError("Case not found")
        case.status = AuditCaseStatus.IN_REVIEW
        await self.db.commit()
        await self.db.refresh(case)
        return case
