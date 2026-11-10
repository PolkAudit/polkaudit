"""Asset-aware monetary helpers for treasury APIs, exports, alerts, and reports."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Any


@dataclass(frozen=True)
class AssetAmount:
    amount_raw: str
    source_chain: str | None
    asset_id: str | None
    asset_symbol: str | None
    decimals: int | None
    amount_display: str | None
    display_status: str


def format_display_amount(amount_raw: str, decimals: int | None) -> str | None:
    if decimals is None:
        return None
    try:
        n = int(str(amount_raw))
    except (TypeError, ValueError):
        return None
    if decimals < 0:
        return None
    if decimals == 0:
        return str(n)
    sign = "-" if n < 0 else ""
    n = abs(n)
    s = str(n).zfill(decimals + 1)
    whole, frac = s[:-decimals], s[-decimals:]
    frac = frac.rstrip("0")
    if frac:
        return f"{sign}{int(whole)}.{frac}"
    return f"{sign}{int(whole)}"


def from_spend_row(spend: Any) -> AssetAmount:
    raw = str(getattr(spend, "value", "0"))
    decimals = getattr(spend, "decimals", None)
    display = getattr(spend, "amount_display", None)
    status = getattr(spend, "display_status", None) or (
        "resolved" if decimals is not None else "unresolved"
    )
    if display is None and decimals is not None:
        display = format_display_amount(raw, decimals)
    return AssetAmount(
        amount_raw=raw,
        source_chain=getattr(spend, "source_chain", None),
        asset_id=getattr(spend, "asset_id", None) or "unknown",
        asset_symbol=getattr(spend, "asset_symbol", None),
        decimals=decimals,
        amount_display=display,
        display_status=status,
    )


def unit_label(amount: AssetAmount) -> str:
    if amount.display_status != "resolved" or not amount.asset_symbol:
        return "raw_units"
    return amount.asset_symbol


def format_alert_amount(spend: Any) -> str:
    amt = from_spend_row(spend)
    if amt.display_status == "resolved" and amt.amount_display and amt.asset_symbol:
        return f"{amt.amount_display} {amt.asset_symbol} (raw {amt.amount_raw})"
    return f"{amt.amount_raw} raw_units (display unresolved; asset_id={amt.asset_id})"


def aggregate_by_asset(spends: Iterable[Any]) -> dict:
    """Sum raw amounts per asset key. Never merge distinct assets into one total."""
    buckets: dict[tuple, int] = defaultdict(int)
    meta: dict[tuple, AssetAmount] = {}
    for spend in spends:
        amt = from_spend_row(spend)
        key = (amt.source_chain or "unknown", amt.asset_id or "unknown")
        try:
            buckets[key] += int(amt.amount_raw)
        except ValueError:
            continue
        meta[key] = amt

    by_asset = []
    for key, total in sorted(buckets.items()):
        m = meta[key]
        by_asset.append(
            {
                "source_chain": key[0],
                "asset_id": key[1],
                "asset_symbol": m.asset_symbol,
                "decimals": m.decimals,
                "amount_raw_sum": str(total),
                "amount_display_sum": format_display_amount(str(total), m.decimals),
                "display_status": m.display_status if m.decimals is not None else "unresolved",
            }
        )

    if len(by_asset) == 0:
        mode = "empty"
        combined = "0"
    elif len(by_asset) == 1 and by_asset[0]["display_status"] == "resolved":
        mode = "single_asset"
        combined = by_asset[0]["amount_raw_sum"]
    elif len(by_asset) == 1:
        mode = "single_asset_unresolved"
        combined = by_asset[0]["amount_raw_sum"]
    else:
        mode = "mixed_refused"
        combined = "mixed_assets"

    return {
        "aggregation": mode,
        "total_treasury_spend": combined,
        "by_asset": by_asset,
    }
