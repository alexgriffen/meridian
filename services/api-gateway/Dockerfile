# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

FROM base AS deps
# Copy lockfile and all workspace package.jsons for a deterministic install.
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

FROM deps AS runtime
COPY packages/ ./packages/
COPY services/api-gateway/ ./services/api-gateway/
COPY services/billing-engine/ ./services/billing-engine/

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

WORKDIR /app/services/api-gateway
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
