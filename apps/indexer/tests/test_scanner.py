import pytest
from unittest.mock import AsyncMock, MagicMock

from src.scanner import FinalizedScanner


@pytest.mark.asyncio
async def test_scanner_processes_block(monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_REQUIRE_EVENTS", False)

    mock_session = MagicMock()

    scanner = FinalizedScanner(mock_session, engine_=MagicMock())
    scanner.parser = MagicMock()
    scanner.parser.parse_block.return_value = {
        "proposals": [],
        "votes": [],
        "treasury_spends": [],
        "extrinsics": [],
    }
    scanner._fetch_events_sync = MagicMock(return_value=[])
    scanner._segment_start = 100

    block_data = {
        "block": {
            "header": {"number": "0x64", "parentHash": "0xparent"},
            "extrinsics": [],
        }
    }

    scanner.session_maker = MagicMock()
    mock_db_session = AsyncMock()
    mock_db_session.bind = MagicMock()
    mock_db_session.bind.dialect.name = "postgresql"
    scanner.session_maker.return_value.__aenter__.return_value = mock_db_session
    mock_db_session.get.return_value = None
    mock_db_session.execute = AsyncMock()

    # Avoid real persistence helpers failing on mocks — patch them
    import src.scanner as scanner_mod

    monkeypatch.setattr(scanner_mod, "upsert_block", AsyncMock())
    monkeypatch.setattr(scanner_mod, "insert_extrinsics_idempotent", AsyncMock())
    monkeypatch.setattr(scanner_mod, "insert_entities_idempotent", AsyncMock(return_value=0))
    monkeypatch.setattr(scanner_mod, "advance_cursor", AsyncMock())

    await scanner.process_block(block_data, 100, "0xblockhash")

    scanner.parser.parse_block.assert_called_once_with(
        100, [], [], block_hash="0xblockhash"
    )
    assert mock_db_session.commit.called


@pytest.mark.asyncio
async def test_resolve_end_block(monkeypatch):
    from src import config as cfg

    monkeypatch.setattr(cfg.settings, "INDEXER_START_BLOCK", 0)
    monkeypatch.setattr(cfg.settings, "INDEXER_END_BLOCK", 10)
    scanner = FinalizedScanner(MagicMock())
    assert scanner._resolve_next_block(10, 100) is None
    assert scanner._resolve_next_block(9, 100) == 10
