# PolkAudit Documentation

Central index for developers, treasury voters, and ecosystem partners.

---

## Start here

| Audience | Document |
|----------|----------|
| **Treasury voters** | [TREASURY_SUMMARY.md](TREASURY_SUMMARY.md) → [TREASURY_PROPOSAL.md](TREASURY_PROPOSAL.md) |
| **New developers** | [SETUP.md](SETUP.md) + root [README.md](../README.md) |
| **Non-technical** | [PolkAudit_NON_TECHNICAL_OVERVIEW.md](PolkAudit_NON_TECHNICAL_OVERVIEW.md) |
| **Demo / video** | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) |
| **Public demo launch** | [DEMO_HOSTING_GUIDE.md](DEMO_HOSTING_GUIDE.md) |
| **Repo hygiene** | [PUBLIC_PRIVATE_REPO_GUIDE.md](PUBLIC_PRIVATE_REPO_GUIDE.md) |

---

## Treasury & funding

| Document | Description |
|----------|-------------|
| [TREASURY_PROPOSAL.md](TREASURY_PROPOSAL.md) | **Polkadot Treasury Phase 1** (~$10k DOT, 8 weeks, milestones) |
| [TREASURY_SUMMARY.md](TREASURY_SUMMARY.md) | One-page treasury overview for voters |
| [TREASURY_SUBMISSION_CHECKLIST.md](TREASURY_SUBMISSION_CHECKLIST.md) | Pre-submit checklist (demo → discussion → referendum) |
| [TREASURY_REVIEWER_FAQ.md](TREASURY_REVIEWER_FAQ.md) | Voter and commenter Q&A |
| [POLKASSEMBLY_DISCUSSION_POST.md](POLKASSEMBLY_DISCUSSION_POST.md) | Legacy Polkassembly discussion draft (archived) |
| [POLKADOT_FORUM_POST.md](POLKADOT_FORUM_POST.md) | Polkadot Forum governance topic draft |
| [DEMO_HOSTING_GUIDE.md](DEMO_HOSTING_GUIDE.md) | Public demo launch before posting discussion |
| [PUBLIC_PRIVATE_REPO_GUIDE.md](PUBLIC_PRIVATE_REPO_GUIDE.md) | What to publish vs keep private |
| [WEEKLY_REPORT.md](WEEKLY_REPORT.md) | Progress report with evidence links |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | 3–5 minute walkthrough script |
| [assets/README.md](assets/README.md) | Screenshot and export capture guide |

---

## Technical documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and data flow |
| [SETUP.md](SETUP.md) | Environment setup |
| [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md) | Product summary |
| [ROADMAP.md](ROADMAP.md) | Product roadmap |
| [apps/indexer/README.md](../apps/indexer/README.md) | Indexer env, parser, demo backfill |
| [apps/backend/README.md](../apps/backend/README.md) | API, migrations, auth |
| [apps/frontend/README.md](../apps/frontend/README.md) | Dashboard UI _(if present)_ |

---

## Deployment & operations

| Document | Description |
|----------|-------------|
| [HYBRID_DEPLOYMENT.md](HYBRID_DEPLOYMENT.md) | Oracle VM + GCP Cloud Run + Neon |
| [GCP_CLOUD_BUILD.md](GCP_CLOUD_BUILD.md) | Cloud Build triggers and Cloud Run |
| [ALIBABA_SAS_DEPLOY.md](ALIBABA_SAS_DEPLOY.md) | Alibaba SAS + local Postgres + GitHub Actions CD |
| [INDEXER_FREE_HOSTING.md](INDEXER_FREE_HOSTING.md) | Free VM options for indexer |
| [DEMO_HOSTING_GUIDE.md](DEMO_HOSTING_GUIDE.md) | Public demo launch checklist |
| [PUBLIC_PRIVATE_REPO_GUIDE.md](PUBLIC_PRIVATE_REPO_GUIDE.md) | What can be public vs private |
| [deploy/oracle/README.md](../deploy/oracle/README.md) | Oracle bootstrap scripts |

---

## Governance & planning

| Document | Description |
|----------|-------------|
| [12_MONTH_EXECUTION_PLAN.md](12_MONTH_EXECUTION_PLAN.md) | Annual funding and phases |
| [GOVERNANCE_POLICY.md](GOVERNANCE_POLICY.md) | Project governance principles |
| [SUSTAINABILITY.md](SUSTAINABILITY.md) | Long-term sustainability |
| [SAAS_READINESS_GAP.md](SAAS_READINESS_GAP.md) | Multi-tenant / billing / Razorpay gap analysis |

---

## Verification scripts

```bash
make verify-e2e          # API health, stats, CSV export
make check-governance    # DB + API governance counts
make demo-backfill       # Reset indexer tables for demo scan
```

---

## License

Apache 2.0 — see [LICENSE](../LICENSE)
