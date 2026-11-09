# PolkAudit Console

SaaS account UI for PolkAudit platform admins: login, email verification, password reset, API keys, and Pilot/Pro checkout.

Public sign-up is **disabled**. Create users with `POST /api/admin/users` (admin JWT).

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
