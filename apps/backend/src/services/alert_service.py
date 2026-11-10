from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.models.alert import AlertRule, NotificationChannel, AlertHistory, RuleType, AlertStatus
from src.models.proposal import TreasurySpend
from src.services.notification_service import NotificationService
import structlog
import json

logger = structlog.get_logger()

class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.notification_service = NotificationService()

    async def create_channel(self, name: str, type: str, config: dict, project_id: int) -> NotificationChannel:
        channel = NotificationChannel(name=name, type=type, config=config, project_id=project_id)
        self.db.add(channel)
        await self.db.commit()
        await self.db.refresh(channel)
        return channel

    async def create_rule(self, name: str, rule_type: str, condition: dict, channel_id: int, project_id: int) -> AlertRule:
        rule = AlertRule(name=name, rule_type=rule_type, condition=condition, channel_id=channel_id, project_id=project_id)
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def check_alerts(self, project_id: int):
        logger.info("Starting alert check", project_id=project_id)
        rules = await self.db.execute(select(AlertRule).where(AlertRule.is_active == True, AlertRule.project_id == project_id))
        active_rules = rules.scalars().all()

        for rule in active_rules:
            try:
                if rule.rule_type == RuleType.TREASURY_THRESHOLD:
                    await self._check_treasury_threshold(rule, project_id)
            except Exception as e:
                logger.error("Error checking rule", rule_id=rule.id, error=str(e))

    async def _check_treasury_threshold(self, rule: AlertRule, project_id: int):
        threshold = rule.condition.get("threshold", 0)
        # Find latest spend exceeding threshold (Simplified logic for demo)
        # In real world, we'd track "last_checked_block" to avoid duplicates
        # Shared-chain MVP: spends are indexed without project_id; still alert for this tenant.
        stmt = (
            select(TreasurySpend)
            .where(
                TreasurySpend.value > str(threshold),
                (TreasurySpend.project_id == project_id) | (TreasurySpend.project_id.is_(None)),
            )
            .order_by(TreasurySpend.block_number.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        spend = result.scalars().first()

        if spend:
            # Check if we already alerted for this spend on this rule
            # dedup logic: check alert history for this rule_id and payload["spend_id"] == spend.id
            history_stmt = select(AlertHistory).where(
                AlertHistory.rule_id == rule.id,
                AlertHistory.payload['spend_id'].as_integer() == spend.id
            )
            existing = await self.db.execute(history_stmt)
            if existing.scalars().first():
                return 

            # Trigger Alert
            channel = await self.db.get(NotificationChannel, rule.channel_id)
            if not channel:
                logger.error("Channel not found for rule", rule_id=rule.id)
                return

            from src.money import format_alert_amount, from_spend_row

            amt = from_spend_row(spend)
            message = (
                f"Treasury Spend Alert: {format_alert_amount(spend)} "
                f"paid to {spend.beneficiary} at block {spend.block_number}"
            )
            success = await self.notification_service.send_notification(channel, f"Alert: {rule.name}", message)

            # Record History
            history = AlertHistory(
                rule_id=rule.id,
                payload={
                    "spend_id": spend.id,
                    "value": spend.value,
                    "amount_raw": amt.amount_raw,
                    "asset_symbol": amt.asset_symbol,
                    "asset_id": amt.asset_id,
                    "display_status": amt.display_status,
                    "amount_display": amt.amount_display,
                },
                status=AlertStatus.SENT if success else AlertStatus.FAILED,
                error_message=None if success else "Failed to send",
                project_id=project_id
            )
            self.db.add(history)
            await self.db.commit()
            logger.info("Alert processed", rule_id=rule.id, status=history.status)
