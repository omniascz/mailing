# Dev stack — bringing up Mailforge locally

Captures everything learned during the May 19 2026 integration validation. If you're standing up a fresh checkout for the first time, follow this in order. Skipping a step or shuffling the order will cause silent failures (queues that never drain, pages that 404 with an authenticated cookie, etc).

## Prerequisites

- **Docker Desktop** — pulls postgres + redis images
- **Node 20+** with **pnpm** (workspace tooling)
- **Go 1.22+** — only if you need to rebuild `apps/engine/engine.exe`; a pre-built binary ships with the repo

## Ports

The defaults assume nothing else on the box. If a port is taken (very likely on dev machines running Supabase / other Next.js projects), pick alternates and pass them via env. The boot script below assumes:

| Service       | Default | Notes                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------- |
| Postgres      | `5432`  | switch to `55432` if Supabase or another Postgres is bound to `5432`      |
| Redis         | `6379`  | switch to `56379`                                                         |
| API (Fastify) | `3001`  | switch to `3099` if Express dev servers from other projects are squatting |
| Web (Next.js) | `3000`  | switch to `3098`                                                          |
| MTA gRPC      | `50051` | rarely collides                                                           |

## Boot order (one-shot)

```bash
# 1. Bring up infra
docker run -d --rm --name forgemsg-pg \
  -e POSTGRES_DB=forgemsg -e POSTGRES_USER=forgemsg -e POSTGRES_PASSWORD=forgemsg \
  -p 55432:5432 pgvector/pgvector:pg16

docker run -d --rm --name forgemsg-redis \
  -p 56379:6379 redis:7-alpine

# Wait for pg
until docker exec forgemsg-pg pg_isready -U forgemsg -d forgemsg > /dev/null 2>&1; do sleep 1; done

# 2. Apply schema. Migration 0000 enables the `vector` + `uuid-ossp`
#    extensions itself (IF NOT EXISTS guarded), so this is the only step
#    needed on a clean DB. drizzle-kit push diffs against schema/ — for
#    production use drizzle-kit migrate against the SQL files.
cd apps/api
DATABASE_URL="postgresql://forgemsg:forgemsg@localhost:55432/forgemsg" \
  npx drizzle-kit push --force

# 3. Start API. JWT_SECRET is required.
DATABASE_URL="postgresql://forgemsg:forgemsg@localhost:55432/forgemsg" \
  REDIS_URL="redis://localhost:56379" \
  JWT_SECRET="dev-only-secret-do-not-ship" \
  PORT=3099 \
  pnpm dev

# 4. Start workers — MUST run AFTER API is up. The campaign-splitter
#    worker calls back into /api/v1/internal/audience and /internal/contacts
#    so it ECONNREFUSE's if API isn't reachable yet.
#
#    API_URL MUST use 127.0.0.1 not localhost — node:fetch resolves
#    localhost to ::1 first, and the API binds to 0.0.0.0 in a way that
#    doesn't always catch IPv6 loopback on Windows.
cd apps/workers
DATABASE_URL="postgresql://forgemsg:forgemsg@localhost:55432/forgemsg" \
  REDIS_URL="redis://localhost:56379" \
  API_URL="http://127.0.0.1:3099" \
  pnpm dev

# 5. Start MTA. Workers cache gRPC client state — if MTA isn't running
#    when the worker boots, even after MTA comes up the worker will keep
#    hitting ECONNREFUSED on cached connections until restarted. So:
#    MTA first, worker second.
cd apps/engine
./engine.exe  # or `go run .` if rebuilding from source

# Then bounce the worker so its gRPC pool re-resolves.

# 6. Start web. Reads API_URL/NEXT_PUBLIC_API_URL on every server-render.
cd apps/web
NEXT_PUBLIC_API_URL="http://localhost:3099" \
  API_URL="http://localhost:3099" \
  pnpm dev  # or `next start -p 3098` for the prod build
```

## Smoke test — golden path

After everything is up:

