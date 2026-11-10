"""Local isolated Postgres fixtures for P0-2B replay safety tests.

Uses database: polkaudit_p02b_test on localhost (created by operator/agent).
Never points at shared/production Neon URLs.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure indexer src is importable as `src.*`
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TEST_DATABASE_URL = os.environ.get(
    "P02B_TEST_DATABASE_URL",
    "postgresql+asyncpg://localhost/polkaudit_p02b_test",
)

# Satisfy Settings() import side effects for modules under test
os.environ.setdefault("DATABASE_URL", TEST_DATABASE_URL)
os.environ.setdefault("SUBSTRATE_RPC_URL", "ws://127.0.0.1:9944")
os.environ.setdefault("INDEXER_REQUIRE_EVENTS", "true")
os.environ.setdefault("INDEXER_START_BLOCK", "0")
os.environ.setdefault("INDEXER_END_BLOCK", "0")


@pytest.fixture(scope="session")
def database_url():
    return TEST_DATABASE_URL


@pytest_asyncio.fixture
async def engine(database_url):
    import src.models  # noqa: F401 — register all models on Base.metadata
    from src.database import Base

    eng = create_async_engine(database_url, echo=False, future=True)
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


@pytest_asyncio.fixture
async def session(session_maker):
    async with session_maker() as s:
        yield s
