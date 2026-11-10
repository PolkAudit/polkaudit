from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from src.models.proposal import Proposal, Vote
from src.schemas.vote import ProposalDetailResponse, VoteResponse, LifecycleEvent


# Deterministic lifecycle rank within the same block when event_index ties/missing
_METHOD_RANK = {
    "propose": 10,
    "submit": 10,
    "submit_unsigned": 10,
    "Submitted": 15,
    "second": 20,
    "place_decision_deposit": 25,
    "decide": 30,
    "DecisionStarted": 35,
    "Confirmed": 80,
    "Approved": 90,
    "Rejected": 90,
    "TimedOut": 90,
    "Cancelled": 90,
}


def lifecycle_sort_key(p: Proposal) -> tuple:
    """Authoritative order: block number, on-chain event index, method rank, id."""
    event_pos = p.event_index if p.event_index is not None else 10**9
    if p.event_index is None and p.extrinsic_index is not None:
        # Extrinsics occur before events in typical processing; keep after known events
        # only when event_index absent — still deterministic via extrinsic_index.
        event_pos = p.extrinsic_index
    return (
        int(p.block_number),
        int(event_pos),
        int(_METHOD_RANK.get(p.method or "", 50)),
        int(p.id or 0),
    )


class GovernanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _rows_for_index(self, proposal_index: int) -> List[Proposal]:
        result = await self.db.execute(
            select(Proposal).where(
                and_(
                    Proposal.proposal_index == proposal_index,
                    Proposal.proposal_index.is_not(None),
                )
            )
        )
        rows = list(result.scalars().all())
        rows.sort(key=lifecycle_sort_key)
        return rows

    async def get_proposals(
        self, skip: int = 0, limit: int = 100, proposer: Optional[str] = None
    ) -> List[Proposal]:
        """Return one canonical row per referendum index (latest lifecycle state)."""
        query = select(Proposal).where(Proposal.proposal_index.is_not(None))
        if proposer:
            query = query.where(Proposal.proposer == proposer)
        result = await self.db.execute(query)
        rows = list(result.scalars().all())

        by_index: dict[int, list[Proposal]] = {}
        for row in rows:
            by_index.setdefault(int(row.proposal_index), []).append(row)

        canonical: list[Proposal] = []
        for idx, group in by_index.items():
            group.sort(key=lifecycle_sort_key)
            canonical.append(group[-1])

        canonical.sort(key=lambda p: int(p.proposal_index or 0), reverse=True)
        return canonical[skip : skip + limit]

    async def get_proposal(self, proposal_index: int) -> Optional[Proposal]:
        rows = await self._rows_for_index(proposal_index)
        return rows[-1] if rows else None

    async def get_votes_for_proposal(
        self, proposal_index: int, skip: int = 0, limit: int = 200
    ) -> List[Vote]:
        query = (
            select(Vote)
            .where(Vote.proposal_index == proposal_index)
            .order_by(Vote.block_number.desc(), Vote.id.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_proposal_detail(self, proposal_index: int) -> Optional[ProposalDetailResponse]:
        rows = await self._rows_for_index(proposal_index)
        if not rows:
            return None

        # Earliest row for submission provenance; latest for effective state
        first = rows[0]
        current = rows[-1]
        votes = await self.get_votes_for_proposal(proposal_index)
        vote_responses = [VoteResponse.model_validate(v) for v in votes]

        lifecycle = [
            LifecycleEvent(
                id=r.id,
                block_number=r.block_number,
                event_index=r.event_index,
                extrinsic_index=r.extrinsic_index,
                method=r.method,
                status=r.status,
                event_key=r.event_key,
                source=r.source,
            )
            for r in rows
        ]

        status = current.status or "Unknown"
        timeline = [
            {
                "label": "Submitted",
                "description": f"Block #{first.block_number}",
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

        title = f"{current.section}.{current.method} #{proposal_index}"
        description = None
        args = current.args if isinstance(current.args, dict) else (
            first.args if isinstance(first.args, dict) else None
        )
        if isinstance(args, dict):
            description = (
                args.get("description")
                or args.get("reason")
                or f"On-chain {current.section}.{current.method}"
            )

        return ProposalDetailResponse(
            id=current.id,
            proposal_index=proposal_index,
            block_number=current.block_number,
            section=current.section,
            method=current.method,
            proposer=first.proposer if first.proposer and first.proposer != "unknown" else current.proposer,
            status=status,
            args=args,
            description=description,
            title=title,
            outcome=status if status in ("Approved", "Rejected") else None,
            votes=vote_responses,
            timeline=timeline,
            lifecycle=lifecycle,
            raw={"args": args, "lifecycle_count": len(lifecycle)} if args is not None else {
                "lifecycle_count": len(lifecycle)
            },
        )
