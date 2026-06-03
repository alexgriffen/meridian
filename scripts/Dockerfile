# syntax=docker/dockerfile:1.7
# Oneshot image for `migrate` and `seed` jobs in docker-compose.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/
COPY packages/otel/package.json ./packages/otel/
COPY packages/billing-core/package.json ./packages/billing-core/
COPY services/api-gateway/package.json ./services/api-gateway/
COPY services/billing-engine/package.json ./services/billing-engine/
COPY services/webhook-dispatcher/package.json ./services/webhook-dispatcher/
COPY scripts/package.json ./scripts/
RUN pnpm install --frozen-lockfile

COPY db/ ./db/
COPY scripts/ ./scripts/

WORKDIR /app/scripts
ENTRYPOINT ["pnpm", "exec", "tsx"]
CMD ["migrate.ts"]
