import json
from datetime import datetime, timezone
from unittest.mock import MagicMock

from usage_aggregator.aggregator import Aggregator


def _event(metric: str = "api_calls", quantity: float = 5) -> bytes:
    return json.dumps(
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "tenant_id": "22222222-2222-2222-2222-222222222222",
            "customer_id": "33333333-3333-3333-3333-333333333333",
            "metric": metric,
            "quantity": quantity,
            "occurred_at": datetime(2026, 5, 1, 12, tzinfo=timezone.utc).isoformat(),
        }
    ).encode()


def test_valid_event_upserts_rollup():
    pool = MagicMock()
    agg = Aggregator(pool)
    agg.handle(_event())
    assert pool.connection.called


def test_invalid_event_is_ignored():
    pool = MagicMock()
    agg = Aggregator(pool)
    agg.handle(b"not json")
    pool.connection.assert_not_called()
