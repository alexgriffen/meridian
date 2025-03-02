"""Entry point for the usage aggregator consumer."""
from __future__ import annotations

import os
import signal
import sys
from typing import Any

import structlog
from kafka import KafkaConsumer

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

    log.info("consumer started", topic=topic, group=group_id)
    for message in consumer:
        if _should_stop:
            break
        aggregator.handle(message.value)
        consumer.commit()
    log.info("consumer stopped")
    sys.exit(0)
