from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from asgi_correlation_id import CorrelationIdMiddleware
from src.config import settings
from src.logging_config import configure_logging
from src.api.v1.router import router as v1_router
from src.api.v1.export import router as export_router
from src.middleware import SecurityHeadersMiddleware, AuditLogMiddleware, limiter
from src.tenant_middleware import TenantMiddleware
from src.errors import global_exception_handler, rate_limit_handler, RateLimitExceeded

configure_logging()

app = FastAPI(
    title="PolkAudit API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# State for Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Middleware (Order matters: Outer -> Inner)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(TenantMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from src.api.v1.reports import router as reports_router
from src.api.auth import router as auth_router
from src.api.admin import router as admin_router
from src.api.v1.alerts import router as alerts_router
from src.api.v1.projects import router as projects_router
from src.api.v1.scoring import router as scoring_router
from src.api.v1.analytics import router as analytics_router
from src.api.v1.integrations import router as integration_router
from src.api.v1.ai import router as ai_router
from src.api.v1.compliance import router as compliance_router
from src.api.v1.chains import router as chains_router
from src.api.v1.audit import router as audit_router
from src.api.v1.keys import router as keys_router
from src.api.v1.billing import router as billing_router
from src.api.v1.usage import router as usage_router
from src.api.v1.schedules import router as schedules_router
from src.api.admin_db import router as admin_db_router
from src.api.public.router import router as public_router

# Routers
app.include_router(v1_router, prefix="/api/v1", tags=["v1"])
app.include_router(export_router, prefix="/api/v1/export", tags=["export"])
app.include_router(reports_router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_db_router, prefix="/api/admin/db", tags=["admin-db"])
app.include_router(alerts_router, prefix="/api/v1/alerts", tags=["alerts"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(scoring_router, prefix="/api/v1/scores", tags=["scoring"])
app.include_router(analytics_router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(integration_router, prefix="/api/v1/integrations", tags=["integrations"])
app.include_router(ai_router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(compliance_router, prefix="/api/v1/compliance", tags=["compliance"])
app.include_router(chains_router, prefix="/api/v1/chains", tags=["chains"])
app.include_router(audit_router, prefix="/api/v1/audit", tags=["audit"])
app.include_router(keys_router, prefix="/api/v1/keys", tags=["api-keys"])
app.include_router(billing_router, prefix="/api/v1/billing", tags=["billing"])
app.include_router(usage_router, prefix="/api/v1/usage", tags=["usage"])
app.include_router(schedules_router, prefix="/api/v1/schedules", tags=["schedules"])
app.include_router(public_router, prefix="/api/public", tags=["public"])

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "app": "PolkAudit Backend"}

@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to PolkAudit API. Visit /docs for documentation."}
