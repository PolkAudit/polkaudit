"""P0-3 backend regressions: lifecycle ordering, money, CSV, alerts, API compat."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("P03_TEST_DATABASE_URL", "postgresql+asyncpg://localhost/polkaudit_p03_test"),
)
os.environ.setdefault("API_KEY", "p03-test-key")

TEST_DB = os.environ["DATABASE_URL"]


@pytest_asyncio.fixture
async def engine():
    from src.database import Base
    import src.models.project  # noqa: F401 — FK target for proposals
    import src.models.proposal  # noqa: F401
    import src.models.indexer  # noqa: F401

    eng = create_async_engine(TEST_DB, future=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def session_maker(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_02_deterministic_proposal_lifecycle_ordering(session_maker):
    from src.models.proposal import Proposal
    from src.services.governance import GovernanceService, lifecycle_sort_key

    async with session_maker() as session:
        # Insert Confirmed before Submitted in id order to prove we don't use .first()
        session.add(
            Proposal(
                proposal_index=1674,
                block_number=26923064,
                event_index=3,
                section="Referenda",
                method="Confirmed",
                proposer="unknown",
                status="Approved",
                event_key="k-confirmed",
            )
        )
        session.add(
            Proposal(
                proposal_index=1674,
                block_number=26863938,
                event_index=61,
                section="Referenda",
                method="Submitted",
                proposer="5Alice",
                status="Proposed",
                event_key="k-submitted",
            )
        )
        await session.commit()

        gov = GovernanceService(session)
        d1 = await gov.get_proposal_detail(1674)
        d2 = await gov.get_proposal_detail(1674)
        assert d1 is not None and d2 is not None
        assert d1.status == "Approved"
        assert d1.method == "Confirmed"
        assert d1.proposer == "5Alice"
        assert [e.method for e in d1.lifecycle] == ["Submitted", "Confirmed"]
        assert d1.model_dump() == d2.model_dump()

        listing = await gov.get_proposals()
        assert len(listing) == 1
        assert listing[0].method == "Confirmed"


def test_03_dot_and_04_usdc_and_05_unknown_and_06_mixed_aggregation():
    from src.money import (
        format_display_amount,
        aggregate_by_asset,
        from_spend_row,
        format_alert_amount,
    )

    class Row:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    assert format_display_amount("10000000000", 10) == "1"
    usdc = Row(
        value="795500000000",
        source_chain="polkadot-asset-hub",
        asset_id="1337",
        asset_symbol="USDC",
        decimals=6,
        amount_display="795500",
        display_status="resolved",
    )
    amt = from_spend_row(usdc)
    assert amt.amount_display == "795500"
    assert "USDC" in format_alert_amount(usdc)
    assert "DOT" not in format_alert_amount(usdc)

    unknown = Row(
        value="42",
        source_chain="polkadot",
        asset_id="999",
        asset_symbol=None,
        decimals=None,
        amount_display=None,
        display_status="unresolved",
    )
    assert from_spend_row(unknown).display_status == "unresolved"

    dot = Row(
        value="10000000000",
        source_chain="polkadot",
        asset_id="native",
        asset_symbol="DOT",
        decimals=10,
        amount_display="1",
        display_status="resolved",
    )
    mixed = aggregate_by_asset([usdc, dot])
    assert mixed["aggregation"] == "mixed_refused"
    assert mixed["total_treasury_spend"] == "mixed_assets"
    assert len(mixed["by_asset"]) == 2

    single = aggregate_by_asset([usdc, usdc])
    assert single["aggregation"] == "single_asset"
    assert single["total_treasury_spend"] == "1591000000000"


@pytest.mark.asyncio
async def test_07_csv_export_correctness(session_maker):
    from src.models.proposal import TreasurySpend, Proposal
    from src.services.export_csv import build_treasury_csv, build_proposals_csv

    async with session_maker() as session:
        session.add(
            TreasurySpend(
                block_number=28040602,
                beneficiary="5Ben",
                value="795500000000",
                source_chain="polkadot-asset-hub",
                asset_id="1337",
                asset_symbol="USDC",
                decimals=6,
                amount_display="795500",
                display_status="resolved",
                event_key="t1",
            )
        )
        session.add(
            Proposal(
                proposal_index=7,
                block_number=1,
                event_index=0,
                section="Referenda",
                method="Submitted",
                proposer="a",
                status="Proposed",
                event_key="p1",
            )
        )
        session.add(
            Proposal(
                proposal_index=7,
                block_number=2,
                event_index=1,
                section="Referenda",
                method="Confirmed",
                proposer="a",
                status="Approved",
                event_key="p2",
            )
        )
        await session.commit()
        tcsv = await build_treasury_csv(session)
        assert "value_planck" not in tcsv
        assert "amount_raw" in tcsv
        assert "USDC" in tcsv
        assert "795500" in tcsv
        pcs = await build_proposals_csv(session)
        # one canonical row for index 7
        assert pcs.count("\n") == 2  # header + 1
        assert "Confirmed" in pcs


def test_08_alert_and_report_unit_consistency():
    """Alert/report helpers must not label USDC raw amounts as DOT."""
    from src.models.proposal import TreasurySpend
    from src.money import format_alert_amount, aggregate_by_asset

    spend = TreasurySpend(
        block_number=1,
        beneficiary="5X",
        value="795500000000",
        asset_symbol="USDC",
        decimals=6,
        amount_display="795500",
        display_status="resolved",
        asset_id="1337",
        source_chain="polkadot-asset-hub",
    )
    msg = format_alert_amount(spend)
    assert "USDC" in msg
    assert "DOT" not in msg
    agg = aggregate_by_asset([spend])
    assert agg["aggregation"] == "single_asset"
    assert agg["by_asset"][0]["asset_symbol"] == "USDC"
    # Report path uses per-asset lines, never a forced DOT total
    assert "DOT" not in str(agg["by_asset"])


def test_09_api_compatibility_proposal_response():
    from src.schemas.proposal import ProposalResponse
    from src.schemas.treasury import TreasurySpendResponse
    from src.schemas.stats import StatsOverview

    class Row:
        id = 1
        proposal_index = 1674
        block_number = 1
        section = "Referenda"
        method = "Confirmed"
        proposer = "a"
        args = None
        status = "Approved"

    assert ProposalResponse.model_validate(Row(), from_attributes=True).proposal_index == 1674

    class T:
        id = 1
        block_number = 1
        beneficiary = "b"
        value = "1"
        source_chain = "polkadot"
        asset_id = "native"
        asset_symbol = "DOT"
        decimals = 10
        amount_display = "0.0000000001"
        display_status = "resolved"

    tr = TreasurySpendResponse.model_validate(T(), from_attributes=True)
    assert tr.value == "1"
    assert tr.asset_symbol == "DOT"

    # StatsOverview still accepts legacy-style construction with new defaults
    s = StatsOverview(
        total_proposals=1,
        total_votes=0,
        total_treasury_spend="0",
        total_blocks_indexed=0,
        total_extrinsics=0,
        last_indexed_block=0,
    )
    assert s.treasury_aggregation == "empty"
