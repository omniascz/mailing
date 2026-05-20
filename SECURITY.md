# Security review — Mailforge

Pre-launch security checklist. Status snapshot as of the last review;
re-run before each major deploy and after any auth-surface change.

For incident response see [`OPERATIONS.md`](OPERATIONS.md) §3 + §8.

---

## TL;DR — current posture

| Area                  | Status                                        | Notes                             |
| --------------------- | --------------------------------------------- | --------------------------------- |
| Cookies               | ✅ httpOnly + sameSite=lax + secure (in prod) | `apps/api/src/routes/v1/auth.ts`  |
| CORS                  | ✅ allow-list via `CORS_ORIGIN` env           | denies `*`                        |
| Rate limits           | ✅ global 100/min + per-route on auth         | brute-force tiers                 |
| Password hashing      | ✅ bcrypt via `bcryptjs`                      | salt + adaptive cost              |
| Password policy       | ⚠️ min 8 chars only                           | no complexity / breach check      |
| Session storage       | ✅ Redis + JWT signed                         | 7-day TTL, revoke on logout       |
| CSRF                  | ✅ sameSite=lax + custom origin check on POST | acceptable for current scope      |
| Secrets in repo       | ✅ env files gitignored                       | `.env.example` is the inventory   |
| Dependency audit      | ✅ 0 critical, 1 known-acceptable high        | see `Sprint N` in memory          |
| Error visibility      | ✅ Sentry on api + workers + web              | gated on DSN                      |
| Encryption at rest    | ⚠️ DB-level only                              | HIPAA mode encrypts custom fields |
| Encryption in transit | ✅ HTTPS enforced (Vercel + Cloudflare)       | once deployed                     |
| Audit log             | ✅ tamper-evident chain                       | viewable at `/settings/audit-log` |

---

## 1. Authentication

### Session cookie

```ts
// apps/api/src/routes/v1/auth.ts
{
  httpOnly: true,
  secure: COOKIE_SECURE,        // = process.env.NODE_ENV === 'production'
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,    // 7 days
}
```

- [x] HttpOnly — JS can't read it (XSS protection)
- [x] Secure — only sent over HTTPS (prod)
- [x] SameSite=lax — survives top-level navigations, blocks cross-site
      POST. Tight enough; `strict` would break OAuth callbacks.
- [x] 7-day TTL — server-side Redis row expires; cookie maxAge matches
- [x] Path=/ — no inadvertent scoping

### JWT contents

`apps/api/src/services/auth/sessions.ts` signs `{ userId, orgId, email,
role, jti }` with `JWT_SECRET`. The `jti` is the Redis session key; we
verify Redis on every request, so revocation is immediate (delete the
session row).

- [x] JWT_SECRET enforced ≥16 chars in `lib/env.ts` (production must be
      a real 64-byte random — see DEPLOY.md §4)
- [x] Session deletable from Redis → forces re-login
- [x] No PII beyond `email` in the JWT; safe to log full token in
      structured logs

### Rate limits

`apps/api/src/plugins/rate-limit.ts` sets the global cap at 100/min/IP.
Per-route overrides on the auth surface (`apps/api/src/routes/v1/auth.ts`):

| Endpoint                           | Cap              |
| ---------------------------------- | ---------------- |
| `POST /auth/register`              | 5 / hour / IP    |
| `POST /auth/login`                 | 10 / 15 min / IP |
| `POST /auth/verify-email/:token`   | 20 / hour / IP   |
| `POST /auth/resend-verification`   | 3 / hour / IP    |
| `POST /auth/forgot-password`       | 3 / hour / IP    |
| `POST /auth/reset-password/:token` | 5 / 15 min / IP  |

The keyGenerator falls back to `x-api-key` for SDK callers; bare IP
for browser auth. Behind a CDN make sure `X-Forwarded-For` is trusted
(`trustProxy: true` on the Fastify app — verify in `apps/api/src/index.ts`).

### Password policy

Currently: `z.string().min(8).max(128)`.

- [ ] **TODO before launch**: add common-password blacklist (top 10 k
      breached passwords). Library: `zxcvbn-ts` or `@zxcvbn-ts/core`.
