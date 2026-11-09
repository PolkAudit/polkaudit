import asyncio
import structlog
from sqlalchemy.future import select
from sqlalchemy import func
from .config import settings
from .database import async_session
from .models import ProcessedBlock, Proposal, Vote, TreasurySpend, DeadLetterQueue, Block, Extrinsic
from .server import BLOCKS_PROCESSED, BLOCKS_FAILED, LAST_PROCESSED_BLOCK
from .parser import ChainParser

logger = structlog.get_logger()

class FinalizedScanner:
    def __init__(self, session_maker, parser: ChainParser | None = None):
        self.session_maker = session_maker
        self.rpc_url = settings.SUBSTRATE_RPC_URL
        self.parser = parser or ChainParser()

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
            json={"jsonrpc": "2.0", "method": "chain_getBlockHash", "params": [block_number], "id": 1}
        ) as response:
            result = await response.json()
            return result.get("result")

    def _fetch_events_sync(self, block_hash: str) -> list:
        """Decode System.Events for the block using substrate-interface."""
        try:
            events = self.parser.substrate.get_events(block_hash=block_hash)
            # Normalize to list of dicts
            out = []
            for ev in events or []:
                if hasattr(ev, "value"):
                    out.append(ev.value if isinstance(ev.value, dict) else {"event": ev.value})
                elif isinstance(ev, dict):
                    out.append(ev)
            return out
        except Exception as exc:
            logger.debug("Could not fetch events", error=str(exc))
            return []

    async def get_last_processed_block(self):
        async with self.session_maker() as session:
            result = await session.execute(select(func.max(ProcessedBlock.block_number)))
            return result.scalar() or 0

    def _resolve_next_block(self, last_processed: int, finalized_number: int) -> int:
        """Choose next block to index (supports demo skip via INDEXER_START_BLOCK)."""
        start_block = settings.INDEXER_START_BLOCK
        if start_block > 0 and last_processed < start_block - 1:
            logger.info(
                "Skipping ahead to INDEXER_START_BLOCK",
                start_block=start_block,
                last_processed=last_processed,
            )
            return start_block

        if last_processed == 0:
            window_start = max(1, finalized_number - settings.INDEXER_CATCHUP_WINDOW)
            logger.info(
                "Fresh index: starting near chain head",
                start_block=window_start,
                window=settings.INDEXER_CATCHUP_WINDOW,
            )
            return window_start

        return last_processed + 1

    async def process_block(self, block_data, block_number, block_hash):
        try:
            # Placeholder for event extraction logic
            # In a real implementation, we would parse extrinsics and events here
            # For now, we simulate finding a Treasury Spend
            
            extrinsics = block_data.get("block", {}).get("extrinsics", [])
            
            async with self.session_maker() as session:
                # Check if already processed to be safe
                existing = await session.get(ProcessedBlock, block_number)
                if existing:
                    return

                # Decode extrinsics + system events
                try:
                    loop = asyncio.get_running_loop()
                    events = await loop.run_in_executor(
                        None, self._fetch_events_sync, block_hash
                    )
                    parsed_data = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            self.parser.parse_block,
                            block_number,
                            extrinsics,
                            events,
                        ),
                        timeout=120,
                    )

                    p_count = len(parsed_data['proposals'])
                    v_count = len(parsed_data['votes'])
                    t_count = len(parsed_data['treasury_spends'])
                    e_count = len(parsed_data['extrinsics'])

                    if p_count > 0 or v_count > 0 or t_count > 0:
                        logger.info(
                            "Found governance",
                            block=block_number,
                            proposals=p_count,
                            votes=v_count,
                            spends=t_count,
                            events=len(events or []),
                        )

                    # --- Save Base Entities (Atomic Transaction) ---

                    # 1. Block
                    block_entity = Block(
                        block_number=block_number,
                        block_hash=block_hash,
                        parent_hash=block_data.get("block", {}).get("header", {}).get("parentHash", "0x"),
                        extrinsics_count=len(extrinsics),
                        events_count=len(events or []),
                    )
                    session.add(block_entity)

                    # 2. Extrinsics
                    if parsed_data['extrinsics']:
                        session.add_all(parsed_data['extrinsics'])

                    # 3. Governance Entities
                    session.add_all(parsed_data['proposals'])
                    session.add_all(parsed_data['votes'])
                    session.add_all(parsed_data['treasury_spends'])
                    
                except Exception as parse_error:
                    logger.error("Parsing failed - Rolling back", block=block_number, error=str(parse_error))
                    await session.rollback()
                    # Re-raise to trigger DLQ in outer loop
                    raise parse_error
                
                # 4. ProcessedBlock Marker
                processed_block = ProcessedBlock(
                    block_number=block_number,
                    block_hash=block_hash
                )
                session.add(processed_block)
                
                # Commit All
                await session.commit()
                logger.info("Successfully committed block", block_number=block_number, 
                            blocks_added=1, extrinsics_added=e_count, governance_added=p_count+v_count+t_count)
                
                BLOCKS_PROCESSED.inc()
                LAST_PROCESSED_BLOCK.set(block_number)

        except Exception as e:
            logger.error("Failed to process block", block_number=block_number, error=str(e))
            BLOCKS_FAILED.inc()
            async with self.session_maker() as session:
                import traceback
                dlq_entry = DeadLetterQueue(
                    block_number=block_number,
                    error_message=f"{str(e)}\nTraceback:\n{traceback.format_exc()}"
                )
                session.add(dlq_entry)
                await session.commit()

    async def run(self):
        import aiohttp

        logger.info("Starting FinalizedScanner")
        timeout = aiohttp.ClientTimeout(total=90, connect=30)
        async with aiohttp.ClientSession(timeout=timeout) as http_session:
            while True:
                try:
                    # 1. Get Chain Finalized Head
                    finalized_hash = await self.get_finalized_head(http_session)
                    if not finalized_hash:
                        await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                        continue
                        
                    finalized_block = await self.get_block(http_session, finalized_hash)
                    if not finalized_block:
                         await asyncio.sleep(settings.RETRY_DELAY_SECONDS)
                         continue
                         
                    finalized_number = int(finalized_block['block']['header']['number'], 16)
                    
                    # 2. Get DB Last Processed
                    last_processed = await self.get_last_processed_block()
                    next_block = self._resolve_next_block(last_processed, finalized_number)

                    # 3. Catch up
                    if finalized_number >= next_block:
                        logger.info(
                            "Catching up",
                            next_block=next_block,
                            target=finalized_number,
                            last_processed=last_processed,
                        )
                        
                        # Fetch next block hash
                        next_hash = await self.get_block_hash(http_session, next_block)
                        if next_hash:
                            block_data = await self.get_block(http_session, next_hash)
                            if block_data:
                                await self.process_block(block_data, next_block, next_hash)
                        
                        # Small delay to prevent hammering if catching up fast or allow config
                        await asyncio.sleep(0.1) 
                    else:
                        # Up to date
                        await asyncio.sleep(settings.RETRY_DELAY_SECONDS)

                except asyncio.CancelledError:
                    logger.info("Scanner task cancelled")
                    break
                except Exception as e:
                    logger.error("Error in scanner loop", error=str(e))
                    await asyncio.sleep(settings.RETRY_DELAY_SECONDS)

