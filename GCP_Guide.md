# GCP New Project & Service Runbook

## 1. New project — one-time setup

Set variables first so commands are harder to run against the wrong project.

```bash
export PROJECT_ID="your-new-project"
export REGION="us-central1"

gcloud config set project "$PROJECT_ID"

gcloud config get-value project
```

For India you might instead use:

```bash
export REGION="asia-south1"
```

Always verify the project before making changes.

---

## 2. Confirm billing

```bash
gcloud billing projects describe "$PROJECT_ID"
```

Make sure you see:

```text
billingEnabled: true
```

Do this **before anything else**. We saw that APIs such as Secret Manager couldn't be enabled when billing wasn't attached.

---

## 3. Enable required APIs

For your typical Cloud Run setup:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project="$PROJECT_ID"
```

Verify:

```bash
gcloud services list \
  --enabled \
  --project="$PROJECT_ID"
```

---

# 4. Create Artifact Registry

I recommend one repository such as `apps` for your application's Docker images.

```bash
export REPOSITORY="apps"

gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID"
```

Your images will then look like:

```text
us-central1-docker.pkg.dev/PROJECT_ID/apps/service-name
```

For example:

```text
us-central1-docker.pkg.dev/my-project/apps/polkaudit-backend
```

Configure an **Artifact Registry cleanup policy** so old builds don't accumulate forever. Keep a few recent versions for rollback rather than deleting the immediately previous image.

---

# 5. Create a service account

For a new production service, prefer a dedicated runtime service account instead of the project's default Compute service account.

For example:

```bash
export SERVICE="polkaudit-backend"
export SERVICE_ACCOUNT="polkaudit-runtime"

gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
  --display-name="PolkAudit Cloud Run Runtime" \
  --project="$PROJECT_ID"
```

The resulting account is:

```text
polkaudit-runtime@PROJECT_ID.iam.gserviceaccount.com
```

Use a separate identity for another application:

```text
accsys-runtime@PROJECT_ID.iam.gserviceaccount.com
polkaudit-runtime@PROJECT_ID.iam.gserviceaccount.com
```

This prevents one application from automatically inheriting access to another application's resources.

---

# 6. Create or migrate secrets

Create secrets:

```bash
gcloud secrets create my-database-url \
  --replication-policy=automatic \
  --project="$PROJECT_ID"
```

Then add a value securely:

```bash
printf '%s' "$SECRET_VALUE" | \
gcloud secrets versions add my-database-url \
  --data-file=- \
  --project="$PROJECT_ID"
```

Don't put actual passwords/API keys directly in deployment scripts or Git.

For migration, use the prefix-based copy script we created to copy only the secrets belonging to the application.

For example:

```text
ACCSYS*
```

rather than copying every secret in the source project.

---

# 7. Grant the runtime account secret access

This was an important step in our migration.

If the application needs:

```text
polkaudit-database-url
polkaudit-api-key
```

grant access individually:

```bash
SA="polkaudit-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud secrets add-iam-policy-binding polkaudit-database-url \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID"

gcloud secrets add-iam-policy-binding polkaudit-api-key \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID"
```

This is preferable to giving the service account access to every secret in the project.

---

# 8. Database setup

Before deploying the application, make sure its database is available.

For an external PostgreSQL provider such as Neon:

```text
Cloud Run
us-central1 (Iowa)
       │
       ▼
Neon PostgreSQL
US region close to application
```

Keep the application and database geographically close whenever practical.

Then store the connection string in Secret Manager:

```text
DATABASE_URL
       ↓
Secret Manager
       ↓
Cloud Run
```

Never hard-code it into your Docker image.

---

# 9. Build Docker image

Your source repository should normally contain:

```text
application/
├── Dockerfile
├── source...
└── ...
```

Image path:

```bash
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/apps/${SERVICE}"
```

Build with Cloud Build:

```bash
gcloud builds submit \
  --tag="${IMAGE}:latest" \
  --project="$PROJECT_ID"
```

---

# 10. Deploy to Cloud Run

Example:

```bash
gcloud run deploy "$SERVICE" \
  --image="${IMAGE}:latest" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$SA" \
  --allow-unauthenticated
```

Add Secret Manager mappings as required:

```bash
gcloud run deploy "$SERVICE" \
  --image="${IMAGE}:latest" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --service-account="$SA" \
  --set-secrets="DATABASE_URL=polkaudit-database-url:latest,API_KEY=polkaudit-api-key:latest" \
  --allow-unauthenticated
