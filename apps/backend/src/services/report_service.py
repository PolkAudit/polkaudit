import hashlib
import json
import uuid
from datetime import datetime
from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from src.models.report import Report
from src.models.proposal import Proposal, TreasurySpend
import structlog

logger = structlog.get_logger()

class ConfiguredPDF(FPDF):
    def header(self):
        self.set_font('helvetica', 'B', 12)
        self.cell(0, 10, 'PolkAudit Compliance Report', border=False, align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('helvetica', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_report(self, title: str, report_type: str, start: datetime, end: datetime):
        # 1. Aggregate Data
        proposals_result = await self.db.execute(
            select(func.count(Proposal.id)).where(Proposal.block_number >= 0) # Placeholder filtering
        )
        total_proposals = proposals_result.scalar() or 0

        from src.money import aggregate_by_asset

        spends = list(
            (
                await self.db.execute(
                    select(TreasurySpend).where(TreasurySpend.block_number >= 0)
                )
            ).scalars().all()
        )
        agg = aggregate_by_asset(spends)
        spend_count = len(spends)

        # Risk Logic — only when a single resolved asset; never mix assets
        risk_score = 0.0
        if agg["aggregation"] == "single_asset" and agg["by_asset"]:
            try:
                raw_sum = int(agg["by_asset"][0]["amount_raw_sum"])
                if spend_count > 0 and (raw_sum / spend_count) > 1_000_000:
                    risk_score += 5.0
            except (TypeError, ValueError, ZeroDivisionError):
                pass

        summary = {
            "total_proposals": total_proposals,
            "treasury_aggregation": agg["aggregation"],
            "treasury_by_asset": agg["by_asset"],
            "spend_count": spend_count,
        }

        # 2. Generate PDF
        pdf = ConfiguredPDF()
        pdf.add_page()
        pdf.set_font("helvetica", size=12)
        
        pdf.cell(0, 10, f"Title: {title}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Type: {report_type.capitalize()}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Period: {start.date()} to {end.date()}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(10)
        
        pdf.set_font("helvetica", 'B', 14)
        pdf.cell(0, 10, "Summary", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", size=12)
        pdf.cell(0, 10, f"Total Proposals: {total_proposals}", new_x="LMARGIN", new_y="NEXT")
        if agg["aggregation"] == "mixed_refused":
            pdf.cell(
                0,
                10,
                "Treasury Spend: MIXED ASSETS — totals refused (see per-asset lines)",
                new_x="LMARGIN",
                new_y="NEXT",
            )
        elif agg["by_asset"]:
            for row in agg["by_asset"]:
                sym = row.get("asset_symbol") or f"asset:{row.get('asset_id')}"
                disp = row.get("amount_display_sum") or row.get("amount_raw_sum")
                status = row.get("display_status")
                pdf.cell(
                    0,
                    10,
                    f"Treasury ({sym}): {disp} [{status}] raw={row.get('amount_raw_sum')}",
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
        else:
            pdf.cell(0, 10, "Treasury Spend: none", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Number of Spends: {spend_count}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Risk Score: {risk_score}/10", new_x="LMARGIN", new_y="NEXT")
        
        # Save PDF
        filename = f"report_{uuid.uuid4()}.pdf"
        storage_path = f"/tmp/{filename}" # In real app, upload to S3
        pdf.output(storage_path)
        
        # Calculate Hash
        with open(storage_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()

        # 3. Store Record
        report = Report(
            title=title,
            type=report_type,
            period_start=start,
            period_end=end,
            risk_score=risk_score,
            summary_data=summary,
            file_hash=file_hash,
            storage_path=storage_path
        )
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)
        
        return report

    async def get_report(self, report_id: int):
        return await self.db.get(Report, report_id)

    async def list_reports(self):
        result = await self.db.execute(select(Report).order_by(Report.generated_at.desc()))
        return result.scalars().all()
