# Production ops checklist (SAS)

Use before charging tenants via Console / Razorpay.

## Code (CI deploys this)

- [x] Console account/admin IA + USD billing midpoints
- [x] `POST /api/admin/tenants` one-shot onboard
- [x] Memberships API + Console UI
- [x] Project switcher + payment callback UX on `/billing`
- [x] Export entitlements (subscription + daily caps)

## SAS env (manual)

In `/etc/polkaudit/backend.env`:

```bash
APP_PUBLIC_URL=https://console.polkaudit.xyz
# RAZORPAY_KEY_ID=rzp_live_...
# RAZORPAY_KEY_SECRET=...
# RAZORPAY_WEBHOOK_SECRET=...
# SMTP_* for verify / reset emails
```

Then:

```bash
sudo systemctl restart polkaudit-backend
```

Razorpay dashboard: webhook → `https://api.polkaudit.xyz/api/v1/billing/webhook/razorpay`  
Events: `payment_link.paid`, `payment.captured`. Account must allow **USD**.

Confirm alembic head includes `c3d4e5f6a7b8` (USD plans) after deploy.

## Operator path for a new tenant

1. Console → **Onboard tenant** (project + user + plan + key)
2. Or: Projects + Users + **Memberships** + **Platform billing**
3. Hand off API key for `app.polkaudit.xyz`
4. Tenant upgrades via Console → **Billing** (USD)

## Honest product boundary

Governance Overview/Proposals/Treasury stay on the shared Polkadot index (`apps/frontend`).  
Console workspaces isolate keys, alerts, membership, and billing — not separate chain indexes.
