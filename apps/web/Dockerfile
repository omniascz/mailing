# Next.js 15 frontend. Uses standalone output mode (configured in
# next.config.ts) so the runner image is small + self-contained.
#
# Build args:
#   NEXT_PUBLIC_API_URL — baked into the client bundle at build time.
#   API_URL — server-side only, can be overridden at runtime.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/editor/package.json ./apps/editor/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @forgemsg/web...

FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/editor/node_modules ./apps/editor/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# turbo derives the build order (shared → editor → web) from the dependency
# graph. The hand-chained `pnpm --filter` version skipped turbo.json
# `build.dependsOn: ["^build"]` and had to be kept in sync by hand.
RUN pnpm turbo build --filter=@forgemsg/web

FROM node:22-alpine AS runner
RUN apk add --no-cache tini wget \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone output has server.js + minimal node_modules at the root,
# plus the static assets that need to be served from /static and
# /_next/static. Public/ files need to be at the root too.
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/web/.next/standalone ./
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/web/public ./apps/web/public
USER forgemsg
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/login || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
