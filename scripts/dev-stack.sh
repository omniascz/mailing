#!/usr/bin/env bash
# Boot/teardown the Mailforge dev stack — postgres + redis + API + workers + MTA + web.
#
# Walks through the order the May 19 2026 integration validation proved
# necessary: infra → migrations → API → workers (with API_URL set) →
# MTA → web. Skipping any step or shuffling order causes silent failures.
# See infra/DEV_STACK.md for the full background.
#
# Usage:
#   ./scripts/dev-stack.sh up      — start everything
#   ./scripts/dev-stack.sh down    — stop everything
#   ./scripts/dev-stack.sh status  — show what's running
#
# Ports default to non-conflicting alternates (55432/56379/3099/3098) so
# the stack co-exists with Supabase or other Next dev servers. Override
# via env: PG_PORT, REDIS_PORT, API_PORT, WEB_PORT, MTA_PORT.

set -u

PG_PORT="${PG_PORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
API_PORT="${API_PORT:-3099}"
WEB_PORT="${WEB_PORT:-3098}"
MTA_PORT="${MTA_PORT:-50051}"

ROOT="$(cd "$(dirname "$0")/.."; pwd)"
LOG_DIR="${TMPDIR:-/tmp}/mailforge-dev"
mkdir -p "$LOG_DIR"

DB_URL="postgresql://forgemsg:forgemsg@localhost:$PG_PORT/forgemsg"
REDIS_URL="redis://localhost:$REDIS_PORT"
# 127.0.0.1 not localhost — node:fetch in workers resolves localhost to
# ::1 first, but the API binds to 0.0.0.0 in a way that misses IPv6
# loopback on Windows. localhost is fine for browser-side env vars.
API_INTERNAL="http://127.0.0.1:$API_PORT"
API_PUBLIC="http://localhost:$API_PORT"

up() {
  echo "==> 1. Postgres + Redis (ports $PG_PORT, $REDIS_PORT)"
  docker run -d --rm --name forgemsg-pg \
    -e POSTGRES_DB=forgemsg -e POSTGRES_USER=forgemsg -e POSTGRES_PASSWORD=forgemsg \
    -p "$PG_PORT:5432" pgvector/pgvector:pg16 > /dev/null || true
  docker run -d --rm --name forgemsg-redis \
    -p "$REDIS_PORT:6379" redis:7-alpine > /dev/null || true

  echo "    Waiting for Postgres…"
  until docker exec forgemsg-pg pg_isready -U forgemsg -d forgemsg > /dev/null 2>&1; do
    sleep 1
  done
  echo "    Postgres ready."

  echo "==> 2. Schema (drizzle-kit push)"
  (cd "$ROOT/apps/api" && DATABASE_URL="$DB_URL" npx drizzle-kit push --force > "$LOG_DIR/migrate.log" 2>&1) \
    && echo "    Schema applied." \
    || { echo "    Schema push FAILED — see $LOG_DIR/migrate.log"; exit 1; }

  echo "==> 3. API on $API_PORT"
  (cd "$ROOT/apps/api" \
    && DATABASE_URL="$DB_URL" REDIS_URL="$REDIS_URL" \
       JWT_SECRET="dev-only-secret-do-not-ship" \
       PORT="$API_PORT" NODE_ENV=development \
       node --import tsx/esm src/index.ts \
       > "$LOG_DIR/api.log" 2>&1 &)
  sleep 4
  if ! curl -sf -o /dev/null "$API_INTERNAL/api/v1/health"; then
    echo "    API failed to respond — see $LOG_DIR/api.log"
    tail -20 "$LOG_DIR/api.log"
    exit 1
  fi
  echo "    API ready at $API_INTERNAL"

  echo "==> 4. MTA (Go engine) on $MTA_PORT"
  if [ -x "$ROOT/apps/engine/engine.exe" ]; then
    ("$ROOT/apps/engine/engine.exe" > "$LOG_DIR/engine.log" 2>&1 &)
    sleep 2
    echo "    MTA started."
  elif command -v go > /dev/null 2>&1; then
    (cd "$ROOT/apps/engine" && go run . > "$LOG_DIR/engine.log" 2>&1 &)
    sleep 3
    echo "    MTA started (built from source)."
  else
    echo "    MTA SKIPPED — no engine.exe and no Go toolchain"
    echo "    Worker will ECONNREFUSED on mta-{isp} jobs but other queues work."
  fi

  echo "==> 5. Workers (API_URL=$API_INTERNAL)"
  (cd "$ROOT/apps/workers" \
    && DATABASE_URL="$DB_URL" REDIS_URL="$REDIS_URL" API_URL="$API_INTERNAL" \
       node --import tsx/esm src/index.ts \
       > "$LOG_DIR/workers.log" 2>&1 &)
  sleep 4
  echo "    Workers started."

  echo "==> 6. Web on $WEB_PORT (NEXT_PUBLIC_API_URL=$API_PUBLIC)"
  (cd "$ROOT/apps/web" \
    && NEXT_PUBLIC_API_URL="$API_PUBLIC" API_URL="$API_PUBLIC" \
       npx next dev -p "$WEB_PORT" \
       > "$LOG_DIR/web.log" 2>&1 &)
  sleep 5
  echo "    Web building. Visit http://localhost:$WEB_PORT once it says Ready."

  echo
  echo "Logs in $LOG_DIR/"
  echo "Tail with: tail -f $LOG_DIR/*.log"
}

down() {
  echo "==> Stopping web / workers / API / MTA"
  # Crude but works on POSIX: find anything that mentions our log dir or
  # known cwd, kill it. On Windows you'll need to Get-Process node and
  # filter by command line — see infra/DEV_STACK.md.
  pkill -f "next dev -p $WEB_PORT" 2>/dev/null || true
  pkill -f "apps/workers/src/index" 2>/dev/null || true
  pkill -f "apps/api/src/index" 2>/dev/null || true
  pkill -f "engine.exe" 2>/dev/null || true
  pkill -f "apps/engine.*go run" 2>/dev/null || true

  echo "==> Stopping containers"
  docker stop forgemsg-pg forgemsg-redis > /dev/null 2>&1 || true

  echo "Done."
}

status() {
  echo "Containers:"
  docker ps --filter "name=forgemsg-" --format "  {{.Names}}  {{.Status}}"
  echo
  echo "Ports:"
  for label_port in "pg:$PG_PORT" "redis:$REDIS_PORT" "api:$API_PORT" "web:$WEB_PORT" "mta:$MTA_PORT"; do
    label="${label_port%%:*}"
    port="${label_port##*:}"
    if (echo > /dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
      echo "  $label  $port  LISTENING"
    else
      echo "  $label  $port  -"
    fi
  done
  echo
  echo "API health:"
  curl -sf "$API_INTERNAL/api/v1/health" 2>/dev/null || echo "  not responding"
}

case "${1:-}" in
  up)     up ;;
  down)   down ;;
  status) status ;;
  *) echo "Usage: $0 {up|down|status}"; exit 1 ;;
esac
