# P0–5 — Security Preflight (Neon credential exposure)

**Date:** 2026-11-10  
**Authorization:** Repository-local assessment + safe placeholder edit only  
**Not performed:** DB connect / auth validation, credential rotation, history rewrite, stage/commit/push/deploy  

Credential **values are intentionally omitted** from this report.

---

## 1. Exposure assessment

| Question | Finding |
|----------|---------|
| Is a Neon-style `DATABASE_URL` (user + password + `*.neon.tech`) tracked at **HEAD**? | **Yes** — in `apps/indexer/.env.example` |
| Is the same class of secret present in the **current worktree** after this preflight? | **No** — file sanitized to localhost placeholders |
| Was the secret introduced by P0–2/P0–3 edits? | **No** — present since initial MVP commit; P0 only appended non-secret indexer knobs |
| Did backend `.env.example` ever contain the same pattern? | **Yes historically**; sanitized on `main` in a later commit (see §3) |
| Any authentication attempted against Neon? | **No** |
| Is the credential proven “currently valid”? | **Unknown / not tested** — treat as **potentially live** until rotated |

**Severity:** High for repository exposure (tracked example file + git history). Impact depends on whether the Neon role still has access to shared/production data (ops confirmation required).

---

## 2. Affected tracked files (current HEAD)

### Confirmed likely-live secret pattern at HEAD

| Path | Pattern class | Notes |
|------|---------------|-------|
| `apps/indexer/.env.example` | Neon user + `npg_`-style password + `*.neon.tech` host in `DATABASE_URL` | **Only current tracked file** matching `npg_` / `neondb_owner` via `git grep` |

### Related historical (no longer at HEAD tip content)

| Path | Status at HEAD tip | Historical |
|------|--------------------|------------|
| `apps/backend/.env.example` | Localhost placeholder (`127.0.0.1`) — **clean** | Contained same Neon user/password pattern from intro until sanitized |

### Other tracked config reviewed — not classified as live Neon credentials

| Path | Classification |
|------|----------------|
| `apps/backend/.env.example` | Local demo URL (`polkaudit:polkaudit@127.0.0.1`) |
| `deploy/alibaba/indexer.env.example` | Localhost-style URL |
| `deploy/alibaba/backend.env.example` | Localhost-style URL |
| `deploy/oracle/indexer.env.example` | Template with `USERNAME`/`PASSWORD`/`HOST…neon.tech` placeholders (no `npg_` / `neondb_owner`) |
| `env.hybrid.example` | Template placeholders for Neon host form |
| `docker-compose.yml` | Compose service credentials (`postgres` host) — local stack, not Neon |
| `apps/*/README.md`, root `README.md`, deploy docs | Documentary `USER:PASSWORD@HOST` examples |
| `deploy/alibaba/setup-sas.sh` | Generates/substitutes `API_KEY` at setup time — not a stored Neon DB password |

No AWS `AKIA…`, Stripe `sk_live_…`, or PEM private keys found in the scanned env/example/compose set for this preflight.

---

## 3. Historical commits (identifiers only; no secret contents)

| Commit | Date | Subject | Relevance |
|--------|------|---------|-----------|
| `e28737fd00c617a1131bd88ae569f9f914872295` | 2026-07-06 | Add PolkAudit MVP stack and Treasury launch package. | **Introduces** Neon-style `DATABASE_URL` into `apps/indexer/.env.example` and `apps/backend/.env.example` (`git log -S npg_` / `-S neondb_owner`) |
| `f9ec337a71152b3f5fe0209a699c4fca01929161` | 2026-11-09 | Add SaaS console on SAS with auth, billing, and Payment Links. | **Removes** Neon user/password pattern from `apps/backend/.env.example` (replaced with localhost) |
| `31837ee577b39a07d26b73e8b11ff7ff914dc1d6` (HEAD) | — | Ship Pro-ready schedules, invoices, scopes, and billing lifecycle. | **Still contains** the Neon-style URL in `apps/indexer/.env.example` blob |

`apps/indexer/.env.example` was **not modified** between intro and HEAD (single `git log --follow` entry). Therefore every revision that retains that blob still exposes the secret via `git show <rev>:apps/indexer/.env.example` until a new commit replaces the file.

`git log -S neon.tech` also touches documentation/templates (`README.md`, `deploy/oracle/indexer.env.example`, `env.hybrid.example`, assorted docs) that use **placeholder** Neon host forms — distinct from the live userinfo pattern.