```

If the service is private, **don't use `--allow-unauthenticated`**.

---

# 11. Verify Cloud Run

Immediately after deployment:

```bash
gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID"
```

Pay particular attention to:

```text
Revision
Ready
Traffic
Image
Service account
Secrets
```

You want the latest revision to be ready and receiving traffic.

---

# 12. Public access

For a public API/web application:

```bash
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --member="allUsers" \
  --role="roles/run.invoker"
```

You normally don't need this for private/internal services.

---

# 13. Configure Cloud Build trigger

Connect the GitHub repository and create a trigger:

```text
GitHub push
      ↓
Cloud Build
      ↓
Docker build
      ↓
Artifact Registry
      ↓
Cloud Run
```

Use the appropriate branch:

```text
main → Production
develop → Development
```

Prefer a checked-in `cloudbuild.yaml` when you need predictable build/deployment behavior.

---

# 14. Configure Artifact Registry cleanup

Don't let this happen indefinitely:

```text
Build 1
Build 2
Build 3
Build 4
...
Build 100
```

Configure cleanup policies.

A reasonable production policy is:

```text
Latest/current      KEEP
Recent rollback     KEEP
Recent rollback     KEEP
Older artifacts     DELETE
```

I would generally retain at least a few previous builds rather than deleting the previous image immediately.

Start cleanup policies in **Dry run**, verify what would be deleted, and then enable **Delete artifacts**.

---

# 15. Configure Cloud Run scaling

Don't accept scaling settings blindly.

For a normal low/moderate-traffic service, a starting point could be:

```text
Minimum instances: 0
Maximum instances: 10
CPU:               1
Memory:            512 MiB
Concurrency:       80
```

`min instances = 0` is particularly useful when optimizing cost because the service can scale to zero.

Tune these according to the workload.

---

# 16. Test before switching production

Test:

```text
✓ Application starts
✓ Health endpoint works
✓ Database connects
✓ Secrets load
✓ Authentication works
✓ External APIs work
✓ File/storage access works
✓ Webhooks work
✓ Cron/scheduled jobs work
✓ Email works
✓ Payment integrations work
✓ Logs contain no unexpected errors
```

For applications involving Stripe/Razorpay/etc., verify webhook URLs carefully when changing Cloud Run URLs or domains.

---

# 17. Configure domain/DNS

Only after the new service is healthy:

```text
Existing domain
      ↓
New Cloud Run service
```

Don't delete the old service immediately after changing DNS.

---

# 18. Production verification

Monitor:

```bash
gcloud run services logs read "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --limit=100
```

Check:

```text
HTTP 5xx errors
Database errors
Secret errors
Authentication failures
Timeouts
Memory issues
External API failures
```

---

# 19. Decommission old project resources

Only after the new environment is proven stable:

```text
New environment working
        ↓
Traffic moved
        ↓
Monitor
        ↓
Old Cloud Run service
        ↓
Old Artifact Registry images
        ↓
Old secrets
        ↓
Other unused resources
```

Don't immediately delete the old database or other stateful resources.

---

# Your repeatable architecture

For each project:

```text
GCP Project
│
├── Artifact Registry
│     └── apps
│
├── Secret Manager
│     ├── service-A secrets
│     └── service-B secrets
│
├── Service Accounts
│     ├── service-A-runtime
│     └── service-B-runtime
│
├── Cloud Build
│     ├── Service A trigger
│     └── Service B trigger
│
└── Cloud Run
      ├── Service A
      └── Service B
```

And your deployment lifecycle becomes:

```text
Git Push
   ↓
Cloud Build Trigger
   ↓
Build Docker Image
   ↓
Artifact Registry
   ↓
Cloud Run Revision
   ↓
Secret Manager
   ↓
Database / external services
```

## Master checklist

For **every new GCP project**, check billing → APIs → region → Artifact Registry → cleanup policy → IAM.

For **every new service**, check service account → secrets → secret IAM → database → Dockerfile → Cloud Build → Artifact Registry image → Cloud Run → public/private IAM → scaling → logs → domain/webhooks → production test.

The most important lesson from this migration is: **copying a resource doesn't necessarily copy the permissions around it**. Secrets can exist perfectly in the new project while the new Cloud Run runtime identity still cannot read them. Treat resource migration and IAM migration as separate checklist items.
