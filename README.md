# Mailforge

Unified omnichannel messaging platform — email + SMS + voice agent +
WhatsApp + push, with a shared contact graph and a CZ/SK-localized core.
Built in EU on Hetzner + Vercel; competes with Mailchimp / Brevo / HubSpot
on depth and with Mailkit on AI integration.

## Quickstart (dev)

```bash
pnpm install
docker compose up -d postgres redis        # infrastructure only
pnpm --filter @forgemsg/api db:migrate     # apply schema
pnpm seed                                  # demo data + login creds
pnpm dev                                   # turbo dev across all apps
```

Then open:

- `http://localhost:3000` — web (Next.js)
- `http://localhost:3001/docs` — API Swagger UI

Login as `demo@acme.test` / `Demo1234!`.

For a deeper dev-stack walkthrough see [`infra/DEV_STACK.md`](infra/DEV_STACK.md).

## Architecture

Turborepo monorepo with pnpm workspaces.

| App                    | Path               | Language   | Purpose                                                     |
| ---------------------- | ------------------ | ---------- | ----------------------------------------------------------- |
| `@forgemsg/api`        | `apps/api`         | TypeScript | Fastify REST API (port 3001)                                |
| `@forgemsg/web`        | `apps/web`         | TypeScript | Next.js 15 App Router (port 3000)                           |
| `@forgemsg/editor`     | `apps/editor`      | TypeScript | React email block editor (library)                          |
| `engine`               | `apps/engine`      | Go         | SMTP MTA — DKIM, IP pool, connection mgmt                   |
| `@forgemsg/workers`    | `apps/workers`     | TypeScript | BullMQ job processors                                       |
| `sms-gateway`          | `apps/sms-gateway` | Go         | SMPP v3.4 SMS gateway                                       |
| `@forgemsg/voice-bot`  | `apps/voice-bot`   | TypeScript | Outbound AI voice (Twilio + Deepgram + ElevenLabs + Claude) |
| `@forgemsg/mcp-server` | `apps/mcp-server`  | TypeScript | Model Context Protocol server for Claude integrations       |

Shared packages:

- `packages/shared` — types, utils, `IChannelAdapter` interface
- `packages/i18n-cs`, `packages/i18n-sk` — locale tooling (vocative, name days, holidays)
- `packages/shared-{ai,sms,webhooks}` — channel-specific helpers
- `packages/{sdk,sdk-python,web-sdk,zapier-app}` — client integrations

## Stack

- **API**: Fastify + Drizzle ORM + Zod
- **Web**: Next.js 15 (App Router) + Tailwind v4 + React Query + Zustand
- **DB**: Postgres 16 (pgvector for embeddings) + ClickHouse (analytics)
- **Cache + queue**: Redis 7 (BullMQ); Kafka in later phases
- **MTA**: own Go engine — no Postal, no PowerMTA
- **Hosting**: Hetzner Cloud (apps) + Hetzner Dedicated (MTA + DB primary) + Vercel (web)
- **AI**: Anthropic Claude (Sonnet 4.6 for quality, Haiku 4.5 for speed)

## Repo conventions

Mostly enforced by ESLint + Prettier; the high-level rules are in
[`CLAUDE.md`](CLAUDE.md). Key ones:

- Files: `kebab-case.ts`, components `PascalCase.tsx`
- DB columns: `snake_case`, indexes always on FKs + filter columns
- Every query org-scoped — no cross-tenant reads
- Cursor pagination, never offset
- Errors via `AppError` class from `@forgemsg/shared`
- Tests colocated as `*.test.ts`; integration tests hit a real Postgres

## Common commands

```bash
pnpm dev               # everything in dev
pnpm build             # turbo build all packages
pnpm test              # vitest + go test across the monorepo
pnpm typecheck         # tsc --noEmit across all TS packages
pnpm lint              # eslint + go vet
pnpm format            # prettier write
pnpm seed              # populate demo org (see DEPLOY.md §5)
```

API-specific:

```bash
pnpm --filter @forgemsg/api db:generate    # diff schema → emit migration SQL
pnpm --filter @forgemsg/api db:migrate     # apply pending migrations
pnpm --filter @forgemsg/api db:studio      # Drizzle Studio (don't point at prod)
```

## Documentation index

- [`CLAUDE.md`](CLAUDE.md) — project conventions for Claude Code sessions
- [`DEPLOY.md`](DEPLOY.md) — step-by-step Hetzner + Vercel deploy runbook
- [`OPERATIONS.md`](OPERATIONS.md) — day-2 ops runbook (logs, restarts, incidents, backups)
- [`SECURITY.md`](SECURITY.md) — pre-launch security review + checklist
- [`TECH_STACK.md`](TECH_STACK.md) — validated tech choices
- [`FORGEMSG_ROADMAP.md`](FORGEMSG_ROADMAP.md) — 10-phase, 52-week plan
- [`infra/PIVOT_AWS_TO_HETZNER.md`](infra/PIVOT_AWS_TO_HETZNER.md) — why we left AWS
- [`infra/HOSTING_DETAIL.md`](infra/HOSTING_DETAIL.md) — Hetzner sizing + IP plan
- [`infra/DELIVERABILITY.md`](infra/DELIVERABILITY.md) — IP warming, FBL, postmaster setup
- [`infra/DEV_STACK.md`](infra/DEV_STACK.md) — local stack orchestration (`scripts/dev-stack.sh`)

## License

Source-available, not yet OSI-licensed. Internal use only until 1.0.
