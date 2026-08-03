# Voice bot: Twilio Media Streams WebSocket listener (port 8787 by default).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate \
    && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/voice-bot/package.json ./apps/voice-bot/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @forgemsg/voice-bot...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/voice-bot/node_modules ./apps/voice-bot/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# turbo, not `pnpm --filter` — see apps/api/Dockerfile for why.
RUN pnpm turbo build --filter=@forgemsg/voice-bot

FROM node:22-alpine AS runner
RUN apk add --no-cache tini netcat-openbsd \
    && addgroup -S forgemsg && adduser -S forgemsg -G forgemsg
WORKDIR /app
ENV NODE_ENV=production \
    VOICE_BOT_PORT=8787
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/voice-bot/dist ./dist
COPY --from=builder --chown=forgemsg:forgemsg /app/apps/voice-bot/node_modules ./node_modules
COPY --from=builder --chown=forgemsg:forgemsg /app/packages/shared/dist ./packages/shared/dist
USER forgemsg
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD nc -z localhost ${VOICE_BOT_PORT} || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
