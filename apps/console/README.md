# PolkAudit Console

SaaS **account & platform admin** UI for PolkAudit — not a duplicate of the
governance dashboard.

| Module | Route | Purpose |
|--------|-------|---------|
| Home | `/` | Account summary, projects, open dashboard |
| API keys | `/keys` | Create / revoke project API keys |
| Billing | `/billing` | USD plans + Razorpay checkout |
| Alerts | `/alerts` | Channels, rules, history |
| Settings | `/settings` | Password, email verify, connection |
| Onboard tenant | `/admin/tenants` | Project + user + plan + API key (admin) |
| Memberships | `/admin/memberships` | Assign users to projects (admin) |
| Users | `/admin/users` | Invite users (admin) |
| Projects | `/admin/projects` | Create/list tenants (admin) |
| Platform billing | `/admin/billing` | Manually set tenant plan (admin) |

**USD list prices (landing midpoints):** Pilot $1,000 / 3 months · Starter $149 / month · Pro $599 / month · Enterprise quote-only.

Governance (Overview, Proposals, Treasury, Exports) stays on
`https://app.polkaudit.xyz` (`apps/frontend`).

Public sign-up is **disabled**. Create users with `POST /api/admin/users`
(admin JWT) or the Users screen.

Bootstrap admin is seeded by migration (`admin@polkaudit.xyz`). Forgot / reset /
change password are available in Settings and auth pages.

- **Prod:** `https://console.polkaudit.xyz` on **Alibaba SAS** (`polkaudit-console`, port `3001`)
- **API:** same backend as the dashboard (`NEXT_PUBLIC_API_URL`)
- **Dashboard link:** `NEXT_PUBLIC_APP_URL` (default `https://app.polkaudit.xyz`)
- **Landing** stays on Vercel; console ships with the SAS GitHub Actions workflow

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3001
```

Magic links and Razorpay callbacks use backend `APP_PUBLIC_URL=https://console.polkaudit.xyz`.

### SAS ops

```bash
# one-time env (if setup-sas already ran before console existed)
sudo cp /opt/polkaudit/deploy/alibaba/console.env.example /etc/polkaudit/console.env
sudo chown polkaudit:polkaudit /etc/polkaudit/console.env
sudo chmod 640 /etc/polkaudit/console.env

# after DNS for console.polkaudit.xyz → SAS IP
sudo certbot --nginx -d app.polkaudit.xyz -d api.polkaudit.xyz -d console.polkaudit.xyz

# ensure magic links point at console
sudo sed -i 's|^APP_PUBLIC_URL=.*|APP_PUBLIC_URL=https://console.polkaudit.xyz|' /etc/polkaudit/backend.env
sudo systemctl restart polkaudit-backend
```
