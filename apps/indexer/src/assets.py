"""Asset metadata for treasury amounts — never assume DOT decimals for all spends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AssetResolution:
    source_chain: str
    asset_id: str
    asset_symbol: str | None
    decimals: int | None
    display_status: str  # resolved | unresolved


# Verified registry entries only (do not invent symbols)
NATIVE_DOT = AssetResolution(
    source_chain="polkadot",
    asset_id="native",
    asset_symbol="DOT",
    decimals=10,
    display_status="resolved",
)

# Polkadot Asset Hub USDC (AssetId 1337) — independently verified common mapping
ASSET_HUB_USDC = AssetResolution(
    source_chain="polkadot-asset-hub",
    asset_id="1337",
    asset_symbol="USDC",
    decimals=6,
    display_status="resolved",
)


def format_display_amount(amount_raw: str, decimals: int | None) -> str | None:
    """Exact integer→decimal string without float."""
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


def _walk_general_index(obj: Any) -> int | None:
    if isinstance(obj, dict):
        if "GeneralIndex" in obj:
            try:
                return int(obj["GeneralIndex"])
            except (TypeError, ValueError):
                return None
        for v in obj.values():
            found = _walk_general_index(v)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _walk_general_index(item)
            if found is not None:
                return found
    return None


def resolve_from_asset_kind(asset_kind: Any) -> AssetResolution:
    """Map Treasury.AssetSpendApproved asset_kind to a registry entry when known."""
    idx = _walk_general_index(asset_kind)
    if idx == 1337:
        return ASSET_HUB_USDC
    if idx is not None:
        return AssetResolution(
            source_chain="polkadot-asset-hub",
            asset_id=str(idx),
            asset_symbol=None,
            decimals=None,
            display_status="unresolved",
        )
    return AssetResolution(
        source_chain="polkadot",
        asset_id="unknown",
        asset_symbol=None,
        decimals=None,
        display_status="unresolved",
    )


def resolve_native_dot() -> AssetResolution:
    return NATIVE_DOT
