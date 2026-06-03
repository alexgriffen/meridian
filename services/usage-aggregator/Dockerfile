# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/usage-aggregator/pyproject.toml ./
COPY services/usage-aggregator/src ./src
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "usage_aggregator"]
