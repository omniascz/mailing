# Operations runbook — Mailforge

Day-2 operations for the running stack. If you're standing up the deploy
for the first time, see [`DEPLOY.md`](DEPLOY.md) instead.

This document assumes Coolify on a Hetzner Cloud server for the app
services (api, workers, voice-bot, sms-gateway), a Hetzner Dedicated
server for the Go MTA + Postgres primary, and Vercel for the web
frontend. Adjust paths if your topology differs.

---

## Quick reference

| Task                              | Where                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| Read API logs                     | Coolify → `forgemsg-api` → Logs                                 |
| Read worker logs                  | Coolify → `forgemsg-workers` → Logs                             |
| Read MTA logs (SSH)               | `journalctl -u forgemsg-engine -f` on `forgemsg-mta01`          |
| Restart a service                 | Coolify → app → Restart                                         |
| Open psql to prod DB              | `ssh -L 5432:127.0.0.1:5432 root@<db-host>` then `psql` locally |
| Trigger known error (Sentry test) | `curl https://api.<domain>/api/v1/contacts/not-a-uuid`          |
| Drain a BullMQ queue              | See [§4 Queue management](#4-queue-management)                  |
| Roll back a deploy                | Coolify → app → Deployments → "Restore"                         |
| Backup the DB                     | See [§5 Backups](#5-backups)                                    |
| Audit who did what                | Dashboard → Settings → Audit log                                |
| **List all orgs**                 | `https://app.<domain>/superadmin/orgs` (login as system_admin)  |
| **Suspend/resume an org**         | `/superadmin/orgs/<id>` → Suspend button                        |
| **Change an org's plan**          | `/superadmin/orgs/<id>` → plan dropdown + Apply                 |
| **Inspect queue depth**           | `/superadmin/queues`                                            |
| **Read failed jobs**              | `/superadmin/queues/<name>`                                     |
| **See abuse events**              | `/superadmin/abuse`                                             |
| **Platform-wide stats**           | `/superadmin` (overview)                                        |

---

## 0. Operator account

You access platform-admin tooling via a regular login session where the
user row has `role = 'system_admin'`. The seed script creates one for
local dev (`admin@mailforge.test` / `SysAdmin1234!`). In production:

1. Register normally through the public signup flow (creates a user with
   role=owner).
2. Promote via psql:
   ```sql
   update users set role = 'system_admin' where email = 'you@yourdomain.cz';
   ```
3. Sign out + back in to refresh the JWT.

The `system_admin` role is NEVER assigned via UI. The promotion command
above is the only path — keeps the platform tooling unreachable from
self-service flows.

---

## 1. Reading logs

### Application (api + workers)

Coolify streams stdout/stderr from the container; that's the canonical
log surface in production. Filters supported: log level (info/warn/error),
substring search, time range.

For ad-hoc queries across services:

```bash
ssh root@<cloud-host>
docker logs forgemsg-prod-api --tail 200 -f
docker logs forgemsg-prod-workers --tail 200 -f
```

### MTA (Go engine)

Engine logs go through systemd; the journal has structured fields:

```bash
ssh root@forgemsg-mta01
journalctl -u forgemsg-engine -f                       # follow
journalctl -u forgemsg-engine --since "1 hour ago"     # window
journalctl -u forgemsg-engine | grep '"level":"error"' # error grep
```

For per-message tracing the API exposes `/api/v1/email-events?messageId=...`
which is cheaper than grepping the engine log.

### Postgres slow queries

```bash
ssh root@forgemsg-mta01
sudo -u postgres psql forgemsg <<'SQL'
  select substring(query, 1, 120) as query, calls, mean_exec_time, total_exec_time
  from pg_stat_statements
  order by total_exec_time desc
  limit 20;
SQL
```

Requires `pg_stat_statements` enabled in `postgresql.conf`; turn it on
during the first DB setup.

---

## 2. Restart procedures

Order matters when the stack is degraded. Restart bottom-up:

1. **Postgres** — only if there's a real issue. `pg_ctl restart` on the
   MTA box. Wait for `accepting connections` in the log before moving on.
2. **Redis** — `docker restart forgemsg-prod-redis`. Sessions + queue
   state survive (appendonly is on), but in-flight BullMQ jobs without
   `removeOnComplete` may double-fire after restart.
3. **MTA engine** — `systemctl restart forgemsg-engine`. Workers'
   `mta-grpc-client.ts` auto-reconnects on the next job; no need to
   restart workers just because the engine cycled.
4. **API** — Coolify Restart. Live HTTP connections drop; expect ~5 s of
   503s while the new instance binds.
5. **Workers** — Coolify Restart. BullMQ marks the worker offline; jobs
   in flight finish (or fail) on the previous instance, new jobs pick
   up on the new one.
6. **Web (Vercel)** — typically no manual restart needed. Vercel functions
   are stateless. If you need to force a redeploy, `vercel redeploy` from
   the project root.

---

## 3. Common incidents

### Login starts returning 5xx

1. Check `/health/ready` — if `database.status: "fail"` the API can't
   reach Postgres. Verify Coolify → forgemsg-api → Env has
   `DATABASE_URL` pointing at the right host.
2. From the cloud server: `psql "$DATABASE_URL"` — does it connect?
   - No: firewall / network issue between cloud + MTA box.
   - Yes: connection pool exhaustion. `select count(*) from
pg_stat_activity;` — if > ~80 % of `max_connections`, bounce the
     API to reset the pool.
3. Bump `LOG_LEVEL=debug` temporarily in Coolify; tail the logs while
   you reproduce.

### Send queue is backing up

Symptom: dashboard shows campaigns "sending" but no events arriving.

```bash
docker exec -it forgemsg-prod-redis redis-cli
> LLEN bull:campaign-splitter:waiting
> LLEN bull:batch-sender:waiting
> LLEN bull:mta-other:waiting
```

If `waiting` is climbing:

- Workers aren't running, or they're processing slower than enqueue rate
- Check Coolify forgemsg-workers logs for repeated job failures
- If MTA gRPC is unreachable, every mta-\* job will retry and slow down —
  fix that first (Sentry should already have alerted)

### Single tenant is hammering the API

```bash
# Top 10 orgs by request count in last hour, from API logs in Coolify
# (or run remotely via Grafana once that's wired up)
```

If a single org is causing trouble:

1. Lower their rate limit in the dashboard → Settings → Plan.
2. If aggressive: temporarily revoke their session via
   `delete from sessions where org_id = '<uuid>';` — they'll be logged
   out and need to reauth.
3. Escalate via email — don't ban silently, that loses customers.

### Outbound deliverability dropping

1. Check Postmaster Tools (Gmail) — IP reputation should be green.
2. Look at `/insights` in the dashboard: spike in bounces or complaints?
3. SNDS (Microsoft) — search by IP. A red rating here usually correlates
   with elevated MS bounces in the dashboard.
4. If a single sending domain is the source: pause its campaigns
   immediately via dashboard → Campaigns → Pause. Investigate before
   resuming.
5. Worst case: full pause + `docker stop forgemsg-prod-workers` to stop
   the send pipeline at the source.

---

## 4. Queue management

Queues are BullMQ on Redis. The full list lives in
`apps/workers/src/queues/index.ts` as `QUEUE_NAMES`.

### Inspect queue depth

```bash
docker exec -it forgemsg-prod-redis redis-cli
> KEYS bull:*:waiting          # show all queues
> LLEN bull:<queue>:waiting     # waiting jobs (haven't started)
> LLEN bull:<queue>:active      # in flight right now
> LLEN bull:<queue>:failed      # gave up after retries
```

### Drain a queue (last-resort, destructive)

If you need to abandon a stuck flood (e.g. a runaway broadcast):

```bash
# Lists are namespaced — confirm before nuking
docker exec -it forgemsg-prod-redis redis-cli DEL bull:batch-sender:waiting
docker exec -it forgemsg-prod-redis redis-cli DEL bull:batch-sender:active
```

The destination contacts will **not** receive those jobs. Use this only
when the alternative is worse (e.g. you're about to send a typo'd
campaign to 50 k people). For routine pause, use the dashboard Pause
button which sets `campaigns.status = 'paused'`.

### Replay failed jobs

```bash
docker exec -it forgemsg-prod-redis redis-cli
> LRANGE bull:<queue>:failed 0 5     # peek at first 5 failed jobs
```

For surgical retries, BullMQ has `Queue.retryJobs()` in JS. Easiest path
is to write a one-off `tsx` script next to `apps/api/scripts/seed.ts`
and run it from the cloud server.

---

## 5. Backups

### Schedule (cron on the cloud server)

```cron
# /etc/cron.d/forgemsg-backups — installed manually post-deploy.
# Runs at 02:30 UTC, well after EU campaign send peaks.
30 2 * * * root /usr/local/bin/forgemsg-backup.sh
```

### Backup script

Save as `/usr/local/bin/forgemsg-backup.sh`, `chmod +x`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ts=$(date -u +%Y%m%d-%H%M%S)
out=/var/backups/forgemsg/forgemsg-${ts}.sql.gz

mkdir -p "$(dirname "$out")"
pg_dumpall -h <db-host> -U forgemsg | gzip -9 > "$out"

# Push to R2. r2cli is `wrangler` or the rclone backend — pick one.
rclone copy "$out" r2:forgemsg-backups/

# 30-day retention on the R2 bucket is set via lifecycle policy in
# the Cloudflare dashboard, not here.
find /var/backups/forgemsg -name '*.sql.gz' -mtime +7 -delete
```

### Restore drill (do this monthly)

```bash
# 1. Pick the most recent dump
ls -t /var/backups/forgemsg/*.sql.gz | head -1

# 2. Restore into a throwaway DB
createdb forgemsg_restore_test
gunzip -c <dump-file> | psql forgemsg_restore_test

# 3. Sanity: row counts on the big tables should match prod ±10%
psql forgemsg_restore_test <<'SQL'
  select
    (select count(*) from contacts) as contacts,
    (select count(*) from campaigns) as campaigns,
    (select count(*) from email_events where created_at > now() - interval '7 days') as events_7d;
SQL

# 4. Drop the test DB
dropdb forgemsg_restore_test
```

If the row counts look wrong, **don't trust the backup**. Investigate
before assuming the dump is good — silent corruption in a backup chain
is the worst kind.

---

## 6. Database operations

### Connect from your laptop

```bash
# 1) Forward Postgres over SSH (don't open 5432 to the internet)
ssh -L 5432:127.0.0.1:5432 root@forgemsg-mta01
# 2) From another shell
psql postgresql://forgemsg:<pw>@127.0.0.1:5432/forgemsg
```

### Apply a new migration

Migrations live in `apps/api/drizzle/` and are append-only. From the
cloud server (so it talks to prod DB over the private network):

```bash
cd /opt/forgemsg
DATABASE_URL=$DATABASE_URL pnpm --filter @forgemsg/api db:migrate
```

The CI `db-migrations.yml` workflow verifies on every PR that the schema
matches the committed SQL, so anything that gets merged is safe to apply.
Don't `db:push` in prod — that bypasses the migration history.

### Check long-running queries

```sql
select pid, age(clock_timestamp(), query_start), state, substring(query, 1, 200)
from pg_stat_activity
where state != 'idle' and query not ilike '%pg_stat_activity%'
order by age(clock_timestamp(), query_start) desc
limit 20;
```

### Kill a runaway query

```sql
-- Only if you've identified the PID above and have written authorization
-- (cancel attempts a clean cancel; terminate is the hammer)
select pg_cancel_backend(<pid>);
select pg_terminate_backend(<pid>);
```

---

## 7. Secrets rotation

### JWT_SECRET

Rotating invalidates every session — every user has to log in again.

1. Generate new value: `openssl rand -base64 64`
2. Update Doppler `forgemsg-production` → `JWT_SECRET`
3. Redeploy API (Coolify forgemsg-api → Redeploy)
4. Communicate the forced re-login if it's coordinated; otherwise users
   get a 401 next request and the UI sends them to /login

### Postgres password

1. New password on the DB:
   ```sql
   alter user forgemsg with password '<new>';
   ```
2. Update Doppler `DATABASE_URL` for **both** api and workers
3. Redeploy both. Order doesn't matter; the old password is no longer
   valid so anything still using it just fails.

### Sentry DSN compromise

DSNs are write-only — leaking one lets an attacker spam your error
ingest, not read errors. Still:

1. Rotate the DSN in Sentry → Project Settings → Client Keys
2. Update Doppler `SENTRY_DSN`
3. Redeploy api + workers

---

## 8. Sentry triage

Issues land in two projects: `forgemsg-api` and `forgemsg-workers`.

### Triage priority

- **P0 (page immediately)**: events with tag `route` matching critical
  endpoints (`POST /api/v1/auth/login`, `POST /api/v1/campaigns/:id/send`,
  `POST /api/v1/contacts/batch`) — these break user trust on first hit.
- **P1**: anything with > 10 occurrences in the past hour from > 1 org.
- **P2**: everything else.

### Investigating

1. Open the Sentry issue. Check the tags: `org_id`, `request_id`, `route`.
2. Pull the request from API logs by `request_id` — see what the user
   was doing leading up to the error.
3. Reproduce locally if possible: clone the request body from Sentry's
   breadcrumbs, run against your dev stack.
4. Fix → write a test → ship via normal PR flow.

If a single org is the only source of an error, double-check it isn't
malicious input you should be defending against (SQLi attempt, prototype
pollution, etc.) before "fixing" the symptom.

---

## 9. Vercel-specific

### Production redeploy without code change

Push an empty commit, or use `vercel redeploy <deployment-id>` from the
CLI. The standalone Next output means there's no warm-up advantage to
keeping the previous instance; new deploys swap in atomically.

### Rollback

```bash
vercel deployments ls           # find a known-good deployment
vercel rollback <deployment>
```

Production aliases swap atomically. Your DB schema and API endpoints
have to remain compatible with the rolled-back web bundle — Drizzle
migrations are forward-only, so an aggressive schema change should
ship in two phases (add column → use column → drop unused).

---

## 10. Capacity planning hints

Per CCX23 (4 vCPU / 16 GB):

- **API**: handles ~500 RPS sustained on a single instance for our
  workload. The Fastify rate-limit plugin caps per-IP at 100/min default.
- **Workers**: each batch-sender thread does ~50 sends/sec to the MTA
  with default concurrency=10. Total throughput at 500 sends/sec.
- **Postgres on AX52**: ~2 k QPS read, ~500 QPS write before
  pg_stat_statements should start tipping you off about hot queries.

When any of those tips: vertical first (next size up), horizontal only
after Postgres can keep up with multiple API replicas (read replicas in
phase 5+).
