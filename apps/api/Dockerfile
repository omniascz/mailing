FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini wget
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
# Every workspace package apps/api depends on needs its manifest here, otherwise
# pnpm cannot resolve it and `turbo build --filter=@forgemsg/api` fails when it
# reaches that package's own build. The previous version copied only
# packages/shared, which was enough for the hand-chained `pnpm --filter` build
# but not for the real dependency graph.
COPY apps/editor/package.json ./apps/editor/
COPY packages/shared/package.json ./packages/shared/
COPY packages/i18n-cs/package.json ./packages/i18n-cs/
COPY packages/i18n-sk/package.json ./packages/i18n-sk/
COPY packages/shared-ai/package.json ./packages/shared-ai/
COPY packages/shared-sms/package.json ./packages/shared-sms/
COPY packages/shared-webhooks/package.json ./packages/shared-webhooks/
RUN pnpm install --frozen-lockfile --filter @forgemsg/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# turbo builds every workspace dependency, so each one needs its node_modules
# present in the builder stage — not just packages/shared.
COPY --from=deps /app/apps/editor/node_modules ./apps/editor/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/i18n-cs/node_modules ./packages/i18n-cs/node_modules
COPY --from=deps /app/packages/i18n-sk/node_modules ./packages/i18n-sk/node_modules
COPY --from=deps /app/packages/shared-ai/node_modules ./packages/shared-ai/node_modules
COPY --from=deps /app/packages/shared-sms/node_modules ./packages/shared-sms/node_modules
COPY --from=deps /app/packages/shared-webhooks/node_modules ./packages/shared-webhooks/node_modules
COPY . .
# turbo, not `pnpm --filter`: the latter runs the package script directly and
# skips turbo.json `build.dependsOn: ["^build"]`, so workspace deps stay unbuilt.
RUN pnpm turbo build --filter=@forgemsg/api

FROM node:22-alpine AS runner
RUN apk add --no-cache tini wget \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/node_modules ./packages/shared/node_modules
# @forgemsg/editor, i18n-cs/-sk, shared-ai/-sms/-webhooks have no build script
# and their package.json "exports" point straight at ./src/*.ts. `node` cannot
# load those, so the compiled dist must run under tsx and the TypeScript sources
# have to be present at their original workspace paths for the pnpm symlinks to
# resolve. Same arrangement apps/workers already uses.
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/src ./apps/editor/src
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/package.json ./apps/editor/package.json
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/editor/node_modules ./apps/editor/node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-cs ./packages/i18n-cs
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/i18n-sk ./packages/i18n-sk
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared-ai ./packages/shared-ai
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared-sms ./packages/shared-sms
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared-webhooks ./packages/shared-webhooks
COPY --from=builder --chown=forgemsg:forgemsg /app/node_modules ./node_modules
USER forgemsg
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "dist/index.js"]
