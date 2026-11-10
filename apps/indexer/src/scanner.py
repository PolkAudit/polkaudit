import asyncio
import structlog
from sqlalchemy.future import select
from sqlalchemy import func
from .config import settings
from .database import engine
from .models import ProcessedBlock, DeadLetterQueue, Block, IndexerCursor
from .server import BLOCKS_PROCESSED, BLOCKS_FAILED, LAST_PROCESSED_BLOCK
from .parser import ChainParser
from .persistence import (
    upsert_block,
    insert_entities_idempotent,
    insert_extrinsics_idempotent,
    advance_cursor,
    bootstrap_cursor_from_processed,
)
from .writer_lock import WriterLock, ExclusiveLockError

logger = structlog.get_logger()


class EventFetchError(RuntimeError):
    """Raised when System.Events cannot be fetched for a finalized block."""


class FinalizedScanner:
    def __init__(self, session_maker, parser: ChainParser | None = None, engine_=None):
        self.session_maker = session_maker
        self.engine = engine_ or engine
        self.rpc_url = settings.SUBSTRATE_RPC_URL
        self.parser = parser or ChainParser()
        self._segment_start: int | None = None

    async def get_finalized_head(self, http_session):
        async with http_session.post(
            self.rpc_url,
            json={"jsonrpc": "2.0", "method": "chain_getFinalizedHead", "params": [], "id": 1}
        ) as response:
            result = await response.json()
            return result.get("result")

    async def get_block(self, http_session, block_hash):
        async with http_session.post(
            self.rpc_url,
            json={"jsonrpc": "2.0", "method": "chain_getBlock", "params": [block_hash], "id": 1}
        ) as response:
            result = await response.json()
            return result.get("result")

    async def get_block_hash(self, http_session, block_number):
        async with http_session.post(
            self.rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "chain_getBlockHash",
                "params": [block_number],
                "id": 1,
            },
        ) as response:
            result = await response.json()
            return result.get("result")

    def _fetch_events_sync(self, block_hash: str) -> list:
        """Decode System.Events for the block using substrate-interface."""
        try:
            events = self.parser.substrate.get_events(block_hash=block_hash)
            out = []
            for ev in events or []:
                if hasattr(ev, "value"):
                    out.append(ev.value if isinstance(ev.value, dict) else {"event": ev.value})
                elif isinstance(ev, dict):
                    out.append(ev)
            return out
        except Exception as exc:
            raise EventFetchError(f"Failed to fetch events for {block_hash}: {exc}") from exc

    async def get_last_processed_block(self):
        async with self.session_maker() as session:
            result = await session.execute(select(func.max(ProcessedBlock.block_number)))
            return result.scalar() or 0

    async def get_contiguous_through(self) -> int | None:
        async with self.session_maker() as session:
            cursor = await session.get(IndexerCursor, 1)
            return cursor.contiguous_through if cursor else None

    def _validate_bounds(self, start: int, end: int | None) -> None:
        if start < 0:
            raise ValueError(f"INDEXER_START_BLOCK must be >= 0, got {start}")
        if end is not None and end > 0 and start > 0 and end < start:
            raise ValueError(
                f"INDEXER_END_BLOCK ({end}) must be >= INDEXER_START_BLOCK ({start})"
            )

    def _resolve_next_block(self, last_processed: int, finalized_number: int) -> int | None:
        """Choose next block to index. Returns None when past END or up-to-date."""
        start_block = settings.INDEXER_START_BLOCK
        end_block = settings.INDEXER_END_BLOCK
        self._validate_bounds(start_block, end_block if end_block > 0 else None)

        if start_block > 0 and last_processed < start_block - 1:
            logger.info(
                "Skipping ahead to INDEXER_START_BLOCK",
                start_block=start_block,
                last_processed=last_processed,
            )
            next_block = start_block
            self._segment_start = start_block
        elif last_processed == 0:
            window_start = max(1, finalized_number - settings.INDEXER_CATCHUP_WINDOW)
            logger.info(
                "Fresh index: starting near chain head",
                start_block=window_start,
                window=settings.INDEXER_CATCHUP_WINDOW,
            )
            next_block = window_start
            self._segment_start = window_start
        else:
            next_block = last_processed + 1
            self._segment_start = None

        if end_block > 0 and next_block > end_block:
            logger.info(
                "Reached INDEXER_END_BLOCK",
                end_block=end_block,
                next_block=next_block,
            )
            return None

        if next_block > finalized_number:
            return None

        return next_block

    async def _dialect_name(self, session) -> str:
        return session.bind.dialect.name if session.bind is not None else "postgresql"

    async def process_block(self, block_data, block_number, block_hash):
        try:
            extrinsics = block_data.get("block", {}).get("extrinsics", [])

            async with self.session_maker() as session:
                existing = await session.get(ProcessedBlock, block_number)
                if existing:
                    return

                dialect = await self._dialect_name(session)

                try:
                    loop = asyncio.get_running_loop()
                    if settings.INDEXER_REQUIRE_EVENTS:
                        events = await loop.run_in_executor(
                            None, self._fetch_events_sync, block_hash
                        )
                    else:
                        try:
                            events = await loop.run_in_executor(
                                None, self._fetch_events_sync, block_hash
                            )
                        except EventFetchError as exc:
                            logger.warning("Event fetch failed; continuing extrinsic-only", error=str(exc))
                            events = []

                    parsed_data = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            lambda: self.parser.parse_block(
                                block_number,
                                extrinsics,
                                events,
                                block_hash=block_hash,
                            ),
                        ),
                        timeout=120,
                    )

                    p_count = len(parsed_data["proposals"])
                    v_count = len(parsed_data["votes"])
                    t_count = len(parsed_data["treasury_spends"])
                    e_count = len(parsed_data["extrinsics"])

                    if p_count > 0 or v_count > 0 or t_count > 0:
                        logger.info(
                            "Found governance",
                            block=block_number,
                            proposals=p_count,
                            votes=v_count,
                            spends=t_count,
                            events=len(events or []),
                        )

                    block_entity = Block(
                        block_number=block_number,
                        block_hash=block_hash,
                        parent_hash=block_data.get("block", {}).get("header", {}).get("parentHash", "0x"),
                        extrinsics_count=len(extrinsics),
                        events_count=len(events or []),
                    )
                    await upsert_block(session, block_entity, dialect)

                    await insert_extrinsics_idempotent(session, parsed_data["extrinsics"], dialect)
                    await insert_entities_idempotent(session, parsed_data["proposals"], dialect)
                    await insert_entities_idempotent(session, parsed_data["votes"], dialect)
                    await insert_entities_idempotent(session, parsed_data["treasury_spends"], dialect)

                except Exception as parse_error:
                    logger.error("Parsing failed - Rolling back", block=block_number, error=str(parse_error))
                    await session.rollback()
                    raise parse_error

                processed_block = ProcessedBlock(
                    block_number=block_number,
                    block_hash=block_hash,
                )
                session.add(processed_block)

                await advance_cursor(
                    session,
                    block_number,
                    range_start=self._segment_start,
                )
                self._segment_start = None

                await session.commit()
                logger.info(
                    "Successfully committed block",
                    block_number=block_number,
                    blocks_added=1,
                    extrinsics_added=e_count,
                    governance_added=p_count + v_count + t_count,
                )

                BLOCKS_PROCESSED.inc()
                LAST_PROCESSED_BLOCK.set(block_number)

        except Exception as e:
            logger.error("Failed to process block", block_number=block_number, error=str(e))
            BLOCKS_FAILED.inc()
            async with self.session_maker() as session:
                import traceback

                dlq_entry = DeadLetterQueue(
                    block_number=block_number,
                    error_message=f"{str(e)}\nTraceback:\n{traceback.format_exc()}",
                )
                session.add(dlq_entry)
                await session.commit()
            raise

    async def run(self):
        import aiohttp

        logger.info("Starting FinalizedScanner")
        lock = WriterLock(self.engine)
        try:
            await lock.acquire()
        except ExclusiveLockError:
            logger.error("Exclusive writer lock unavailable — refusing to start")
            raise

        async with self.session_maker() as session:
            await bootstrap_cursor_from_processed(session)
            await session.commit()

        timeout = aiohttp.ClientTimeout(total=90, connect=30)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as http_session:
                while True:
                    try:
                        finalized_hash = await self.get_finalized_head(http_session)
                        if not finalized_hash:
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        finalized_block = await self.get_block(http_session, finalized_hash)
                        if not finalized_block:
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        finalized_number = int(finalized_block["block"]["header"]["number"], 16)

                        last_processed = await self.get_last_processed_block()
                        next_block = self._resolve_next_block(last_processed, finalized_number)

                        if next_block is None:
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        logger.info(
                            "Catching up",
                            next_block=next_block,
                            target=finalized_number,
                            last_processed=last_processed,
                        )

                        next_hash = await self.get_block_hash(http_session, next_block)
                        if not next_hash:
                            logger.error(
                                "Missing block hash — not advancing cursor",
                                block=next_block,
                            )
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        block_data = await self.get_block(http_session, next_hash)
                        if not block_data:
                            logger.error(
                                "Missing block body — not advancing cursor",
                                block=next_block,
                            )
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        try:
                            await self.process_block(block_data, next_block, next_hash)
                        except Exception:
                            # Failure recorded in DLQ; cursor unchanged — retry same height
                            await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                            continue

                        await asyncio.sleep(0.1)

                    except asyncio.CancelledError:
                        logger.info("Scanner task cancelled")
                        break
                    except Exception as e:
                        logger.error("Error in scanner loop", error=str(e))
                        await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
        finally:
            await lock.release()
