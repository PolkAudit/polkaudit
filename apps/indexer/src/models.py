from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    JSON,
    BigInteger,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.sql import func
from .database import Base


class Block(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True, index=True)
    block_number = Column(BigInteger, unique=True, index=True, nullable=False)
    block_hash = Column(String, unique=True, index=True, nullable=False)
    parent_hash = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    events_count = Column(Integer, default=0)
    extrinsics_count = Column(Integer, default=0)


class Extrinsic(Base):
    __tablename__ = "extrinsics"
    __table_args__ = (
        UniqueConstraint("event_key", name="uq_extrinsics_event_key"),
        UniqueConstraint(
            "block_number", "extrinsic_index", name="uq_extrinsics_block_extrinsic_index"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    extrinsic_index = Column(Integer, nullable=True)
    event_key = Column(String, nullable=True, index=True)
    extrinsic_hash = Column(String, unique=False, index=True, nullable=False)
    module = Column(String, nullable=False)
    call = Column(String, nullable=False)
    signer = Column(String, nullable=True)
    args = Column(JSON, nullable=True)
    success = Column(String, nullable=False)  # 'True' or 'False'


class ProcessedBlock(Base):
    __tablename__ = "processed_blocks"

    block_number = Column(BigInteger, primary_key=True, index=True)
    block_hash = Column(String, nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now())


class IndexerCursor(Base):
    """Singleton cursor for forward progress vs verified contiguous coverage.

    - range_start..contiguous_through: verified contiguous historical coverage
    - contiguous_through: also the forward-processing resume point
    - historical_gaps: explicit JSON list of unprocessed ranges
    - coverage_complete: True only when full history from genesis is certified
      (never implied solely by MAX(processed_blocks))
    """

    __tablename__ = "indexer_cursor"
    __table_args__ = (CheckConstraint("id = 1", name="ck_indexer_cursor_singleton"),)

    id = Column(Integer, primary_key=True)
    range_start = Column(BigInteger, nullable=False)
    contiguous_through = Column(BigInteger, nullable=False)
    historical_gaps = Column(JSON, nullable=True)
    coverage_complete = Column(Integer, nullable=False, default=0)  # 0/1 for broad dialect support
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Proposal(Base):
    __tablename__ = "proposals"
    __table_args__ = (UniqueConstraint("event_key", name="uq_proposals_event_key"),)

    id = Column(Integer, primary_key=True, index=True)
    # Business identity: on-chain referendum / proposal index (API contract)
    proposal_index = Column(Integer, index=True, nullable=True)
    # On-chain event identity (idempotency)
    event_key = Column(String, nullable=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    extrinsic_index = Column(Integer, nullable=True)
    event_index = Column(Integer, nullable=True)
    source = Column(String, nullable=True)  # 'extrinsic' | 'event'
    section = Column(String, nullable=False)
    method = Column(String, nullable=False)
    proposer = Column(String, nullable=False)
    args = Column(JSON, nullable=True)
    status = Column(String, nullable=True)


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
    vote = Column(String, nullable=False)  # e.g., 'Aye', 'Nay'
    balance = Column(String, nullable=True)


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
    # Raw integer amount as string (never float). Legacy column name `value`.
    value = Column(String, nullable=False)
    source_chain = Column(String, nullable=True)
    asset_id = Column(String, nullable=True)
    asset_symbol = Column(String, nullable=True)
    decimals = Column(Integer, nullable=True)
    amount_display = Column(String, nullable=True)
    display_status = Column(String, nullable=True)  # resolved | unresolved


class DeadLetterQueue(Base):
    __tablename__ = "dead_letter_queue"

    id = Column(Integer, primary_key=True, index=True)
    block_number = Column(BigInteger, index=True, nullable=False)
    error_message = Column(String, nullable=False)
    retry_count = Column(Integer, default=0)
    last_attempt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