**Remote:** `origin` → `https://github.com/ViSa-Innovations/polkaudit.git` (public/private status not asserted here; assume **exposed if the remote is reachable**).

---

## 4. Sanitization result (worktree only)

| Item | Result |
|------|--------|
| File updated | `apps/indexer/.env.example` |
| `DATABASE_URL` | Replaced with localhost placeholder aligned to backend example style: `postgresql+asyncpg://polkaudit:polkaudit@127.0.0.1:5432/polkaudit` |
| Preserved vars | `SUBSTRATE_RPC_URL`, `LOG_LEVEL`, `METRICS_PORT`, `RETRY_DELAY_SECONDS`, `INDEXER_START_BLOCK`, `INDEXER_CATCHUP_WINDOW` |
| P0 keys retained | `INDEXER_END_BLOCK=0`, `INDEXER_REQUIRE_EVENTS=true` |
| Application code behavior | **Unchanged** — examples only; runtime still reads env/settings |
| Post-check | No `npg_`, `neondb_owner`, or `neon.tech` in worktree file; `git grep` for those patterns across worktree → none |
| HEAD blob | **Still contains** prior secret until an authorized commit lands |

---

## 5. `p02c_artifacts` review

| File | Size | Credentials? | Contents |
|------|------|--------------|----------|
| `api_verify.json` | ~6 KB | **No** | `database_url_host=localhost`, DB name `polkaudit_p02c_e2e`, stats/proposal/vote/treasury samples, CSV headers |
| `interrupt_resume.json` | ~0.6 KB | **No** | Idempotency / interrupt counters + event_key / value |
| `snapshot_first.json` | ~4 KB | **No** | Pass snapshot counts |
| `snapshot_second.json` | ~4 KB | **No** | Replay snapshot counts |

**Assessment:** Safe to keep as P0 evidence. Data is derived from public chain fixtures + local disposable DB metadata. Not unnecessary build artifacts. No secret-pattern hits.

---

## 6. Credential-rotation requirements (manual ops — not executed)

| Action | Required? | Notes |
|--------|-----------|-------|
| Rotate Neon role password / reset connection string for the exposed endpoint | **Yes — recommended immediately** | Treat as compromised-in-repo; validity unknown |
| Update all runtime envs (local, SAS, Alibaba, GitHub secrets, developer laptops) that used the old URL | **Yes** after rotation | Do not paste new secrets into git |
| Rewrite git history to purge old blobs | **Not authorized** in this gate; optional later with explicit approval | History rewrite does not revoke a still-valid password |
| Revoke/rotate any other keys that may have lived beside this DB URL in private env files | Ops judgment | Out of repository scan scope |
| Notify collaborators if repo was cloned/forked | Recommended | Especially if remote is public |

This preflight **does not** rotate credentials and **does not** connect to Neon.

---

## 7. Remaining risks

1. **Git history + HEAD blob** still hold the prior Neon URL until a sanitizing commit is created (and forever in history unless rewritten).  
2. **Clones/forks/CI caches** may retain the old file.  
3. **Shared Neon** previously used by local indexer/backend (P0–1) may still be reachable with the old password.  
4. **Push before rotation** would re-publish the old tip blob to remotes that have not yet fetched a sanitizing commit — prefer rotate first or accept residual risk explicitly.  
5. Localhost placeholder passwords (`polkaudit:polkaudit`) are intentional for examples only — fine for `.env.example`, never for production.

---

## 8. Commit inventory update

`docs/analysis/P0-5-COMMIT-READINESS.md` updated:

- `apps/indexer/.env.example` moved into **Commit 1** exact file list (sanitized).  
- Removed from excluded / deferred list.  
- Commit 3 docs list includes this security preflight.  
- Residual risk reframed to **historical exposure + rotation**, not worktree content.

---

## 9. Commit readiness recommendation

| Gate | Verdict |
|------|---------|
| Worktree secret hygiene for `.env.example` | **GO** (sanitized) |
| Commit authorization | Still **CONDITIONAL GO** — awaits explicit stage/commit auth; include sanitized `.env.example` in Commit 1 |
| Push | **CONDITIONAL GO** only after ops **rotates** (or formally accepts residual history risk) |
| Deploy / migrate / backfill | **NO-GO** (unchanged) |

---

## 10. Stop

Security preflight complete.  
No staging, commits, pushes, rotations, or history rewrites performed.  
**Await explicit authorization** for next steps.
