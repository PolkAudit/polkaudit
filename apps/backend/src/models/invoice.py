from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from src.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    payment_event_id = Column(Integer, ForeignKey("payment_events.id"), nullable=True)
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    plan_slug = Column(String, nullable=True)
    amount_usd_cents = Column(Integer, nullable=False, default=0)
    currency = Column(String, nullable=False, default="USD")
    status = Column(String, nullable=False, default="paid")
    pdf_path = Column(String, nullable=True)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
