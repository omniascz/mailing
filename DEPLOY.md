# Deployment runbook — Mailforge

Step-by-step for the first production deploy on Hetzner + Vercel. Designed
to be executed top-to-bottom by a single operator. Each step says **what
to do**, **why**, and **how to verify**.

For deeper background see:

- `infra/PIVOT_AWS_TO_HETZNER.md` — strategy rationale
- `infra/HOSTING_DETAIL.md` — server sizing and IP planning
- `infra/DELIVERABILITY.md` — IP warming + FBL setup

---

## 0. Prerequisites — local

Before touching the cloud:

- [ ] `pnpm install` succeeds at repo root
- [ ] `pnpm typecheck` is clean
- [ ] `pnpm test` is green (1317+ tests on the api package alone)
- [ ] `docker compose -f docker-compose.prod.yml config` exits 0 with a
      `.env` containing JWT_SECRET, POSTGRES_PASSWORD, API_PUBLIC_URL,
      APP_URL, CORS_ORIGIN

If any of those fail, stop. Don't deploy red code.

---

## 1. Buy infrastructure

### 1.1 Domain

- [ ] Register your apex domain at a registrar that supports glue records
      for nameservers (Cloudflare Registrar is the simplest path since
      DNS lives there anyway).
- [ ] Decide on:
  - `app.<domain>` → web (Vercel)
  - `api.<domain>` → API (Hetzner)
  - `mail.<domain>` → MTA (Hetzner Dedicated)
  - `t.<domain>` → tracking pixel (Cloudflare Workers later, API for MVP)

### 1.2 Hetzner servers

Per `infra/HOSTING_DETAIL.md` recommendations for MVP:

- [ ] **1× Hetzner Cloud CCX23** (`forgemsg-app01`) — €23.99/mo
      Runs: api, workers, voice-bot, sms-gateway (via Coolify).
- [ ] **1× Hetzner Dedicated EX44 or AX52** (`forgemsg-mta01`) — €39–69/mo
      Runs: Go MTA engine + Postgres primary (or split if scale demands).
      Request a `/29` IPv4 subnet at provisioning (€5–8 setup fee).
- [ ] **Open Hetzner support ticket**: request SMTP port 25 unblock for
      both servers. Reference your dedicated `/29`. Approval takes 24–72h —
      do this **first day**, not the day before launch.

### 1.3 Third-party services

- [ ] Cloudflare account (DNS + R2 object storage + Workers later)
- [ ] Doppler account (secrets management)
- [ ] Sentry account (error tracking)
- [ ] Grafana Cloud + Better Stack free tiers (observability)
- [ ] Vercel account (web frontend)

---

## 2. Bootstrap servers (Hetzner)

### 2.1 Cloud server

- [ ] Provision Ubuntu 24.04 LTS
- [ ] Add your SSH public key during creation
- [ ] Lock down: `ufw allow 22, 80, 443` + `ufw deny incoming` for the rest
- [ ] Install [Coolify](https://coolify.io/) via their bootstrap script:

  ```bash
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  ```

- [ ] Open Coolify on `:8000`, set admin email + a 32-char password
- [ ] Connect Coolify to your GitHub repo (deploy keys auto-generated)

### 2.2 Dedicated server

- [ ] Boot from rescue, install Ubuntu 24.04 LTS via Hetzner installimage
- [ ] Assign all 6 usable IPs from your /29 to the primary interface
- [ ] **rDNS**: set each IP's PTR record to `mailNN.<domain>` (Hetzner
      Robot UI → IPs → rDNS). PTR mismatch tanks deliverability.
- [ ] Install MTA components: Postgres 16 + the Go engine binary
      (build via `docker compose -f docker-compose.prod.yml build engine`
      and copy the resulting binary, or run the image directly).

---

## 3. DNS — Cloudflare

Apex zone configured before the first deploy:

- [ ] `app.<domain>` CNAME → `cname.vercel-dns.com.` (proxy: OFF)
- [ ] `api.<domain>` A → Cloud server IP (proxy: ON)
- [ ] `mail.<domain>` A → Dedicated server primary IP (proxy: OFF — SMTP
      can't traverse Cloudflare proxy)
- [ ] `t.<domain>` — A to API server initially; switch to Workers later.
- [ ] **DMARC report authorisation** (`TXT *._report._dmarc.<domain>`):
      `v=DMARC1`

      Without this record **no customer's DMARC reports ever arrive.** Every
      sending domain we hand out points `rua=` at `dmarc-reports@<domain>`,
      which is an external destination for the customer's own domain. RFC 7489
      §7.1 says the report generator must first find a TXT record at
      `<policy-domain>._report._dmarc.<destination>` — or the wildcard above,
      which authorises any domain — and where it does not, it MUST NOT send the
      report. The failure is silent on every side: the mailbox stays empty, the
      IMAP poller ingests nothing, and the DMARC dashboard shows a clean zero.

      One wildcard record covers every customer; it is never per-domain. The
      daily DNS-health sweep checks it and reports a status-page incident when
      it is missing (`services/deliverability/dns-health.ts`).

Per-sending-domain (do this when adding the first verified domain in the
dashboard — the UI prints the exact records):

- [ ] SPF (`TXT <sending-domain>`): `v=spf1 include:spf.<domain> ~all`
- [ ] DKIM (`TXT fm1._domainkey.<sending-domain>`): from `/api/v1/domains/:id/dns-records`
- [ ] DMARC (`TXT _dmarc.<sending-domain>`):
      `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@<domain>; ruf=mailto:dmarc-reports@<domain>; fo=1`
- [ ] Return-Path (`CNAME mail.<sending-domain>`) → `return-path.<domain>`
- [ ] Bounce MX (`MX mail.<sending-domain>`) → `bounce.<domain>` — receives
      bounces, FBL reports and out-of-office replies

The five above are what `buildDnsRecords()` emits
(`apps/api/src/services/domains/dns-records.ts`); the dashboard prints the same
list with the real values filled in. The Return-Path and MX hostnames are the
domain's mail subdomain, which defaults to `mail.<sending-domain>` and is
whatever was passed as `mailSubdomain` when the domain was added.

---

## 4. Secrets — Doppler

Create projects `forgemsg-staging` and `forgemsg-production`. Required
values (cross-reference `apps/api/.env.example` for the full inventory):

- [ ] `DATABASE_URL` — `postgresql://forgemsg:<pw>@<host>:5432/forgemsg`
- [ ] `REDIS_URL` — `redis://<host>:6379`
- [ ] `JWT_SECRET` — `openssl rand -base64 64`
- [ ] `API_PUBLIC_URL` — `https://api.<domain>`
- [ ] `APP_URL` — `https://app.<domain>`
- [ ] `CORS_ORIGIN` — `https://app.<domain>`
- [ ] `INTERNAL_API_SECRET` — random 32+ chars; workers ↔ API auth
- [ ] `ANTHROPIC_API_KEY` — for AI features
- [ ] `SYSTEM_EMAIL_FROM` — verified address (e.g. `no-reply@<domain>`); sender
      for every system email. Required: the API exits at boot without it.
- [ ] `SYSTEM_EMAIL_FROM_NAME` — display name shown to recipients
- [ ] `REPORTS_FROM_EMAIL` — optional; scheduled-report sender. Must be on the
      same domain as `SYSTEM_EMAIL_FROM` or the API refuses to boot.
- [ ] `OPERATOR_EMAIL` — your address for new-signup + abuse alerts (Sprint T.4)
- [ ] Stripe — create Products in Stripe Dashboard first, then set:
  - [ ] `STRIPE_SECRET_KEY` (`sk_live_...`)
  - [ ] `STRIPE_WEBHOOK_SECRET` (`whsec_...` — generated when you add the
        webhook endpoint in Stripe Dashboard pointing at
        `https://api.<domain>/api/v1/billing/webhook`)
  - [ ] `STRIPE_PRICE_STARTER` — Price ID for the Starter plan
  - [ ] `STRIPE_PRICE_PRO` — Price ID for the Pro plan
  - [ ] `STRIPE_PRICE_BUSINESS` — Price ID for the Business plan
  - [ ] `STRIPE_PRICE_ENTERPRISE` — Price ID for the Enterprise plan
        (`services/billing/index.ts` reads all four; a tier with no price ID
        answers `No Stripe price ID configured for tier`)
- [ ] `SENTRY_DSN` (api), `NEXT_PUBLIC_SENTRY_DSN` (web) — error tracking
      (Sprint J + O)

**The API refuses to boot in production without these**, and the list above
does not cover them. `config/env.ts` marks them `prodRequired`, which is a hard
failure at startup, not a warning — set every one of them before the first
deploy:

- [ ] `SESSION_SECRET`, `TRACKING_SECRET`, `ASSET_SIGNING_SECRET`,
      `PREFERENCE_CENTRE_SECRET`, `FORM_AUTOFILL_SECRET` — signing keys for
      sessions, tracking links, signed asset URLs, the preference centre and
      form autofill. Generate each separately: `openssl rand -base64 48`
- [ ] `DKIM_MASTER_KEY` — encrypts customers' DKIM private keys at rest.
      Losing it means every sending domain has to be re-keyed
- [ ] `PLATFORM_DOMAIN` — the bare apex domain, no scheme and no path. Every
      DNS record handed to a customer is built from it
- [ ] `INBOUND_EMAIL_SECRET`, `FBL_WEBHOOK_SECRET`, `DMARC_INBOUND_SECRET` —
      shared secrets on the inbound mail, feedback-loop and DMARC endpoints
- [ ] `META_WEBHOOK_VERIFY_TOKEN`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN`,
      `WHATSAPP_VERIFY_TOKEN` — verification tokens the Meta platforms echo
      back when a webhook is registered
- [ ] `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`,
      `MINIO_VIDEO_BUCKET` — object storage. `lib/object-store.ts` reads the
      `MINIO_*` names and nothing else, so an S3-compatible store such as R2 is
      configured through them. See §4.1 — four more variables aim the client,
      and one of them stops the boot

After Stripe is configured, set up the webhook in Stripe Dashboard with
these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Wire Doppler into Coolify per-app via the Doppler CLI or the integration.

### 4.1 Object storage

There is **no storage service in `docker-compose.prod.yml`** — the services
there are postgres, redis, api, engine, workers and web. That is deliberate
rather than an omission: `.env.production.example` (§ Object storage) states the
expectation as "REQUIRED — Cloudflare R2 or AWS S3. MinIO only for self-hosted"
and gives a worked external example. Bring an S3-compatible store, or run one
yourself outside this compose file. Which provider is a decision, not a fact,
and this runbook does not make it for you.

The `MINIO_` prefix is only a name. `lib/object-store.ts` builds one
`@aws-sdk/client-s3` client out of these, so anything speaking S3 works:

- [ ] `MINIO_ENDPOINT` — the store's host, no scheme and no path. **The API
      refuses to start in production without it** (`apps/api/src/config/env.ts`,
      the `superRefine` on `MINIO_ENDPOINT`), because its development default is
      `localhost` — inside a container that is the API itself, so uploads would
      aim at this process and fail at first use instead of at boot.
- [ ] `MINIO_PORT` (default `9000`) and `MINIO_USE_SSL` (default `false`) — the
      endpoint is assembled as `<scheme>://<host>:<port>`
      (`apps/api/src/lib/object-store.ts:29-38`), so a hosted store needs `443`
      and `true` spelled out; the port is always appended.
- [ ] `AWS_REGION` (default `us-east-1`) — passed straight to the SDK.
- [ ] `MINIO_BUCKET` — media, campaign screenshots, the email-event archive,
      call recordings and voicemail all live in this one bucket.
- [ ] `MINIO_VIDEO_BUCKET` — video messages, separate bucket.

Two things the code fixes and configuration cannot change. The client always
uses **path-style** addressing (`forcePathStyle: true`,
`apps/api/src/lib/object-store.ts:63`), so the store has to accept
`host/bucket/key` rather than `bucket.host/key`. And nothing **deletes** from
the store: the module offers put, get, presign and list, and no delete
(`apps/api/src/lib/object-store.ts:78-128`). Whatever goes in stays, including
the nightly event archive (`apps/api/src/services/archive/email-events.ts` —
events older than `ARCHIVE_CUTOFF_DAYS`, default 30, written at 03:20 UTC).
Capacity and any lifecycle rules are the provider's side of the line.

Verify after the API is deployed: upload an image in the dashboard's media
library and confirm it renders. Media and digital assets are registered with a
plain `app.register` (`apps/api/src/index.ts`), not behind a feature flag, so
they exist in every deployment — an image in a template is served from this
store to every recipient's mail client.

That last part decides one more thing for you: the media URL handed to the
template is a plain, unsigned `<scheme>://<host>:<port>/<bucket>/<key>`
(`apps/api/src/services/media/storage.ts:136`). Recipients fetch it with no
credentials, so `MINIO_BUCKET` has to be readable anonymously over the public
internet, and the endpoint has to be reachable from outside — not only from
inside the compose network. Digital assets and video are different: those are
handed out as presigned URLs with an expiry
(`services/digital-assets/index.ts`, `services/video/recorder.ts`).

Not object storage, but the same shape of growth: **contact import files are
written to the local filesystem**, `IMPORT_UPLOAD_DIR` or
`os.tmpdir()/forgemsg-imports` (`apps/api/src/routes/v1/contact-imports.ts:22`),
and nothing removes them. That is server disk, not bucket.

---

## 5. Database — first migration

From your laptop (or the Cloud server):

```bash
DATABASE_URL=postgresql://forgemsg:<pw>@<host>:5432/forgemsg \
  pnpm --filter @forgemsg/api db:migrate
```

Verify:

```bash
psql "$DATABASE_URL" -c "select count(*) from information_schema.tables where table_schema='public';"
# expect a number > 80
```

Then seed a demo org so you can log in:

```bash
DATABASE_URL=... pnpm seed
# prints login credentials
```

---

## 6. Deploy — API + workers + MTA (Coolify)

For each app the workflow is:

1. In Coolify → `+ New Resource` → `Public Repository` → paste repo URL
2. Pick the Dockerfile path:
   - api: `apps/api/Dockerfile`
   - workers: `apps/workers/Dockerfile`
   - engine: `apps/engine/Dockerfile`
3. Set env from Doppler integration
4. Bind to the right domain (api → `api.<domain>`)
5. Deploy

Verify after each:

- [ ] API: `curl https://api.<domain>/health` returns `{"status":"ok"}` AND
      `curl https://api.<domain>/health/ready` returns HTTP 200 with
      `database.status: "ok"` + `cache.status: "ok"`
- [ ] Workers: Coolify logs show `All workers started. Waiting for jobs...`
- [ ] Engine: `nc -zv mail.<domain> 50051` (gRPC) — internal only, so
      run from the Cloud server with the dedicated server's private IP

---

## 7. Deploy — web (Vercel)

- [ ] `vercel link` from `apps/web` (or import from GitHub via Vercel UI)
- [ ] Build settings:
  - Framework: Next.js
  - Root directory: `apps/web`
  - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
  - Build Command: `cd ../.. && pnpm --filter @forgemsg/web... build`
- [ ] Environment variables:
  - `NEXT_PUBLIC_API_URL=https://api.<domain>`
  - `API_URL=https://api.<domain>` (server-side fetch)
- [ ] Add domain `app.<domain>` and let Vercel issue the cert
- [ ] Deploy

Verify:

- [ ] `https://app.<domain>/landing` renders (no session needed)
- [ ] `/login` accepts the seed credentials and redirects to `/`

---

## 8. Smoke test — golden path

With a logged-in browser session:

1. [ ] `/contacts` shows 6 seeded contacts
2. [ ] `/lists` shows 2 seeded lists
3. [ ] `/domains` — click **New domain**, enter your sending domain, copy
       DNS records to Cloudflare, hit **Re-check** until all green
4. [ ] `/domains/:id` — click **Send test**, check inbox for the email
5. [ ] `/campaigns` — open the seeded draft, hit **Send test** in the
       editor, then send a real one to a list of 1

If step 4 fails: the most common cause is SMTP port 25 still blocked.
Check `journalctl -u forgemsg-engine` on the MTA server for `connection
refused` on outbound port 25.

---

## 9. IP warming — first 30 days

Per `infra/DELIVERABILITY.md`. Don't skip this.

- [ ] Day 1–3: 50 emails/day, only to engaged contacts (last 90d openers)
- [ ] Day 4–7: 200/day, still engaged-only
- [ ] Day 8–14: 1000/day, broaden to last 180d
- [ ] Day 15–21: 5000/day
- [ ] Day 22–30: 20 000/day, full audience
- [ ] Day 31+: no cap
- [ ] Monitor Postmaster Tools (Gmail) + SNDS (Microsoft) daily

Those are the caps the platform actually enforces — `WARMUP_SCHEDULE` in
`apps/api/src/services/sending/ip-warmup.ts`. The limit is **per sending IP**,
not per domain, and the clock starts when an IP is allocated with warmup
enabled, not when a domain is added. Enforcement is real: the engine asks
`POST /api/v1/internal/sending/warmup/claim` before it dials and spends one unit
of the day's allowance, so a send over the cap is refused rather than merely
reported. Progress is visible at `/domains/:id` in the dashboard.

---

## 10. Observability hookup

### Sentry

API + workers are already instrumented (`apps/api/src/lib/telemetry.ts`,
`apps/workers/src/lib/telemetry.ts`). Both call `Sentry.init()` only when
`SENTRY_DSN` is set, so dev + tests stay silent.

- [ ] Create two projects in Sentry: `forgemsg-api` and `forgemsg-workers`
      (one DSN per service keeps dashboards clean).
- [ ] Add to Doppler / Coolify env for **both** services:
  ```
  SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
  SENTRY_ENVIRONMENT=production
  SENTRY_RELEASE=<git-sha>            # set from CD pipeline ideally
  SENTRY_TRACES_SAMPLE_RATE=0.05      # 5 % — bump during incidents
  ```
- [ ] Restart api + workers. Trigger a known 500 (e.g. visit a malformed
      `/api/v1/contacts/<not-uuid>` path) and confirm it lands in the
      Sentry issue stream.

### Grafana Cloud

- [ ] Install the agent on both Hetzner servers, scrape Postgres + Redis + the engine's `/metrics` (port 9090)

### Better Stack — uptime checks

- [ ] `https://app.<domain>/landing` (HTTP 200) — web liveness
- [ ] `https://api.<domain>/health/ready` (HTTP 200) — API + DB + Redis
      reachability; returns 503 if any dependency is down so the alert
      fires before traffic-affecting failures
- [ ] SMTP banner on `mail.<domain>:25` (port-open check)

---

## 11. Backup baseline

Before letting real traffic in:

- [ ] Postgres: `pg_dumpall -h <db-host>` runs nightly via cron on the
      Cloud server; output goes to Cloudflare R2 with 30-day retention
- [ ] Verify restore: monthly drill — restore the most-recent dump into
      a staging DB and run `pnpm typecheck` + a SELECT count on every
      table to confirm row counts are sane

---

## Rollback plan

If a deploy lights things on fire:

1. **Coolify**: each service has a one-click "Restore previous deployment"
   button. Use it; investigate after.
2. **DB migration broke prod**: Drizzle migrations are append-only by
   design — there's no automatic down. The fix is forward-only: write a
   new migration that undoes the damage and ship it.
3. **MTA reputation collapse**: stop sending immediately (`docker compose
stop workers` on the Cloud server). Investigate via Postmaster Tools.
   Resume from warmup day 1 if rejected by major ISPs.

---

## Day-2 operations

Documented separately in [`OPERATIONS.md`](OPERATIONS.md) — log reading,
restart order, incident playbooks (login 5xx, queue backup, tenant
abuse, deliverability dip), queue inspection, backup schedule + monthly
restore drill, DB ops, secret rotation, Sentry triage, Vercel rollback,
capacity hints.