- [ ] Consider: HIBP API check for breach status (privacy-safe k-anonymity).
- [ ] OAuth users (Google) don't have a password; safe.

### MFA

- [ ] Not implemented in MVP. `apps/api/src/db/schema/two-factor.ts`
      schema exists; routes not wired. Ship before Enterprise plan goes
      live (Enterprise customers require it contractually).

### Forgot-password flow

- [x] Token: 32-byte hex random (`crypto.randomBytes(32).toString('hex')`)
- [x] TTL: 30 minutes
- [x] Cleared on use (`passwordResetToken = null`)
- [x] Always returns 200 regardless of email existence (anti-enumeration)
- [x] Rate limit: 3/hour/IP

---

## 2. Authorization

### Org-scoped queries

Every row in `apps/api/src/db/schema/*.ts` has `org_id` with a foreign
key + index. Every query in routes/services scopes by `req.user!.orgId`.

- [x] Schema enforces FK on org_id
- [x] No raw SQL with user-supplied table/column names
- [ ] **TODO before HIPAA customers**: row-level security in Postgres
      as defense in depth (currently relies on application-layer scoping
      only)

### Role checks

`apps/api/src/plugins/auth.ts` exposes:

- `app.requireAuth` — any signed-in user
- `app.requireRole('owner', 'admin')` — RBAC gate

Privileged endpoints (`/settings/team`, `/billing`, org PATCH) verify
via `preHandler: [app.authenticate, app.requireRole('owner', 'admin')]`.

- [x] No endpoint bypasses requireAuth except `/health`, `/health/ready`,
      public marketing/landing (web), auth/login + register + forgot +
      verify + reset
- [x] Owner-only actions explicitly gated

### Internal worker calls

`apps/api/src/routes/v1/internal/*` use `INTERNAL_API_SECRET` shared with
the workers. In dev unset == allow (so localhost works); in prod required.

- [x] Worker → API auth via header `x-internal-secret`
- [x] Production guard refuses calls without it
- [x] Secret rotation procedure in OPERATIONS.md §7

---

## 3. Input validation

Every route validates body / params / query with Zod before touching the
DB. No `as any` shortcuts in route handlers; types flow from Zod parse
results.

- [x] All route inputs validated via `.parse()`
- [x] Email format checked
- [x] UUIDs validated (z.string().uuid())
- [x] String lengths bounded (DB column max + 1 to detect overflow attempts)
- [x] File upload size capped via `@fastify/multipart` config
- [ ] **Open**: HTML/markdown user content (campaign HTML body) not
      sanitized — relies on email clients to render safely. Add DOMPurify
      if we ever render that HTML in the dashboard outside iframes.

---

## 4. CORS

```ts
// apps/api/src/plugins/cors.ts
{
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}
```

- [x] Allow-list, not `*`
- [x] Credentials allowed (cookies need it)
- [x] Single origin in prod (`APP_URL`); multi-tenant could grow this if
      we ship per-org subdomains

---

## 5. CSRF

We don't issue CSRF tokens. Defense relies on:

1. `sameSite=lax` cookies — browsers won't send the session on a
   cross-site POST initiated by another origin's form.
2. Custom origin check on state-changing endpoints — Fastify CORS
   middleware rejects non-allow-list origins before the route runs.
3. JSON-only body parsing — classic CSRF-via-form-post attacks fail
   because the content-type doesn't match.

This is "sufficient" by current OWASP guidance for SPA + cookie auth.
Add explicit CSRF tokens only if we relax sameSite or accept
form-encoded POST.

---

## 6. Data exposure

### Logs

`apps/api/src/plugins/auth.ts` redacts password fields before logging.
Pino redact paths (verify in production): `req.body.password`,
`req.body.confirmPassword`, `req.headers.authorization`, `*.passwordHash`.

- [x] No password values in logs
- [x] Session tokens never logged in full (only `jti` reference)
- [ ] **Verify**: Sentry `beforeSend` hook strips PII headers — add
      explicit filter for `cookie` + `authorization` in
      `apps/api/src/lib/telemetry.ts` before launch.

### Database

