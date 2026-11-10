from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from src.models.proposal import Proposal, Vote, TreasurySpend
from src.models.indexer import Block, Extrinsic, ProcessedBlock
from src.schemas.stats import StatsOverview, AssetSpendTotal
from src.money import aggregate_by_asset


class StatsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_overview(self) -> StatsOverview:
        total_proposals = await self.db.scalar(
            select(func.count(Proposal.id)).where(Proposal.proposal_index.is_not(None))
        ) or 0
        # Count distinct referendum indices for proposal KPI (avoid lifecycle inflation)
        distinct_props = await self.db.scalar(
            select(func.count(func.distinct(Proposal.proposal_index))).where(
                Proposal.proposal_index.is_not(None)
            )
        )
        if distinct_props is not None:
            total_proposals = int(distinct_props)

        total_votes = await self.db.scalar(select(func.count(Vote.id))) or 0

        spends = list(
            (await self.db.execute(select(TreasurySpend))).scalars().all()
        )
        agg = aggregate_by_asset(spends)

        total_blocks = await self.db.scalar(select(func.count(Block.id))) or 0
        total_extrinsics = await self.db.scalar(select(func.count(Extrinsic.id))) or 0
        last_block = await self.db.scalar(select(func.max(ProcessedBlock.block_number))) or 0

        last_prop = await self.db.scalar(select(func.max(Proposal.block_number))) or 0
        last_vote = await self.db.scalar(select(func.max(Vote.block_number))) or 0
        last_spend = await self.db.scalar(select(func.max(TreasurySpend.block_number))) or 0
        last_gov = int(max(last_prop or 0, last_vote or 0, last_spend or 0))
        last_indexed = int(last_block or 0)

        return StatsOverview(
            total_proposals=total_proposals,
            total_votes=total_votes,
            total_treasury_spend=str(agg["total_treasury_spend"]),
            treasury_aggregation=agg["aggregation"],
            treasury_by_asset=[AssetSpendTotal(**row) for row in agg["by_asset"]],
            total_blocks_indexed=total_blocks,
            total_extrinsics=total_extrinsics,
            last_indexed_block=last_indexed,
            last_governance_block=last_gov,
            governance_lag_blocks=max(0, last_indexed - last_gov) if last_gov else last_indexed,
        )
