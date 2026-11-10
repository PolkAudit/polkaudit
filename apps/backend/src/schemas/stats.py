from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import date


class AssetSpendTotal(BaseModel):
    source_chain: str
    asset_id: str
    asset_symbol: Optional[str] = None
    decimals: Optional[int] = None
    amount_raw_sum: str
    amount_display_sum: Optional[str] = None
    display_status: str


class StatsOverview(BaseModel):
    total_proposals: int
    total_votes: int
    # Compatibility: raw sum only when single asset; else "mixed_assets" / "0"
    total_treasury_spend: str
    treasury_aggregation: str = "empty"
    treasury_by_asset: List[AssetSpendTotal] = Field(default_factory=list)
    total_blocks_indexed: int
    total_extrinsics: int
    last_indexed_block: int
    last_governance_block: int = 0
    governance_lag_blocks: int = 0


class DailyActivity(BaseModel):
    date: date
    proposals_count: int
    votes_count: int


class GovernanceActivity(BaseModel):
    activity: List[DailyActivity]
