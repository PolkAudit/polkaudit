# P1 — Audit Evidence & Assurance + Grants & Milestone Assessment

**Status classifications:** `IMPLEMENTED | PARTIAL | OPS_BLOCKED | PROPOSED | NEEDS_VERIFICATION`  
**Scope:** Repository verification only (2026-11-10).

---

## 1. Executive finding

**Audit / compliance / reports are partial scaffolds with working Console/API entry points** — not empty stubs. They are **not** yet an assurance engine (no content-addressed evidence storage, weak provenance, limited reviewer workflow).

**Grants & milestones are proposed:** no domain models/APIs in `apps/backend`. Marketing use-cases mention grantee accountability; code does not.

**Reuse first:** extend `audit_*`, `compliance_*`, `reports`, `projects`, `treasury_spends`, and alerts — do **not** rebuild Console SaaS or invent a parallel case system.

---

## Part A — Audit Evidence & Assurance

### A1. What exists (IMPLEMENTED / PARTIAL)

| Capability | Status | Files | Evidence |
|------------|--------|-------|----------|
| Case create/list/detail | IMPLEMENTED | `models/audit.py`, `audit/service.py`, `api/v1/audit.py`, `console/app/audit/page.tsx` | Project-scoped; admin/auditor role |
| Comments | IMPLEMENTED | same | `add_comment`, Console UI |
| Close / reopen | IMPLEMENTED | `close_case`, `reopen_case` → `IN_REVIEW` | API + UI |
| Evidence URL attach | PARTIAL | `add_evidence` | Stores `file_url` + description |
| Evidence integrity | PARTIAL | hash = SHA256(`file_url-description`) | **Confirmed:** not file-content hash |
| Object storage upload | PROPOSED | — | No S3/GCS integration |
| Chain provenance fields | PROPOSED | — | No block/extrinsic refs on evidence |
| Findings / remediation / signed manifests | PROPOSED | — | Not modeled |
| Assignment | PARTIAL | `assigned_auditor_id` on create | No full review workflow UI |

Migration: `674ce6f89558_add_audit_models.py`.

### A2. Gap rows

#### A-02 — Evidence storage & integrity

| Field | Content |
|-------|---------|
| **Capability** | Defensible evidence packages |
| **Status** | `PARTIAL` |
| **Missing** | Upload, content hash, retention, tamper check |
| **Approach** | Add upload endpoint → object storage; hash file bytes; store `content_sha256`, `byte_size`, optional `block_number`/`extrinsic_hash` metadata JSON |
| **Dependencies** | Bucket + IAM; auth |
| **Priority** | P1 |
| **Acceptance** | Downloaded blob matches stored hash; case export lists evidence digests |
| **Tests** | Service tests with temp file; no audit tests today |
| **Complexity** | L |
| **Type** | Confirmed incomplete |

#### A-03 — Compliance automation

| Field | Content |
|-------|---------|
| **Capability** | Policy violations from live treasury/governance |
| **Status** | `PARTIAL` |
| **Files** | `compliance/service.py`, console compliance page |
| **Evidence** | Rules `max_value`, `method_blacklist`; ingest via **manual** `POST /compliance/events`. Console default `treasury_cap` may not match engine types (**confirmed risk**). |
| **Missing** | Indexer→compliance bridge; alignment of UI rule types |
| **Approach** | Job on new spend: `ingest_event`; fix Console options to engine enums; optional “open audit case from violation” |
| **Priority** | P1 |
| **Acceptance** | Policy fires on fixture spend without manual ingest |
| **Tests** | Unit tests for `max_value` with planck |
| **Complexity** | M |
| **Type** | Confirmed partial |

#### A-04 — Reports as assurance artifacts

| Field | Content |
|-------|---------|
| **Capability** | Period-scoped, unit-correct, durable reports |
| **Status** | `PARTIAL` |
| **Files** | `report_service.py`, `api/v1/reports.py` |
| **Evidence** | PDF to `/tmp`; period fields ignored (`block_number >= 0`); treasury printed as DOT incorrectly; project_id weak |
| **Approach** | Fix units; apply period filters; durable storage; require JWT (confirm deploy auth layer) |
| **Priority** | P1 |
| **Acceptance** | Report for date/block range matches SQL aggregates; units correct |
| **Tests** | Report service unit test |
| **Complexity** | M |
| **Type** | Confirmed defects + gaps |

#### A-01 — Case workflow baseline

| Field | Content |
|-------|---------|
| **Status** | `IMPLEMENTED` for MVP case ops |
| **Approach** | Preserve; extend rather than replace |
| **Priority** | — |
| **Complexity** | — |

---

## Part B — Grants & Milestone Accountability

### B1. Search result (confirmed)

| Search | Result |
|--------|--------|
| Models `Grant` / `Milestone` | **Absent** |
| APIs under `/grants` | **Absent** |
| Console grants UI | **Absent** |
| Landing “grantee” language | Present (`apps/landing/components/use-cases.tsx`) — marketing only |

**Status for grants product module:** `PROPOSED`.

### B2. Reuse map (do not rebuild SaaS)

| Existing asset | How it supports grants MVP |
|----------------|----------------------------|
| `projects` + memberships | One project = grant program / portfolio |
| `audit_cases` + evidence + comments | Milestone review / acceptance case |
| `treasury_spends` (+ future referendum link) | Proof of disbursement |
| `compliance` policies | Budget / method constraints |
| `alerts` | Overdue / threshold notifications |
| `export_schedules` + reports | Scheduled evidence packs |
| Console auth/billing | Unchanged platform services |

### B3 — Smallest viable grants implementation

| Field | Content |
|-------|---------|
| **Capability** | Track funded work with milestones and evidence |
| **Status** | `PROPOSED` |
| **Entities (minimal)** | `grants` (project_id, title, beneficiary, budget_planck, status); `milestones` (grant_id, due_at, amount_planck, status, optional treasury_spend_id, optional audit_case_id) |
| **APIs** | CRUD grant/milestone; attach evidence via existing audit endpoints or `milestone_id` FK on evidence |
| **UI** | Console section under Assurance pillar (list + detail); no new deploy topology |
| **Out of MVP** | Public grantee portal, complex escrow, multi-chain |
| **Dependencies** | P0 treasury units + preferably spend linkage; audit evidence upload preferred |
| **Priority** | P1 (after P0 credibility) |
| **Acceptance** | Create grant → 2 milestones → attach evidence → mark milestone complete → optional link to spend id → alert if overdue |
| **Tests** | API lifecycle integration test |
| **Complexity** | L |
| **Type** | New development (justified; nothing to reuse as domain model) |

---

## 3. Relationship to ANALYSIS pillars

| Pillar | Repo reality |
|--------|--------------|
| PolkAudit Assurance | Case UI/API **PARTIAL**; evidence engine **PARTIAL→PROPOSED** |
| Grants accountability | **PROPOSED** |
| AI Audit Copilot | `MockLLMProvider` only — keep P2; require citations later |

---

## 4. Recommended order (P1 only)

1. Harden **audit evidence** (storage + content hash + provenance fields).  
2. Wire **compliance** to treasury spends + fix rule-type UI.  
3. Fix **report** units/period/auth/storage.  
4. Introduce **grants/milestones** MVP atop projects + audit + treasury FKs.

**Stop:** No feature development until authorized.
