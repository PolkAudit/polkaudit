from pydantic import BaseModel
from typing import Optional


class TreasurySpendResponse(BaseModel):
    id: int
    block_number: int
    beneficiary: str
    value: str  # raw integer amount (string); retained for compatibility
    source_chain: Optional[str] = None
    asset_id: Optional[str] = None
    asset_symbol: Optional[str] = None
    decimals: Optional[int] = None
    amount_display: Optional[str] = None
    display_status: Optional[str] = None

    class Config:
        from_attributes = True
