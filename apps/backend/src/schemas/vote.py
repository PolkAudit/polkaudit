from pydantic import BaseModel, Field
from typing import Optional, Any


class VoteResponse(BaseModel):
    id: int
    proposal_index: int
    block_number: int
    voter: str
    vote: str
    balance: Optional[str] = None

    class Config:
        from_attributes = True


class LifecycleEvent(BaseModel):
    id: int
    block_number: int
    event_index: Optional[int] = None
    extrinsic_index: Optional[int] = None
    method: str
    status: Optional[str] = None
    event_key: Optional[str] = None
    source: Optional[str] = None


class ProposalDetailResponse(BaseModel):
    id: int
    proposal_index: int
    block_number: int
    section: str
    method: str
    proposer: str
    status: Optional[str] = None
    args: Optional[dict] = None
    description: Optional[str] = None
    title: str = ""
    outcome: Optional[str] = None
    votes: list[VoteResponse] = []
    timeline: list[dict] = []
    # Additive: ordered lifecycle history (compatible with older clients that ignore unknown fields
    # when using their own DTO; FastAPI will include it in OpenAPI).
    lifecycle: list[LifecycleEvent] = Field(default_factory=list)
    raw: Optional[dict] = None

    class Config:
        from_attributes = True
