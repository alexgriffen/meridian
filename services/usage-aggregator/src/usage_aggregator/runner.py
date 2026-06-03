"""Entry point for the usage aggregator worker.

Supports two ingest modes selected by USAGE_INGEST env var:
- "kafka"   — production: consume from usage.events.v1
- "outbox"  — alpha:      poll usage_events table

The alpha mode is intended for the small-footprint deployment. When we
graduate this service to production scale, flip USAGE_INGEST=kafka and
remove the outbox table.
"""
from __future__ import annotations

import os
import signal
import sys
import time
from typing import Any

import structlog

from .aggregator import Aggregator
from .db import get_pool
from .telemetry import init_telemetry

log = structlog.get_logger("usage-aggregator")

_should_stop = False


def _handle_signal(signum: int, _frame: Any) -> None:
    global _should_stop
    log.info("shutdown signal received", signal=signum)
    _should_stop = True


def main() -> None:
    init_telemetry("usage-aggregator")
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    mode = os.environ.get("USAGE_INGEST", "outbox")
    if mode == "outbox":
        _run_outbox()
    elif mode == "kafka":
        _run_kafka()
    else:
        log.error("unknown USAGE_INGEST mode", mode=mode)
        sys.exit(2)


def _run_outbox() -> None:
    """Alpha mode: poll the usage_events outbox table."""
    pool = get_pool()
    aggregator = Aggregator(pool)
    poll_interval = float(os.environ.get("OUTBOX_POLL_INTERVAL_SEC", "1.0"))
    batch_size = int(os.environ.get("OUTBOX_BATCH_SIZE", "50"))

    log.info("outbox consumer started", poll_interval=poll_interval, batch_size=batch_size)
    while not _should_stop:
        n = aggregator.drain_outbox(batch_size)
        if n == 0:
            time.sleep(poll_interval)
    log.info("outbox consumer stopped")
    sys.exit(0)


def _run_kafka() -> None:
    """Production mode: Kafka consumer (not used in alpha — kept for parity)."""
    from kafka import KafkaConsumer  # imported lazily so alpha doesn't need it

    topic = os.environ.get("USAGE_EVENTS_TOPIC", "usage.events.v1")
    bootstrap = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    group_id = os.environ.get("CONSUMER_GROUP", "usage-aggregator-v1")

    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap.split(","),
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        value_deserializer=lambda b: b,
    )

    pool = get_pool()
    aggregator = Aggregator(pool)

    log.info("kafka consumer started", topic=topic, group=group_id)
    for message in consumer:
        if _should_stop:
            break
        aggregator.handle(message.value)
        consumer.commit()
    log.info("kafka consumer stopped")
    sys.exit(0)
