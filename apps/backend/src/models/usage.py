from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from src.database import Base


class UsageCounter(Base):
    """Monthly usage counters per project (API + exports)."""

    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint("project_id", "period", name="uq_usage_project_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False)  # YYYY-MM
    api_calls = Column(Integer, nullable=False, default=0)
    export_calls = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExportSchedule(Base):
    __tablename__ = "export_schedules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False, default="weekly-exports")
    export_type = Column(String, nullable=False, default="proposals")  # proposals | treasury | both
    cadence = Column(String, nullable=False, default="weekly")  # daily | weekly | monthly
    is_active = Column(Integer, nullable=False, default=1)  # 1/0 for broad DB compat
    created_at = Column(DateTime(timezone=True), server_default=func.now())
