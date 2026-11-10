import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from src.database import Base
from src.models.proposal import Proposal # Import models to register them
from src.models.report import Report
from src.models.user import User
from src.models.alert import NotificationChannel, AlertRule, AlertHistory
from src.models.project import Project, UserProject
from src.models.scoring import ScoreConfig, GovernanceScore
from src.models.analytics import AnalyticsMetric, Forecast
from src.models.integration import Plugin, Integration
from src.models.ai import AIRecommendation
from src.models.compliance import CompliancePolicy, ContractEvent, ComplianceViolation
from src.models.audit import AuditCase, AuditEvidence, AuditComment
from src.models.api_key import ApiKey
from src.models.billing import Plan, Subscription, PaymentEvent
from src.models.auth_token import AuthToken
from src.models.platform_setting import PlatformSetting
from src.models.usage import UsageCounter, ExportSchedule
from src.models.invoice import Invoice
from src.config import settings

target_metadata = Base.metadata

config.set_main_option("sqlalchemy.url", settings.async_database_url)

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
