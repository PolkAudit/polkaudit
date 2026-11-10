from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from src.database import get_db
from src.auth import get_api_key, require_api_scopes
from src.services.plan_rate_limit import enforce_plan_rate_limit
from src.schemas.proposal import ProposalResponse

from src.services.governance import GovernanceService
from src.services.stats import StatsService
from src.services.treasury import TreasuryService
from src.services.activity import ActivityService
from src.schemas.stats import StatsOverview
from src.schemas.treasury import TreasurySpendResponse
from src.schemas.vote import ProposalDetailResponse, VoteResponse
from src.schemas.activity import RecentActivityResponse

router = APIRouter(
    dependencies=[
        Depends(enforce_plan_rate_limit),
        Depends(require_api_scopes("read")),
    ]
)

@router.get("/stats/overview", response_model=StatsOverview)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    _ = api_key
    service = StatsService(db)
    return await service.get_overview()

@router.get("/activity/recent", response_model=RecentActivityResponse)
async def get_recent_activity(
    limit: int = 12,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
):
    _ = api_key
    service = ActivityService(db)
    return await service.get_recent(min(max(limit, 1), 50))

@router.get("/proposals", response_model=List[ProposalResponse])
async def get_proposals(
    skip: int = 0, 
    limit: int = 100, 
    proposer: str = None,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    _ = api_key
    service = GovernanceService(db)
    return await service.get_proposals(skip, limit, proposer)

@router.get("/proposals/{proposal_index}", response_model=ProposalDetailResponse)
async def get_proposal(
    proposal_index: int, 
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    _ = api_key
    service = GovernanceService(db)
    proposal = await service.get_proposal_detail(proposal_index)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal

@router.get("/proposals/{proposal_index}/votes", response_model=List[VoteResponse])
async def get_proposal_votes(
    proposal_index: int,
    skip: int = 0,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key),
):
    _ = api_key
    service = GovernanceService(db)
    return await service.get_votes_for_proposal(proposal_index, skip, limit)

@router.get("/treasury/spends", response_model=List[TreasurySpendResponse])
async def get_treasury_spends(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    _ = api_key
    service = TreasuryService(db)
    return await service.get_spends(skip, limit)
