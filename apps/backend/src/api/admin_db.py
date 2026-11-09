"""Admin-only read-oriented DB explorer (Neon-style lite)."""

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.dependencies import RoleChecker

router = APIRouter()
allow_admin = RoleChecker(["admin"])

_IDENT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute)\b",
    re.I,
)


class QueryRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=8000)
    limit: int = Field(100, ge=1, le=500)


def _ensure_readonly(sql: str) -> str:
    cleaned = sql.strip().rstrip(";")
    if ";" in cleaned:
        raise HTTPException(status_code=400, detail="Multiple statements are not allowed")
    if _FORBIDDEN.search(cleaned):
        raise HTTPException(status_code=400, detail="Only read-only SELECT/EXPLAIN queries allowed")
    upper = cleaned.lstrip().upper()
    if not (upper.startswith("SELECT") or upper.startswith("EXPLAIN") or upper.startswith("WITH")):
        raise HTTPException(status_code=400, detail="Query must start with SELECT, WITH, or EXPLAIN")
    return cleaned


@router.get("/tables", dependencies=[Depends(allow_admin)])
async def list_tables(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        )
    )
    names = [r[0] for r in result.all()]
    out = []
    for name in names:
        if not _IDENT.match(name):
            continue
        count_res = await db.execute(text(f'SELECT COUNT(*) FROM "{name}"'))
        out.append({"name": name, "approx_rows": int(count_res.scalar() or 0)})
    return out


@router.get("/tables/{table_name}", dependencies=[Depends(allow_admin)])
async def browse_table(
    table_name: str,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    if not _IDENT.match(table_name):
        raise HTTPException(status_code=400, detail="Invalid table name")
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    # Verify table exists
    exists = await db.execute(
        text(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :t
            """
        ),
        {"t": table_name},
    )
    if not exists.first():
        raise HTTPException(status_code=404, detail="Table not found")
    result = await db.execute(
        text(f'SELECT * FROM "{table_name}" LIMIT :lim OFFSET :off'),
        {"lim": limit, "off": offset},
    )
    cols = list(result.keys())
    rows = []
    for row in result.all():
        item = {}
        for c, v in zip(cols, row):
            item[c] = v if isinstance(v, (str, int, float, bool, type(None))) else str(v)
        rows.append(item)
    return {"table": table_name, "columns": cols, "rows": rows, "limit": limit, "offset": offset}


@router.post("/query", dependencies=[Depends(allow_admin)])
async def run_query(body: QueryRequest, db: AsyncSession = Depends(get_db)):
    sql = _ensure_readonly(body.sql)
    # wrap with limit if plain select without limit
    wrapped = sql
    if sql.lstrip().upper().startswith("SELECT") and " limit " not in sql.lower():
        wrapped = f"SELECT * FROM ({sql}) AS q LIMIT {int(body.limit)}"
    try:
        result = await db.execute(text(wrapped))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {e}") from e
    if result.returns_rows:
        cols = list(result.keys())
        rows = []
        for row in result.all():
            item = {}
            for c, v in zip(cols, row):
                item[c] = v if isinstance(v, (str, int, float, bool, type(None))) else str(v)
            rows.append(item)
        return {"columns": cols, "rows": rows, "row_count": len(rows)}
    return {"columns": [], "rows": [], "row_count": 0}
