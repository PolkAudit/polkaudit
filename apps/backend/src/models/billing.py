from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from src.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    export_limit_daily = Column(Integer, nullable=False, default=50)
    retention_blocks = Column(Integer, nullable=False, default=100000)
    is_active = Column(Boolean, nullable=False, default=True)
    # Deprecated: kept for DB compat; checkout uses price_usd_cents only.
    price_inr_paise = Column(Integer, nullable=False, default=0)
    price_usd_cents = Column(Integer, nullable=False, default=0)
    # month | once_3mo | custom
    billing_interval = Column(String, nullable=False, default="month")
    currency = Column(String, nullable=False, default="USD")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    status = Column(String, nullable=False, default="active")  # active | past_due | cancelled
    billing_note = Column(String, nullable=True)
    razorpay_payment_link_id = Column(String, nullable=True)
    starts_at = Column(DateTime(timezone=True), server_default=func.now())
    ends_at = Column(DateTime(timezone=True), nullable=True)


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, default="razorpay")
    event_id = Column(String, nullable=True, index=True)
    event_type = Column(String, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
