"""Generate formal invoice PDFs from payment / subscription events."""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.billing import PaymentEvent, Plan, Subscription
from src.models.invoice import Invoice
from src.models.project import Project


class InvoicePDF(FPDF):
    def header(self):
        self.set_font("helvetica", "B", 14)
        self.cell(0, 10, "PolkAudit Invoice", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def _invoice_number(project_id: int) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"PA-{project_id}-{stamp}-{uuid.uuid4().hex[:6].upper()}"


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_invoices(self, project_id: int) -> list[Invoice]:
        result = await self.db.execute(
            select(Invoice)
            .where(Invoice.project_id == project_id)
            .order_by(Invoice.issued_at.desc())
        )
        return list(result.scalars().all())

    async def get_invoice(self, project_id: int, invoice_id: int) -> Optional[Invoice]:
        result = await self.db.execute(
            select(Invoice).where(Invoice.id == invoice_id, Invoice.project_id == project_id)
        )
        return result.scalars().first()

    async def create_from_payment(
        self,
        *,
        project_id: int,
        payment_event_id: Optional[int],
        plan_slug: Optional[str],
        amount_usd_cents: int,
        currency: str = "USD",
    ) -> Invoice:
        project = await self.db.get(Project, project_id)
        project_name = project.name if project else f"Project {project_id}"
        number = _invoice_number(project_id)

        pdf = InvoicePDF()
        pdf.add_page()
        pdf.set_font("helvetica", size=11)
        pdf.cell(0, 8, f"Invoice: {number}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(
            0,
            8,
            f"Issued: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.cell(0, 8, f"Bill to: {project_name} (#{project_id})", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Charges", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", size=11)
        pdf.cell(0, 8, f"Plan: {plan_slug or 'custom'}", new_x="LMARGIN", new_y="NEXT")
        amount = amount_usd_cents / 100.0
        pdf.cell(
            0,
            8,
            f"Amount: {currency} {amount:,.2f}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.cell(0, 8, "Status: paid", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(8)
        pdf.set_font("helvetica", "I", 9)
        pdf.multi_cell(
            0,
            5,
            "Thank you for your payment. This receipt confirms PolkAudit SaaS access "
            "for the billed period. Contact hello@polkaudit.xyz for questions.",
        )

        path = f"/tmp/invoice_{number}.pdf"
        pdf.output(path)

        inv = Invoice(
            project_id=project_id,
            payment_event_id=payment_event_id,
            invoice_number=number,
            plan_slug=plan_slug,
            amount_usd_cents=int(amount_usd_cents or 0),
            currency=currency or "USD",
            status="paid",
            pdf_path=path,
        )
        self.db.add(inv)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def ensure_from_event(self, event: PaymentEvent, plan_slug: str | None = None) -> Optional[Invoice]:
        if not event.project_id:
            return None
        existing_res = await self.db.execute(
            select(Invoice).where(Invoice.payment_event_id == event.id)
        )
        found = existing_res.scalars().first()
        if found:
            return found

        payload: dict[str, Any] = event.payload if isinstance(event.payload, dict) else {}
        amount = 0
        currency = "USD"
        # Razorpay payment link payload shapes vary; best-effort extract
        payment = payload.get("payment") or payload.get("payload", {}).get("payment", {})
        entity = payment.get("entity") if isinstance(payment, dict) else {}
        if isinstance(entity, dict):
            amount = int(entity.get("amount") or 0)  # already minor units for some currencies
            currency = (entity.get("currency") or "USD").upper()
        if amount <= 0 and plan_slug:
            plan = (
                await self.db.execute(select(Plan).where(Plan.slug == plan_slug))
            ).scalars().first()
            if plan:
                amount = int(plan.price_usd_cents or 0)

        return await self.create_from_payment(
            project_id=event.project_id,
            payment_event_id=event.id,
            plan_slug=plan_slug,
            amount_usd_cents=amount,
            currency=currency,
        )

    async def create_manual(
        self, project_id: int, plan_slug: str | None = None, note: str | None = None
    ) -> Invoice:
        amount = 0
        if plan_slug:
            plan = (
                await self.db.execute(select(Plan).where(Plan.slug == plan_slug))
            ).scalars().first()
            if plan:
                amount = int(plan.price_usd_cents or 0)
        inv = await self.create_from_payment(
            project_id=project_id,
            payment_event_id=None,
            plan_slug=plan_slug,
            amount_usd_cents=amount,
        )
        if note:
            inv.status = "paid"
            await self.db.commit()
        return inv
