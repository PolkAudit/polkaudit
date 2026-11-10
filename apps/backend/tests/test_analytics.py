import pytest
from unittest.mock import AsyncMock, MagicMock

from src.services.stats import StatsService


class _Spend:
    value = "1000"
    source_chain = "polkadot"
    asset_id = "native"
    asset_symbol = "DOT"
    decimals = 10
    amount_display = "0.0000001"
    display_status = "resolved"


@pytest.mark.asyncio
async def test_stats_overview():
    mock_db = AsyncMock()
    # Order matches StatsService.get_overview scalar/execute calls
    mock_db.scalar.side_effect = [
        12,  # count Proposal.id
        10,  # distinct proposal_index
        5,  # votes
        200,  # blocks
        400,  # extrinsics
        31387000,  # last processed
        100,  # last prop block
        90,  # last vote block
        80,  # last spend block
    ]
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = [_Spend(), _Spend()]
    mock_db.execute = AsyncMock(return_value=exec_result)

    service = StatsService(mock_db)
    overview = await service.get_overview()

    assert overview.total_proposals == 10  # distinct indices
    assert overview.total_votes == 5
    assert overview.total_treasury_spend == "2000"
    assert overview.treasury_aggregation == "single_asset"
    assert overview.total_blocks_indexed == 200
    assert overview.total_extrinsics == 400
    assert overview.last_indexed_block == 31387000
