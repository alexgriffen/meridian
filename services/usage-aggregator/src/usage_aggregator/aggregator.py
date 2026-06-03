"""Core aggregation logic — applies usage events to daily rollups."""
from __future__ import annotations

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

    # ---- Kafka mode (production) --------------------------------------------

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

    # ---- Outbox mode (alpha) ------------------------------------------------

    def drain_outbox(self, batch_size: int) -> int:
        """Claim a batch of pending outbox rows and apply them.

        Returns the number of rows handled (claimed). Caller polls again
        when this returns 0.
        """
        rows = self._claim_batch(batch_size)
        for row in rows:
            event = UsageEvent(
                id=str(row["id"]),
                tenant_id=str(row["tenant_id"]),
                customer_id=str(row["customer_id"]),
                metric=row["metric"],
                quantity=row["quantity"],
                occurred_at=row["occurred_at"],
            )
            try:
                self._upsert_rollup(event)
                self._mark_processed(event.id)
            except Exception:
                log.debug("rollup failed", event_id=event.id)
                self._mark_processed(event.id)
        return len(rows)

    def _claim_batch(self, batch_size: int) -> list[dict]:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE usage_events
                    SET status = 'claimed', claimed_at = NOW()
                    WHERE id IN (
                        SELECT id FROM usage_events
                        WHERE status = 'pending'
                        ORDER BY created_at
                        LIMIT %s
                    )
                    RETURNING id, tenant_id, customer_id, metric, quantity, occurred_at
                    """,
                    (batch_size,),
                )
                cols = [desc[0] for desc in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]

    def _mark_processed(self, event_id: str) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE usage_events SET status = 'processed', processed_at = NOW() WHERE id = %s",
                    (event_id,),
                )

    # ---- Rollup write (shared) ---------------------------------------------

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
