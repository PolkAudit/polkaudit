from pydantic import BaseModel
from typing import Optional


class VoteResponse(BaseModel):
    id: int
    proposal_index: int
    block_number: int
    voter: str
    vote: str
    balance: Optional[str] = None

    class Config:
        from_attributes = True


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
    raw: Optional[dict] = None

    class Config:
        from_attributes = True
