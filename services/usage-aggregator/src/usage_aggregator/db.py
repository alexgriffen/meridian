"""Postgres connection pool."""
from __future__ import annotations

import os
from functools import lru_cache

import psycopg_pool


@lru_cache(maxsize=1)
def get_pool() -> psycopg_pool.ConnectionPool:
    return psycopg_pool.ConnectionPool(
        conninfo=os.environ["DATABASE_URL"],
        min_size=2,
        max_size=int(os.environ.get("PG_POOL_MAX", "10")),
        kwargs={"application_name": "usage-aggregator"},
    )