```bash
# Register
curl -s -c /tmp/c.txt -X POST http://localhost:3099/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.local","password":"TestPass123!","name":"Smoke","orgName":"Smoke"}'

# Create list
echo '{"name":"Smoke list","doubleOptIn":false}' | \
  curl -s -b /tmp/c.txt -X POST http://localhost:3099/api/v1/lists \
  -H "Content-Type: application/json" --data-binary @-

# Add contacts (batch)
echo '{"contacts":[{"email":"a@example.com"},{"email":"b@example.com"}]}' | \
  curl -s -b /tmp/c.txt -X POST http://localhost:3099/api/v1/contacts/batch \
  -H "Content-Type: application/json" --data-binary @-

# Pick up the list ID + contact IDs from those responses, attach them,
# create a campaign with listId, then POST /campaigns/:id/send.
# Watch logs:
#   - worker stdout: "[campaign-splitter] Job N completed: {batches:1, totalContacts:2}"
#   - worker stdout: "[batch-sender] Job N completed: {sent:2, skipped:0}"
#   - engine stderr: gRPC SendMessage hits + (for fake domains) MX lookup failures
```

## Common pitfalls (each was a real bug during validation)

### "Body cannot be empty when content-type is set to 'application/json'"

Some endpoints (`POST /campaigns/:id/send`, `POST /lead-scoring/decay`) take no body. Fastify still requires a body when the header is set. Always send `{}` instead of empty `''`. Frontend already does this; only matters for curl smoke tests.

### Czech diacritics in curl `-d` bodies

Bash's `-d "{\"name\":\"Newsletter — CZ\"}"` mangles byte length vs `Content-Length` header. Use `--data-binary @file.json` for any body with non-ASCII content.

### Two `page.tsx` files claiming `/`

If you see the dashboard's `/` render as a 404 even with auth cookie, check for `apps/web/src/app/page.tsx` AND `apps/web/src/app/(dashboard)/page.tsx`. Route group `(dashboard)` doesn't shield from collision — Next silently picks one and the other becomes 404. Keep only the `(dashboard)` one.

### Empty middleware-manifest.json

If `apps/web/.next/server/middleware-manifest.json` shows `{ "middleware": {} }` after build, the auth middleware isn't being included. Symptom: unauthenticated `GET /` returns 200 with dashboard HTML instead of redirecting to `/login`. Fix: `rm -rf apps/web/.next && next build`. Cause: stale build artifacts from earlier iterations.

### Worker silently produces `totalContacts: 0`

The campaign-splitter worker resolves audiences via `GET /api/v1/internal/audience?orgId=&campaignId=`. If you see `{"batches":0,"totalContacts":0}` despite the list having members, the worker is hitting `localhost:3001` (default) but your API is on a different port. Set `API_URL` env on the worker process to `http://127.0.0.1:<api-port>`.

### Worker gRPC client recovers from MTA restart automatically

Originally the gRPC client cached one channel forever. If MTA was down at worker boot, even after MTA recovered the worker stayed broken (`grpc-js` stuck in `TRANSIENT_FAILURE`). Fixed in `apps/workers/src/lib/mta-grpc-client.ts`: any `UNAVAILABLE/UNAUTHENTICATED/INTERNAL` response now drops the cached client so the next call rebuilds it. You no longer need to restart the worker after restarting MTA.

### PowerShell `Start-Process` doesn't inherit `$env:X`

If you're on Windows and starting services via PowerShell:

```powershell
# DOESN'T WORK — env vars don't propagate
$env:DATABASE_URL = "..."
Start-Process -FilePath node -ArgumentList "src/index.ts" ...

# WORKS — use cmd /c to set env then exec
$argList = '/c set "DATABASE_URL=..." && set "API_URL=..." && node --import tsx/esm src/index.ts'
Start-Process -FilePath cmd -ArgumentList $argList ...
```

## Teardown

```bash
# Stop processes (the API + workers + MTA + web)
# On Windows: Get-Process node | Stop-Process -Force  (kills all node, be careful)

docker stop forgemsg-pg forgemsg-redis
# --rm flag means containers auto-clean, no `docker rm` needed
```

## Phase status (as of May 19 2026 validation)

Confirmed end-to-end:

- Auth (register / login / cookie / middleware redirect / `/auth/me` / logout)
- Audience CRUD (lists / contacts / segments / tags / custom fields)
- Campaign lifecycle (create draft → set content → enqueue → splitter → batch-sender → mta gRPC)
- Workflow templates fork + step editor
- Frontend (40+ dashboard routes consuming live API)

Still unproven (need real network / external accounts):

- Actual SMTP delivery (MTA can't resolve `x.test` MX, would succeed against real domains)
- DOI confirmation email (TODO in code — `apps/api/src/routes/v1/subscriptions.ts`)
- AI agent runs against Anthropic API (set `ANTHROPIC_API_KEY`)
- Litmus inbox preview (mock provider works; real Litmus needs `LITMUS_API_KEY`)
- Stripe billing (no integration yet)
