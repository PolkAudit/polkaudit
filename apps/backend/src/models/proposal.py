from sqlalchemy import Column, Integer, String, BigInteger, JSON, ForeignKey, UniqueConstraint
from src.database import Base

# Re-defining models here to allow backend service to be independent
# Ideally this would be shared code, but we minimize coupling for this step
class Proposal(Base):
    __tablename__ = "proposals"
    __table_args__ = (UniqueConstraint("event_key", name="uq_proposals_event_key"),)

    id = Column(Integer, primary_key=True, index=True)
    proposal_index = Column(Integer, index=True, nullable=True)
    external_id = Column(String, index=True, nullable=True)
    event_key = Column(String, nullable=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    extrinsic_index = Column(Integer, nullable=True)
    event_index = Column(Integer, nullable=True)
    source = Column(String, nullable=True)
    section = Column(String, nullable=False)
    method = Column(String, nullable=False)
    proposer = Column(String, nullable=False)
    args = Column(JSON, nullable=True)
    status = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("event_key", name="uq_votes_event_key"),)

    id = Column(Integer, primary_key=True, index=True)
    proposal_index = Column(Integer, index=True, nullable=False)
    event_key = Column(String, nullable=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    extrinsic_index = Column(Integer, nullable=True)
    event_index = Column(Integer, nullable=True)
    source = Column(String, nullable=True)
    voter = Column(String, nullable=False)
    vote = Column(String, nullable=False)
    balance = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

class TreasurySpend(Base):
    __tablename__ = "treasury_spends"
    __table_args__ = (UniqueConstraint("event_key", name="uq_treasury_spends_event_key"),)

    id = Column(Integer, primary_key=True, index=True)
    event_key = Column(String, nullable=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    extrinsic_index = Column(Integer, nullable=True)
    event_index = Column(Integer, nullable=True)
    source = Column(String, nullable=True)
    beneficiary = Column(String, nullable=False)
    value = Column(String, nullable=False)  # raw integer amount (string)
    source_chain = Column(String, nullable=True)
    asset_id = Column(String, nullable=True)
    asset_symbol = Column(String, nullable=True)
    decimals = Column(Integer, nullable=True)
    amount_display = Column(String, nullable=True)
    display_status = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
