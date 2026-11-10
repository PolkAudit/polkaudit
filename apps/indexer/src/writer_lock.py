"""Exclusive single-writer lock for indexer persistence.

Uses PostgreSQL session-level advisory locks when available. Falls back to an
OS file lock for local non-Postgres test environments.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

# Stable 64-bit key derived from "POLKAUDI" (8 chars)
ADVISORY_LOCK_KEY = 0x504F4C4B41554449


class ExclusiveLockError(RuntimeError):
    """Raised when another writer already holds the indexer lock."""


class WriterLock:
    def __init__(self, engine: AsyncEngine, lock_path: str | None = None):
        self.engine = engine
        self.lock_path = Path(
            lock_path
            or os.environ.get("INDEXER_LOCK_PATH", "/tmp/polkaudit-indexer.write.lock")
        )
        self._conn: AsyncConnection | None = None
        self._file = None
        self._backend: str | None = None

    async def acquire(self) -> None:
        dialect = self.engine.dialect.name
        if dialect == "postgresql":
            await self._acquire_postgres()
        else:
            await self._acquire_file()

    async def _acquire_postgres(self) -> None:
        conn = await self.engine.connect()
        try:
            result = await conn.execute(
                text("SELECT pg_try_advisory_lock(:k)"),
                {"k": ADVISORY_LOCK_KEY},
            )
            got = bool(result.scalar())
            if not got:
                await conn.close()
                raise ExclusiveLockError(
                    "Indexer exclusive lock unavailable — another writer is active"
                )
            # Keep connection open for the lock lifetime
            self._conn = conn
            self._backend = "postgres"
        except Exception:
            if self._conn is None:
                await conn.close()
            raise

    async def _acquire_file(self) -> None:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        # Blocking flock in a thread so we can fail-fast with non-blocking LOCK_NB
        def _try_lock():
            import fcntl

            fh = open(self.lock_path, "a+", encoding="utf-8")
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                fh.close()
                raise ExclusiveLockError(
                    "Indexer exclusive lock unavailable — another writer is active"
                )
            return fh

        self._file = await asyncio.to_thread(_try_lock)
        self._backend = "file"

    async def release(self) -> None:
        if self._backend == "postgres" and self._conn is not None:
            try:
                await self._conn.execute(
                    text("SELECT pg_advisory_unlock(:k)"),
                    {"k": ADVISORY_LOCK_KEY},
                )
            finally:
                await self._conn.close()
                self._conn = None
        elif self._file is not None:
            import fcntl

            try:
                fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
            finally:
                self._file.close()
                self._file = None
        self._backend = None

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.release()
        return False
