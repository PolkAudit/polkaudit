from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from src.models.proposal import Proposal, Vote
from src.schemas.vote import ProposalDetailResponse, VoteResponse


class GovernanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_proposals(
        self, skip: int = 0, limit: int = 100, proposer: Optional[str] = None
    ) -> List[Proposal]:
        query = select(Proposal)
        if proposer:
            query = query.where(Proposal.proposer == proposer)

        query = query.order_by(Proposal.proposal_index.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_proposal(self, proposal_index: int) -> Optional[Proposal]:
        query = select(Proposal).where(Proposal.proposal_index == proposal_index)
        result = await self.db.execute(query)
        return result.scalars().first()

    async def get_votes_for_proposal(
        self, proposal_index: int, skip: int = 0, limit: int = 200
    ) -> List[Vote]:
        query = (
            select(Vote)
            .where(Vote.proposal_index == proposal_index)
            .order_by(Vote.block_number.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_proposal_detail(self, proposal_index: int) -> Optional[ProposalDetailResponse]:
        proposal = await self.get_proposal(proposal_index)
        if not proposal:
            return None

        votes = await self.get_votes_for_proposal(proposal_index)
        vote_responses = [VoteResponse.model_validate(v) for v in votes]

        status = proposal.status or "Unknown"
        timeline = [
            {
                "label": "Submitted",
                "description": f"Block #{proposal.block_number}",
                "completed": True,
                "current": False,
            },
            {
                "label": "Voting",
                "description": f"{len(vote_responses)} vote(s) recorded",
                "completed": len(vote_responses) > 0,
                "current": status in ("Proposed", "Active", None, "Unknown"),
            },
            {
                "label": "Outcome",
                "description": status if status not in ("Proposed", "Active") else "Pending",
                "completed": status in ("Approved", "Rejected"),
                "current": status in ("Approved", "Rejected"),
            },
        ]

        title = f"{proposal.section}.{proposal.method} #{proposal.proposal_index}"
        description = None
        if isinstance(proposal.args, dict):
            description = (
                proposal.args.get("description")
                or proposal.args.get("reason")
                or f"On-chain {proposal.section}.{proposal.method}"
            )

        return ProposalDetailResponse(
            id=proposal.id,
            proposal_index=proposal.proposal_index or 0,
            block_number=proposal.block_number,
            section=proposal.section,
            method=proposal.method,
            proposer=proposal.proposer,
            status=status,
            args=proposal.args if isinstance(proposal.args, dict) else None,
            description=description,
            title=title,
            outcome=status if status in ("Approved", "Rejected") else None,
            votes=vote_responses,
            timeline=timeline,
            raw={"args": proposal.args} if proposal.args is not None else None,
        )
