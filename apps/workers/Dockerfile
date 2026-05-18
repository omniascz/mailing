# BullMQ job processors. Long-lived process; connects to Redis and Postgres.
# No HTTP listener → no HEALTHCHECK (BullMQ has its own queue health surface).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/workers/package.json ./apps/workers/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @forgemsg/workers...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @forgemsg/shared build && pnpm --filter @forgemsg/workers build

FROM node:22-alpine AS runner
RUN apk add --no-cache tini \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/dist ./dist
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/node_modules ./node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/dist ./packages/shared/dist
USER forgemsg
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
