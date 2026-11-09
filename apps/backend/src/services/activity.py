from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from src.models.proposal import Proposal, Vote, TreasurySpend
from src.models.indexer import ProcessedBlock
from src.schemas.activity import ActivityItem, RecentActivityResponse


class ActivityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_recent(self, limit: int = 12) -> RecentActivityResponse:
        items: list[ActivityItem] = []

        proposals = (
            await self.db.execute(
                select(Proposal).order_by(desc(Proposal.block_number)).limit(limit)
            )
        ).scalars().all()
        for p in proposals:
            idx = p.proposal_index or 0
            items.append(
                ActivityItem(
                    type="proposal",
                    title=f"Proposal #{idx}",
                    subtitle=f"{p.section}.{p.method}",
                    block_number=int(p.block_number),
                    href=f"/proposals/{idx}",
                    status=p.status,
                )
            )

        votes = (
            await self.db.execute(
                select(Vote).order_by(desc(Vote.block_number)).limit(limit)
            )
        ).scalars().all()
        for v in votes:
            items.append(
                ActivityItem(
                    type="vote",
                    title=f"Vote on #{v.proposal_index}",
                    subtitle=f"{v.vote} · {v.voter[:10]}…",
                    block_number=int(v.block_number),
                    href=f"/proposals/{v.proposal_index}",
                    status=v.vote,
                )
            )

        spends = (
            await self.db.execute(
                select(TreasurySpend).order_by(desc(TreasurySpend.block_number)).limit(limit)
            )
        ).scalars().all()
        for s in spends:
            items.append(
                ActivityItem(
                    type="treasury",
                    title="Treasury spend",
                    subtitle=f"{s.value} → {s.beneficiary[:12]}…",
                    block_number=int(s.block_number),
                    href="/treasury",
                    status=None,
                )
            )

        # Merge by block desc, then type priority
        type_rank = {"proposal": 0, "vote": 1, "treasury": 2}
        items.sort(key=lambda i: (-i.block_number, type_rank.get(i.type, 9)))
        items = items[:limit]

        last_indexed = await self.db.scalar(select(func.max(ProcessedBlock.block_number))) or 0
        last_prop = await self.db.scalar(select(func.max(Proposal.block_number))) or 0
        last_vote = await self.db.scalar(select(func.max(Vote.block_number))) or 0
        last_spend = await self.db.scalar(select(func.max(TreasurySpend.block_number))) or 0
        last_gov = int(max(last_prop or 0, last_vote or 0, last_spend or 0))

        return RecentActivityResponse(
            items=items,
            last_indexed_block=int(last_indexed or 0),
            last_governance_block=last_gov,
        )
