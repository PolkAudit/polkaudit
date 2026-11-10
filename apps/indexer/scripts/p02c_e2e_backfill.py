#!/usr/bin/env python3
"""P0-2C isolated E2E historical backfill driver (disposable local DB only).

Does not touch shared/production databases. Processes bounded golden blocks
via FinalizedScanner.process_block with live Polkadot RPC.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import aiohttp

# Ensure apps/indexer is on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Bounded golden heights from P0-2B evidence (inclusive single-block islands +
# one contiguous +1 after the first island to prove cursor advancement).
GOLDEN_BLOCKS = [
    {
        "block_number": 26863938,
        "expected_hash": "0xea695b0bd31b6870c3be90771659b21cd5e4eb3ede83ddd30604fcf3d8bb74e3",
        "expect": {
            "proposal_indices": [1674],
            "vote_poll": 1666,
            "min_votes": 1,
        },
        "label": "ref1674_submit_and_vote",
    },
    {
        "block_number": 26863939,
        "expected_hash": None,  # resolved at runtime
        "expect": {"contiguous_after": 26863938},
        "label": "contiguous_plus_one",
    },
    {
        "block_number": 26875641,
        "expected_hash": "0xe8fc63304ceafc304d7d7dd856cf9336417b278a3490a911baeff817711cab98",
        "expect": {"proposal_indices": [1676]},
        "label": "ref1676_submitted",
        "new_segment": True,
    },
    {
        "block_number": 26923064,
        "expected_hash": "0xe70fffc3ed0839eacd222a840a34d7cdf0a016545174dc2856a83716460c0ee5",
        "expect": {"proposal_indices": [1674, 1673], "methods": ["Confirmed"]},
        "label": "ref1674_confirmed",
        "new_segment": True,
    },
    {
        "block_number": 28040602,
        "expected_hash": "0xfa153a7c465c12e241d804ffc52af1e82be6b83d177e4bbbf3d578ec05a03801",
        "expect": {
            "treasury_value": "795500000000",
            "treasury_beneficiary_substr": "0xa26556769ad6581b7beb103590a5c378955244aa349bbacc2f148c51205e055a",
        },
        "label": "treasury_spend201_asset_approved",
        "new_segment": True,
    },
]


async def rpc(session: aiohttp.ClientSession, url: str, method: str, params: list):
    async with session.post(
        url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ) as resp:
        body = await resp.json()
        if body.get("error"):
            raise RuntimeError(f"RPC {method} error: {body['error']}")
        return body.get("result")


async def process_one(scanner, http, http_url: str, block_number: int, expected_hash: str | None, new_segment: bool):
    h = await rpc(http, http_url, "chain_getBlockHash", [block_number])
    if not h:
        raise RuntimeError(f"Missing hash for {block_number}")
    if expected_hash and h.lower() != expected_hash.lower():
        raise RuntimeError(f"Hash mismatch for {block_number}: got {h} expected {expected_hash}")
    block = await rpc(http, http_url, "chain_getBlock", [h])
    if not block:
        raise RuntimeError(f"Missing block body for {block_number}")
    if new_segment:
        scanner._segment_start = block_number
    else:
        scanner._segment_start = None
    await scanner.process_block(block, block_number, h)
    return h


async def snapshot(session_maker) -> dict:
    from sqlalchemy import select, func
    from src.models import (
        Block,
        Extrinsic,
        Proposal,
        Vote,
        TreasurySpend,
        ProcessedBlock,
        IndexerCursor,
        DeadLetterQueue,
    )
    from src.persistence import coverage_status

    async with session_maker() as session:
        cursor = await session.get(IndexerCursor, 1)
        props = (await session.execute(select(Proposal).order_by(Proposal.id))).scalars().all()
        votes = (await session.execute(select(Vote).order_by(Vote.id))).scalars().all()
        spends = (await session.execute(select(TreasurySpend).order_by(TreasurySpend.id))).scalars().all()
        return {
            "blocks": await session.scalar(select(func.count(Block.id))) or 0,
            "extrinsics": await session.scalar(select(func.count(Extrinsic.id))) or 0,
            "proposals": await session.scalar(select(func.count(Proposal.id))) or 0,
            "votes": await session.scalar(select(func.count(Vote.id))) or 0,
            "treasury_spends": await session.scalar(select(func.count(TreasurySpend.id))) or 0,
            "processed": await session.scalar(select(func.count(ProcessedBlock.block_number))) or 0,
            "dlq": await session.scalar(select(func.count(DeadLetterQueue.id))) or 0,
            "coverage": coverage_status(cursor),
            "proposal_rows": [
                {
                    "id": p.id,
                    "proposal_index": p.proposal_index,
                    "block_number": p.block_number,
                    "method": p.method,
                    "status": p.status,
                    "event_key": p.event_key,
                }
                for p in props
            ],
            "vote_rows": [
                {
                    "id": v.id,
                    "proposal_index": v.proposal_index,
                    "block_number": v.block_number,
                    "voter": v.voter,
                    "vote": v.vote,
                    "balance": v.balance,
                    "event_key": v.event_key,
                }
                for v in votes
            ],
            "treasury_rows": [
                {
                    "id": t.id,
                    "block_number": t.block_number,
                    "beneficiary": t.beneficiary,
                    "value": t.value,
                    "event_key": t.event_key,
                }
                for t in spends
            ],
        }


async def main_async(args):
    os.environ["DATABASE_URL"] = args.database_url
    os.environ.setdefault("SUBSTRATE_RPC_URL", args.ws_rpc)
    os.environ.setdefault("INDEXER_REQUIRE_EVENTS", "true")
    os.environ.setdefault("INDEXER_START_BLOCK", "0")
    os.environ.setdefault("INDEXER_END_BLOCK", "0")
    os.environ.setdefault("LOG_LEVEL", "INFO")

    # Re-import settings after env
    from src.config import settings
    from src.database import async_session, engine
    from src.parser import ChainParser
    from src.scanner import FinalizedScanner
    from src.writer_lock import WriterLock
    from substrateinterface import SubstrateInterface

    http_url = args.http_rpc
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Exclusive lock check
    lock = WriterLock(engine)
    await lock.acquire()
    print("exclusive_lock=acquired")

    parser = ChainParser(substrate=SubstrateInterface(url=args.ws_rpc))
    scanner = FinalizedScanner(async_session, parser=parser, engine_=engine)

    timeout = aiohttp.ClientTimeout(total=120, connect=30)
    results = {"blocks_processed": [], "pass": args.pass_name}

    try:
        async with aiohttp.ClientSession(timeout=timeout) as http:
            for i, spec in enumerate(GOLDEN_BLOCKS):
                bn = spec["block_number"]
                new_seg = bool(spec.get("new_segment")) or i == 0
                # contiguous +1 is not a new segment
                if spec["label"] == "contiguous_plus_one":
                    new_seg = False
                print(f"processing {spec['label']} block={bn} new_segment={new_seg}")
                h = await process_one(
                    scanner, http, http_url, bn, spec.get("expected_hash"), new_seg
                )
                results["blocks_processed"].append({"label": spec["label"], "block": bn, "hash": h})
    finally:
        snap = await snapshot(async_session)
        results["snapshot"] = snap
        (out_dir / f"snapshot_{args.pass_name}.json").write_text(json.dumps(results, indent=2, default=str))
        await lock.release()
        await engine.dispose()
        print(json.dumps({"pass": args.pass_name, "counts": {k: snap[k] for k in ("blocks", "extrinsics", "proposals", "votes", "treasury_spends", "processed", "dlq")}}, indent=2))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--database-url", required=True)
    p.add_argument("--http-rpc", default="https://rpc.polkadot.io")
    p.add_argument("--ws-rpc", default="wss://rpc.polkadot.io")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--pass-name", default="first")
    args = p.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
