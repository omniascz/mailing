FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini wget
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @forgemsg/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @forgemsg/shared build && pnpm --filter @forgemsg/api build

FROM node:22-alpine AS runner
RUN apk add --no-cache tini wget \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/api/dist ./dist
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/dist ./packages/shared/dist
USER forgemsg
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
