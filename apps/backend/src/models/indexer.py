from sqlalchemy import (
    Column,
    Integer,
    String,
    BigInteger,
    JSON,
    DateTime,
    UniqueConstraint,
    CheckConstraint,
)  # JSON used by IndexerCursor.historical_gaps
from sqlalchemy.sql import func
from src.database import Base


class Block(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True, index=True)
    block_number = Column(BigInteger, unique=True, index=True, nullable=False)
    block_hash = Column(String, nullable=False)
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
    extrinsic_hash = Column(String, index=True, nullable=False)
    module = Column(String, nullable=False)
    call = Column(String, nullable=False)
    signer = Column(String, nullable=True)
    args = Column(JSON, nullable=True)
    success = Column(String, nullable=False)


class ProcessedBlock(Base):
    __tablename__ = "processed_blocks"

    block_number = Column(BigInteger, primary_key=True, index=True)
    block_hash = Column(String, nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now())


class IndexerCursor(Base):
    __tablename__ = "indexer_cursor"
    __table_args__ = (CheckConstraint("id = 1", name="ck_indexer_cursor_singleton"),)

    id = Column(Integer, primary_key=True)
    range_start = Column(BigInteger, nullable=False)
    contiguous_through = Column(BigInteger, nullable=False)
    historical_gaps = Column(JSON, nullable=True)
    coverage_complete = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
