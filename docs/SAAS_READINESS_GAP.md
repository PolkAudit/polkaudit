# PolkAudit — SaaS readiness (current state)

**Last updated:** 2026-11-09  
**Supersedes** the July 2026 draft assumptions (JWT/billing/console were not built then).

---

## Executive summary

| Area | Status |
|------|--------|
| Live indexing + governance dashboard | ✅ `app.polkaudit.xyz` |
| Console (invite-only account/admin) | ✅ `console.polkaudit.xyz` |
| JWT auth, verify/reset, change password | ✅ |
| Admin tenant onboard + memberships | ✅ |
| Per-project API keys (`pk_…`) | ✅ |
| USD plan midpoints + Razorpay payment links | ✅ code; needs live keys |
| SMTP via Console admin | ✅ code; needs provider creds |
| Export daily caps + plan API RPM | ✅ |
| Shared Polkadot index (not per-tenant chain data) | ✅ by design for relay MVP |
| Public self-serve signup → pay → provision | ❌ invite-only |
| Razorpay recurring subscriptions | ❌ payment links only |
| True parachain / dedicated isolation | ❌ later / enterprise |

**Honest launch posture:** Charge invite-only pilots with admin-set plans or Razorpay USD links. Do not market full self-serve multi-tenant chain isolation yet.

---

## Product split

```text
polkaudit.xyz          → landing
app.polkaudit.xyz      → governance dashboard (X-API-KEY)
console.polkaudit.xyz  → SaaS account + platform admin (JWT)
api.polkaudit.xyz      → FastAPI
```

Console modules: Home, API keys, Billing (+ payment history), Alerts, Settings,  
Admin: Onboard tenant, Memberships, Users, Projects, Platform billing, Payments, SMTP.

---

## Still open

### Ops (SAS — not code)

1. `RAZORPAY_KEY_ID` / `SECRET` / `WEBHOOK_SECRET` (USD enabled)
2. Webhook → `https://api.polkaudit.xyz/api/v1/billing/webhook/razorpay`
3. `APP_PUBLIC_URL=https://console.polkaudit.xyz`
4. `SECRET_KEY` for JWT (optional; falls back to `API_KEY`)
5. Console → SMTP (or env) + test send
6. Confirm alembic head includes USD plans + `platform_settings`

### Deferred product

- DB Query Editor (admin-only) — planned later
- Self-serve register → checkout → provision
- Razorpay Subscriptions / dunning / `past_due` grace
- Per-tenant indexer isolation or dedicated deployments
- Integrations / compliance / scoring / audit Console UIs
- SSO

---

## Design notes

- **Tenant** = workspace (keys, alerts, billing, membership), not a private chain copy.
- Checkout requires **email verified**.
- Plan RPM (approx): free 30, starter 60, pilot 120, pro 300, enterprise/demo 600 per minute (process-local).
- See also: [PRODUCTION_OPS_CHECKLIST.md](./PRODUCTION_OPS_CHECKLIST.md).
