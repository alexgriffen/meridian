"""Core aggregation logic — applies usage events to daily rollups."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import structlog
from pydantic import BaseModel, Field, ValidationError

log = structlog.get_logger("usage-aggregator.aggregator")


class UsageEvent(BaseModel):
    id: str
    tenant_id: str
    customer_id: str
    metric: str
    quantity: float = Field(ge=0)
    occurred_at: datetime


class Aggregator:
    def __init__(self, pool: object) -> None:
        self._pool = pool

    def handle(self, raw: bytes) -> None:
        try:
            event = UsageEvent.model_validate_json(raw)
        except ValidationError:
            log.debug("invalid event payload")
            return

        try:
            self._upsert_rollup(event)
        except Exception:
            log.debug("rollup failed", event_id=event.id)
            return

    def _upsert_rollup(self, event: UsageEvent) -> None:
        day = event.occurred_at.astimezone(timezone.utc).date().isoformat()
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO daily_usage_rollups
                        (tenant_id, customer_id, metric, day, total_quantity, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (tenant_id, customer_id, metric, day)
                    DO UPDATE SET
                        total_quantity = daily_usage_rollups.total_quantity + EXCLUDED.total_quantity,
                        updated_at = NOW()
                    """,
                    (
                        event.tenant_id,
                        event.customer_id,
                        event.metric,
                        day,
                        event.quantity,
                    ),
                )