- [x] No plain-text passwords (bcrypt only)
- [x] OAuth tokens encrypted at rest? — **TODO**: currently stored
      plain in `users.googleId` etc.; add column-level encryption via
      HIPAA-mode infrastructure when needed
- [x] HIPAA mode encrypts custom_fields via `HIPAA_FIELD_KEY` (32-byte
      base64). Opt-in per org.

### Audit log

`audit_log` table records every privileged action with actor, target,
diff, IP. Tamper-evident via hash chain (each row references the prior
row's hash).

- [x] Hash chain verified on read
- [x] Immutable (no UPDATE allowed by app code; only INSERT)
- [x] Retention: 90 days standard, 7 years for HIPAA orgs (`hipaa_mode`)

---

## 7. Transport security

Once deployed:

- [x] Cloudflare + Vercel handle HTTPS termination — TLS 1.2+ enforced
- [x] HSTS via Cloudflare (max-age 1 year) — verify enabled per-domain
- [x] Cookies marked `secure` in prod (gated on NODE_ENV)
- [ ] **Verify before launch**: `Strict-Transport-Security` header on
      api.<domain> (Cloudflare automatically adds for app.<domain> via
      its proxy; api domain may not be proxied since we sometimes want
      direct access)

### Security headers

To add via Fastify hook before launch (currently relying on platform
defaults):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP frame-ancestors)
- `Content-Security-Policy` — minimum: default-src 'self' + report-uri
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Pre-launch: register `@fastify/helmet` plugin with the policy above.

---

## 8. Dependencies

Last `pnpm audit --prod` (per Sprint N + N.2 in memory):

- 0 critical
- 1 high — `lodash` via `zapier-platform-core`; contested advisory, no
  patched version exists (the "fix" is at >=4.18.0 which doesn't ship).
  Not exploitable: `zapier-app` doesn't invoke `_.template` on untrusted
  input.
- 6 moderate — all transitive in non-user-input paths (postcss via Next
  internals, uuid v3/v5/v6 via bullmq using v4, ip-address via
  puppeteer optional dep, brace-expansion, 3× lodash same as above)

Re-run `pnpm audit --prod` before every production push. CI does not
fail on audit — automate before our first paying customer.

- [ ] **TODO**: add `pnpm audit --prod --audit-level high` to CI as a
      non-blocking check (warning, not failure) so new highs surface
      immediately

---

## 9. Pre-launch open items

Roll these up into the launch checklist:

1. [x] Add `zxcvbn-ts` password strength check to register + reset
       (`apps/api/src/services/auth/password-strength.ts`, MIN_SCORE=3)
2. [x] Wire `@fastify/helmet` security headers plugin
       (`apps/api/src/plugins/helmet.ts`)
3. [x] Sentry `beforeSend` redact cookie + authorization headers
       (`apps/api/src/lib/telemetry.ts` scrubs request.headers +
       request.data; workers scrubs job context)
4. [ ] Enable Postgres row-level security on `org_id` (HIPAA gate)
5. [x] Verify `trustProxy: true` on Fastify before going behind CDN
       (`apps/api/src/index.ts` — gated on `NODE_ENV === 'production'`)
6. [x] Add `pnpm audit --audit-level high` as non-blocking CI step
       (`.github/workflows/ci.yml` `audit` job, `continue-on-error: true`)
7. [ ] DMARC `p=quarantine` for the apex domain before first marketing
       send (DEPLOY.md §3 already documents this — make sure it lands
       on day 1, not day 7)
8. [ ] Pen test scope decision: external scan only (Detectify, etc.) vs
       full pen test (Cure53, etc.) — recommend external scan pre-launch,
       full pen test after 50 paying customers

## 10. Incident reporting

If you find or are notified of a vulnerability:

1. Triage severity using OWASP risk-rating quick guide
2. If exploitable in production: rotate any compromised secrets first
   (OPERATIONS.md §7), then patch
3. Notify affected orgs within 72 hours of confirmed PII access (GDPR)
4. Post-mortem within 7 days of resolution. Document in
   `incidents/<date>-<short-id>.md` (directory doesn't exist yet — create
   on first incident)
5. If externally reported: respond within 48 hours acknowledging,
   credit researcher in the eventual fix CHANGELOG entry if they want
