from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from src.database import get_db
from src.auth import get_api_key
from src.schemas.proposal import ProposalResponse

from src.services.governance import GovernanceService
from src.services.stats import StatsService
from src.services.treasury import TreasuryService
from src.schemas.stats import StatsOverview
from src.schemas.treasury import TreasurySpendResponse
from src.schemas.vote import ProposalDetailResponse, VoteResponse

router = APIRouter()

@router.get("/stats/overview", response_model=StatsOverview)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    service = StatsService(db)
    return await service.get_overview()

@router.get("/proposals", response_model=List[ProposalResponse])
async def get_proposals(
    skip: int = 0, 
    limit: int = 100, 
    proposer: str = None,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    service = GovernanceService(db)
    return await service.get_proposals(skip, limit, proposer)

@router.get("/proposals/{proposal_index}", response_model=ProposalDetailResponse)
async def get_proposal(
    proposal_index: int, 
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
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
    service = GovernanceService(db)
    return await service.get_votes_for_proposal(proposal_index, skip, limit)

@router.get("/treasury/spends", response_model=List[TreasurySpendResponse])
async def get_treasury_spends(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    api_key: str = Depends(get_api_key)
):
    service = TreasuryService(db)
    return await service.get_spends(skip, limit)

