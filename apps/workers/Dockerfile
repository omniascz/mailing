# BullMQ job processors. Long-lived process; connects to Redis and Postgres.
# No HTTP listener → no HEALTHCHECK (BullMQ has its own queue health surface).
#
# Note on runtime: workers transitively imports several workspace packages
# (@forgemsg/editor, @forgemsg/i18n-cs/-sk) that expose `src/*.ts` directly
# in their package.json `exports`. Rather than force each of those into a
# separate tsc-build step (and accept their slowly-drifting dist output),
# the runner ships `tsx` and executes TS sources directly. tsx transpile
# overhead is ~50ms at startup; for a long-lived job processor it's noise.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/workers/package.json ./apps/workers/
COPY apps/editor/package.json ./apps/editor/
COPY packages/shared/package.json ./packages/shared/
COPY packages/i18n-cs/package.json ./packages/i18n-cs/
COPY packages/i18n-sk/package.json ./packages/i18n-sk/
RUN pnpm install --frozen-lockfile --filter @forgemsg/workers...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=deps /app/apps/editor/node_modules ./apps/editor/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# Only @forgemsg/shared needs a dist (its package.json points there).
# editor + i18n-* are loaded as TS source at runtime via tsx.
RUN pnpm --filter @forgemsg/shared build

FROM node:22-alpine AS runner
RUN apk add --no-cache tini \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production
# Workspace pnpm symlinks resolve relative to the workers dir, so the
# editor/i18n source trees must live at their original paths.
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/src ./apps/workers/src
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/tsconfig.json ./apps/workers/tsconfig.json
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/src ./apps/editor/src
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/package.json ./apps/editor/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/node_modules ./apps/editor/node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-cs/src ./packages/i18n-cs/src
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-cs/package.json ./packages/i18n-cs/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-sk/src ./packages/i18n-sk/src
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-sk/package.json ./packages/i18n-sk/package.json
# proto-loader loads mta.proto at workers boot. Path is resolved relative
# to mta-grpc-client.ts: ../../../engine/proto/mta.proto.
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/engine/proto ./apps/engine/proto
COPY --from=builder --chown=forgemsg:forgemsg /app/node_modules ./node_modules
USER forgemsg
WORKDIR /app/apps/workers
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
