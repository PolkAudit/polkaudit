# P0–4 — Release Decision

**Date:** 2026-11-10  
**Authorization used:** Read-only assessment + disposable local tests only  
**No commit, push, deploy, migrate, or backfill was performed**

---

## Summary

P0–2B / P0–2C / P0–3 engineering is **locally evidenced** (migrations on disposable DB, indexer 54 pass, backend 6 pass). Production rollout remains **gated** by prod DB↔dashboard consistency verification, exclusive-writer confirmation, and separate execution authorizations.

---

## Independent verdicts

| Gate | Verdict | Why |
|------|---------|-----|
| **Commit** | **CONDITIONAL GO** | P0 code/migrations/tests/docs are coherent and locally verified. Condition: exclude unrelated artifacts (`ANALYSIS.md`, `GCP_Guide.md`, `MODULES_FEATURES.md`, `*.tsbuildinfo`); optionally split `README.md` to a docs commit. Awaits explicit commit authorization. |
| **Push** | **CONDITIONAL GO** | Same tree as commit, after CI-friendly split and review. Condition: remote branch strategy agreed; no force-push; secrets absent. Awaits explicit push authorization. |
| **Deploy** (apps) | **CONDITIONAL GO** | Code ready for controlled rollout **after** migrate sequencing and single-writer confirmation. Condition: prod consistency checks (§ blocker) complete or accepted; deploy images tagged; frontend can trail. **Not authorized in this gate.** |
| **Migrate production** (`g7`→`h8`) | **NO-GO** (under current auth) / **CONDITIONAL GO** when ops criteria met | Disposable upgrade with legacy rows **passed**. Production still requires backup, duplicate preflight, maintenance window, indexer deploy in same window (old writers unsafe post-g7). **Do not migrate until separately authorized.** |
| **Historical backfill** | **NO-GO** (under current auth) / **CONDITIONAL GO** after migrate + E1–E7 | Plan exists (ranges **26863900–26924000**, **28040602**, archive RPC, exclusive writer, reconcile X1–X15). Prod binding and archive smoke on indexer host still open. **Do not execute.** |

---

## Commit readiness detail

**Include:** indexer modules, backend money/services/schemas/models, migrations `g7`/`h8`, frontend export labels, `reindex-range.sh`, tests, `docs/analysis/P0-*`.

**Exclude / defer:** build `tsbuildinfo`; standalone marketing docs listed in inventory; review `README.md` intent.

---

## Deploy / migrate sequencing (when authorized)

1. Backup → migrate head → deploy indexer → deploy backend → frontend → exclusive writer health.  
2. Old apps may **read** new schema; old **indexer writers** must not run against post-g7 DB.  
3. DB rollback after new writes is **not** assumed safe — restore from backup.

---

## Production consistency blocker

Unresolved from P0–1: dashboard vs inspected DB block/extrinsic counts. Repo evidence suggests shared-DB / stale-cursor / dual-writer explanations but **does not replace** authorized read-only prod verification. Until that check (or formal acceptance of residual risk), treat **deploy** as CONDITIONAL and **migrate/backfill** as blocked pending ops GO.

Safe checks listed in `P0-4-REGRESSION-EVIDENCE.md` §5.

---

## Backfill readiness (plan only)

| Item | Status |
|------|--------|
| Exact block ranges | Defined (Tier A / A′ above) |
| Archive RPC | Required; not re-proven this gate |
| Expected historical events | Golden refs (1674, vote 1666, treasury 28040602) |
| Exclusive writer procedures | WriterLock + `reindex-range.sh` |
| Backup / abort / recovery | Documented in runbook |
| Reconciliation criteria | P0–2 X1–X15 + second-pass Δ=0 |

---

## Stop condition

**P0–4 assessment complete.**  
Await **explicit authorization** for each subsequent action: commit → push → migrate → deploy → backfill. No further release actions under this request.
