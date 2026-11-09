from pydantic import BaseModel
from typing import Literal, Optional


class ActivityItem(BaseModel):
    type: Literal["proposal", "vote", "treasury"]
    title: str
    subtitle: str
    block_number: int
    href: str
    status: Optional[str] = None


class RecentActivityResponse(BaseModel):
    items: list[ActivityItem]
    last_indexed_block: int = 0
    last_governance_block: int = 0
