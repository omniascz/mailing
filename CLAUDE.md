# ForgeMsg — Unified Omnichannel Messaging Platform

## Architecture

Turborepo monorepo with pnpm workspaces.

### Packages

| Package | Path | Language | Purpose |
|---------|------|----------|---------|
| `@forgemsg/api` | `apps/api` | TypeScript | Fastify REST API (port 3001) |
| `@forgemsg/web` | `apps/web` | TypeScript | Next.js 15 App Router frontend (port 3000) |
| `@forgemsg/editor` | `apps/editor` | TypeScript | React email block editor (library) |
| `engine` | `apps/engine` | Go | SMTP sending engine (MTA, DKIM, connection pooling) |
| `@forgemsg/workers` | `apps/workers` | TypeScript | BullMQ job processors |
| `sms-gateway` | `apps/sms-gateway` | Go | SMPP v3.4 SMS gateway |
| `@forgemsg/voice-bot` | `apps/voice-bot` | TypeScript | AI voice robot (Twilio + Deepgram + ElevenLabs + Claude) |
| `@forgemsg/number-intel` | `apps/number-intel` | TypeScript | Phone number intelligence (HLR, prefix DB, MSC) |
| `@forgemsg/shared` | `packages/shared` | TypeScript | Shared types, utils, channel adapter interface |

### Infrastructure

- **Database**: PostgreSQL 16 (Drizzle ORM)
- **Analytics DB**: ClickHouse (event pipeline, materialized views)
- **Cache/Queue**: Redis 7 (sessions, BullMQ, rate limiting, HLR cache)
- **Message Queue**: BullMQ → Kafka (later phases)
- **Object Storage**: MinIO (S3-compatible) → AWS S3 in production
- **Container Orchestration**: Kubernetes (EKS) via Terraform

## Conventions

### Naming

- **Files**: `kebab-case.ts` for modules, `PascalCase.tsx` for React components
- **Variables/Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`, prefix interfaces with `I` only for adapter contracts (`IChannelAdapter`, `IHlrProvider`)
- **Database columns**: `snake_case`
- **API routes**: `/api/v1/kebab-case`
- **Environment variables**: `SCREAMING_SNAKE_CASE`

### File Structure (per package)

```
src/
  routes/       # API route handlers (api only)
  services/     # Business logic
  db/           # Drizzle schema + migrations
  types/        # TypeScript types
  utils/        # Helpers
  index.ts      # Entry point
```

### Error Handling

Use `AppError` class from `@forgemsg/shared`:
- Always throw typed errors with `code`, `message`, `statusCode`
- Never expose internal errors to API consumers
- Log errors with request context (requestId, orgId, userId)

## Database (Drizzle ORM)

- All tables use `snake_case` column names
- Primary keys: `id` (UUID v7 via `crypto.randomUUID()`)
- Timestamps: `created_at`, `updated_at` (timestamptz)
- Soft deletes: `deleted_at` (nullable timestamptz)
- All queries MUST be org-scoped (multi-tenant isolation)
- Use cursor-based pagination (not offset)
- Indexes: always index foreign keys and commonly filtered columns
- JSONB for flexible fields (`custom_fields`, `metadata`, `conditions`)

## API Patterns (Fastify)

- Zod validation on all request inputs (params, query, body)
- OpenAPI auto-generation via `@fastify/swagger`
- Rate limiting via `@fastify/rate-limit` (Redis-backed)
- Auth: JWT + Redis sessions, RBAC middleware (owner/admin/editor/viewer)
- Response format: `{ data, cursor?, hasMore?, total? }` for lists
- Errors: `{ code, message, statusCode, details? }`
- API versioning: URL path `/api/v1/`

## Frontend (Next.js 15)

- App Router (server components by default)
- Tailwind CSS v4
- State: Zustand for client state, React Query for server state
- Forms: react-hook-form + Zod
- Tables: @tanstack/react-table
- Charts: Recharts
- Drag-and-drop: @dnd-kit
- Workflow canvas: @xyflow/react (React Flow)

## Testing

- **Unit/Integration**: Vitest
- **E2E**: Playwright
- **Coverage target**: 80%+
- Test files: colocated as `*.test.ts` next to source
- Use factories for test data (no raw object literals)

## Channel Adapter Pattern

All messaging channels implement `IChannelAdapter` from `@forgemsg/shared`:
- `send()`, `getStatus()`, `estimateCost()`, `handleInbound()`, `validateTemplate()`, `getChannelLimits()`
- Each adapter lives in its own directory under the relevant package
- Provider failover: primary → backup with automatic switching

## AI Integration

- **In-product AI**: Claude API (Sonnet 4.6 for quality, Haiku 4.5 for speed/cost)
- Cache AI responses: Redis with `hash(system_prompt + user_prompt)` key, 24h TTL
- Track usage: `ai_usage` table (org_id, model, tokens, cost, feature)
- Rate limit per org per plan tier

## Environment Variables

Required in `.env.local`:
```
DATABASE_URL=postgresql://forgemsg:forgemsg@localhost:5432/forgemsg
REDIS_URL=redis://localhost:6379
CLICKHOUSE_URL=http://localhost:8123
KAFKA_BROKERS=localhost:9092
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

## Commands

```bash
pnpm dev          # Start all services in dev mode
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript check all packages
pnpm format       # Format all files with Prettier
```
