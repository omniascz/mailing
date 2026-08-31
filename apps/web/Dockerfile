# Next.js 15 frontend. Uses standalone output mode (configured in
# next.config.ts) so the runner image is small + self-contained.
#
# Build args:
#   NEXT_PUBLIC_API_URL — baked into the client bundle at build time.
#   API_URL — server-side only, can be overridden at runtime.
#   NEXT_PUBLIC_FEATURE_BEYOND_CORE — must match the API's FEATURE_BEYOND_CORE.

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
# Beyond-core nav (CRM, helpdesk, loyalty, AI agents, …). The sidebar and the
# command palette read this at BUILD time — Next.js inlines NEXT_PUBLIC_* into
# the client bundle, so setting it in the running container does nothing.
#
# Declared explicitly, and false. Until now the image simply had no such
# variable, so `process.env.NEXT_PUBLIC_FEATURE_BEYOND_CORE === 'true'` was
# false by absence — the right answer for the wrong reason, and one that
# quietly flips the day someone adds a global build env. It has to be a
# decision the file states, because it must agree with the API's
# FEATURE_BEYOND_CORE: on with the API off, the dashboard offers pages whose
# endpoints are not registered and answer 404.
ARG NEXT_PUBLIC_FEATURE_BEYOND_CORE=false
ENV NEXT_PUBLIC_FEATURE_BEYOND_CORE=$NEXT_PUBLIC_FEATURE_BEYOND_CORE
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
