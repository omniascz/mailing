# Email Marketing Deep Dive — Mailforge vs 12 Competitors

> Generated: 2026-05-18
> Scope: Email layer only (excludes SMS, voice, WhatsApp, push, CRM, helpdesk)
> Source: `C:\Users\omnia\Documents\mailforge\` codebase + `data/01-60` competitor research
> Status: Pracovní podklad pro email layer P0 backlog

---

## Část 1: Mailforge email layer inventory

### 1.1 Schemas — capabilities z kódu

**`apps/api/src/db/schema/campaigns.ts`** (campaigns)
- Multi-channel campaign entity with email-specific cols: `subject`, `preheader`, `fromName`, `fromEmail`, `replyTo` (řádky 21-25)
- Audience pivot: `listId` + optional `segmentId` + `excludeSegmentId` (32-34)
- Estimated recipients cached (`estimatedRecipients`)
- A/B config as JSONB blob (`abConfig`, řádek 38) — flexibilní ale nestrukturované
- Scheduling: `scheduledAt` + `timezone` (full IANA string)
- Denormalized stats: `totalSent`, `totalDelivered`, `totalOpens`, `totalClicks`, `totalBounces`, `totalUnsubscribes`, `totalComplaints` (46-52)
- `locale` per-campaign (54) — multi-language ready
- Soft-delete pattern (`deletedAt`)

**`apps/api/src/db/schema/templates.ts`** (templates)
- Block-JSON storage (`blocks` JSONB), `globalStyles` JSONB, optional `renderedHtml` cache (22)
- Subject + preheader inheritance pro template-based campaigns
- `locale` + `translationGroupId` (28-29) — **first-class template-translation groups** (rare in competitors)
- `isPublic` (gallery / marketplace ready), `tags[]`, category enum

**`apps/api/src/db/schema/email-events.ts`** (events)
- Event types via `emailEventTypeEnum`: send, open, click, bounce, unsubscribe, complaint (+ delivered, deferred)
- Per-event: `messageId`, `linkUrl`, `userAgent`, `ipAddress`, `deviceType`, `emailClient`
- **Bot detection columns**: `isBot`, `botScore` (real 0-1), `botReason` (comma-separated rule IDs) — řádky 37-41. Apple MPP era ready.
- `stream` enum (broadcast | triggered | transactional) — same row schema, segregated metrics
- Designed for **dual storage**: PG (recent/UI) + ClickHouse via Kafka (řádek 9 komentář)

**`apps/api/src/db/schema/domains.ts`** (sendingDomains + warmupIps)
- Customer-owned domain + `mailSubdomain` (tracking/Return-Path)
- DKIM: `dkimSelector` (default `fm1`, rotatable to `fm2`), 2048-bit RSA private key (PEM), public key for DNS TXT
- Per-protocol verification flags: `dkimVerified`, `spfVerified`, `dmarcVerified`, `returnPathVerified` (45-54) + `verifiedAt` timestamps
- Domain-level warmup: `warmupStatus` (cold/warming/warm), start/complete timestamps
- Separate `warmupIps` table pro **per-IP** warmup

**`apps/api/src/db/schema/dmarc-reports.ts`**
- Full aggregate report parsing: `policy` JSONB (adkim/aspf/p/pct), `records` JSONB array s sourceIp/count/disposition/dkim/spf
- `totalMessages`, `passCount`, `failCount` denormalized
- Unique index na (orgId, reporterOrg, reportId) prevents duplicate ingest

**`apps/api/src/db/schema/isp-fbl.ts`** (FBL registrations)
- ISP enum: gmail, microsoft, yahoo, aol, comcast, other (5-12)
- Per-ISP `fblEmail` (ARF inbox) and/or `webhookUrl`
- ⚠️ **Žádné CZ ISPs v enumu** — Seznam/Volny/Centrum FBL registration tracking chybí; ale engine layer headery zvládne

**`apps/api/src/db/schema/dedicated-ips.ts`** (ipPools + dedicatedIps + ipWarmupSchedules)
- `ipPoolTypeEnum`: marketing, transactional, cold_outreach, warming, shared, dedicated (29-36)
- IP entity: PTR record, orgId, `poolId`, `status` enum (pending/provisioning/active/warming/warm/suspended/retired)
- Per-IP warmup day counter + lifetime `warmupSent`
- **Reputation tracking**: `reputationScore` (5,2 decimal), `blacklistCount`, rolling-24h `bounceRate` and `complaintRate` (124-133)
- `region` column (us-east default) → EU data-residency aware
- Configurable warmup schedule per pool

**`apps/api/src/db/schema/suppressions.ts`**
- Per-org unique na email AND phone; cross-channel
- `reason` enum (hard_bounce, complaint, manual, unsubscribe, …)

**`apps/api/src/db/schema/signup-forms.ts`**
- `embedTypeEnum`: inline, popup, slide, floating
- `FormField` interface (text/email/phone/select/checkbox/hidden) + `FormConfig` (doubleOptIn, tags, workflowId, redirectUrl)
- **First-class A/B variants** (signupFormVariants tabulka, řádky 85-112) s trafficSplit + view/submit counts
- **Migration jobs** sub-schema (migrationJobs tabulka) s Mailchimp-typed progress tracking (143-184) — onboarding-ready

**`apps/api/src/db/schema/multivariate-tests.ts`** (MVT)
- Status enum: draft → running → selecting_winner → winner_selected → completed (20-27)
- Winner metric enum: open_rate, click_rate, click_to_open_rate, conversion_rate, revenue_per_email (29-35) — revenue-aware
- Variant elements: subject, preheader, from_name, content, send_time (37-43)
- `testAudiencePercent` (default 30%), `testWindowHours` (default 4h), `confidenceThreshold` decimal
- Per-variant denormalized stats including `totalConversions` + `totalRevenue` (149-156) — ecommerce-ready
- `mvVariantAssignments` pro **deterministic per-contact** assignment

**`apps/api/src/db/schema/rss-campaigns.ts`**
- Feed URL + frequency (hourly/daily/weekly), `sendTime` "HH:MM", timezone
- `lastSeenGuids[]` JSONB pro dedup
- `nextRunAt` timestamp; worker polls due rows

**`apps/api/src/db/schema/abuse-detection.ts`** — **nejextenzivnější v competitor setu**
- 13 signal typů (řádky 21-35): high_bounce_rate, high_complaint_rate, spam_trap_hit, honeypot_hit, volume_spike, list_quality_low, new_account_high_volume, blacklist_hit, content_spam_score, suspicious_login, api_abuse, credential_stuffing, stale_list_send
- 5 severities × 7 actions (alert/throttle/pause/suspend/require_review)
- Rules s `windowMinutes`, `minSampleSize` (N-guard)
- `abuseEvents` (audit-log style) + `abuseSanctions` (active enforcement w/ expiresAt + throttle rate/hour)
- `spamTraps` (SHA-256 hash-based, type: pristine/recycled/typo/honeypot) + `spamTrapHits`

**`apps/api/src/db/schema/frequency-rules.ts`**
- Per-org channel cap: `maxCount` per `periodHours`, channel enum incl `all`

**`apps/api/src/db/schema/quiet-hours.ts`**
- Org-wide quiet window `startHour`/`endHour` + IANA timezone, per-channel or `all`

**`apps/api/src/db/schema/smart-sending.ts`**
- Per-channel `maxPerDay`, `maxPerWeek`, `cooldownHours`
- `contactSendLog` pro per-contact recent send tracking

**`apps/api/src/db/schema/holdout.ts`**
- Holdout group s `percentage` (5,2 decimal)
- M2M `holdoutGroupMembers` — explicitní member assignment (ne random per-send)

**`apps/api/src/db/schema/inbound-email.ts`**
- Parsed inbound: from/to/subject, text/html body, messageId, inReplyTo
- `headers` + `attachments` JSONB (filename/contentType/size/url)
- `processed` boolean pro downstream handler

### 1.2 API routes — capabilities z kódu

**Campaigns lifecycle** (`routes/v1/campaigns.ts`):
- `GET /api/v1/campaigns` (cursor + status filter)
- `POST /api/v1/campaigns` (draft create)
- `GET/PUT/DELETE /api/v1/campaigns/:id`
- Lifecycle: `:id/schedule`, `:id/send`, `:id/pause`, `:id/resume`, `:id/cancel`

**Sending infrastructure** (`routes/v1/sending.ts`):
- `POST /api/v1/sending/fbl-inbound` (shared-secret webhook, raw ARF parsing)
- `GET /api/v1/sending/throttle?ip=` (per-ISP throttle state z Redis token buckets)
- `POST /api/v1/sending/throttle/reset` (admin)
- `GET/POST /api/v1/sending/warmup` (list + start)
- `POST /api/v1/sending/warmup/advance` (admin/cron — manual day++)

**Transactional** (`routes/v1/transactional.ts`):
- `POST /api/v1/transactional/email` (Mandrill-style: to/from/subject/html/text/templateId/mergeVars/tags/metadata)
- `POST /api/v1/transactional/email/batch` (až 1000 příjemců per call)
- `GET /api/v1/transactional/messages` (event log query)
- X-API-Key auth — embeddable v customer backendech

**Pre-send / quality**:
- `POST /api/v1/pre-send/tips` (subject + preheader + html → AI tips, recipient count aware)
- `POST /api/v1/editor/spam-check` (heuristic SpamCheckResult)
- `POST /api/v1/editor/accessibility-check` (hybrid: rule-based + Claude Haiku, 12h Redis cache)
- `POST /api/v1/editor/html-to-blocks` (Mailchimp/Klaviyo migration shim)
- `POST /api/v1/editor/countdown-gif` (animated countdown generator)
- `POST /api/v1/editor/scrape-product` (product card z URL)

**Deliverability**:
- `POST /api/v1/deliverability/graymail/sweep` (admin — runs classifier, tags graymail/dormant/at_risk/engaged)
- `GET /api/v1/deliverability/health-score` (composite per-org or per-domain or per-IP)
- `GET /api/v1/deliverability/insights` (admin-only; rules engine producing severity+suggestions)

**DMARC** (`routes/v1/dmarc.ts`):
- `POST /t/dmarc/report` (RUA endpoint — accepts aggregate reports)
- `GET /api/v1/dmarc/reports` + `/summary`

**List hygiene**: `GET /api/v1/list-hygiene/report` + `POST /api/v1/list-hygiene/purge`, `/duplicates`, `/duplicates/merge`

**Send-time optimization**:
- `POST /api/v1/send-optimization/record-open` (per-contact open log)
- `GET /api/v1/send-optimization/best-hour/:contactId`
- `GET /api/v1/send-optimization/best-day`
- `POST /api/v1/send-optimization/timewarp` (per-tz delivery)
- `POST /api/v1/send-optimization/backfill-timezones` (IP→tz inference job)

**Smart sending**: `GET/PUT /api/v1/smart-sending/rules`, `/check`, `/record`, `/prune`

**Frequency rules**: `GET/POST/PUT /api/v1/frequency-rules`, `/:channel`

**Quiet hours**: `GET/PUT /api/v1/quiet-hours`, `GET /api/v1/quiet-hours/check`

**Suppressions**: `GET/POST/DELETE /api/v1/suppressions`, `/check`

**Domains**: `GET/POST /api/v1/domains`, `:id`, `:id/dkim`, `:id/dns-records`, `:id/verify`, `:id/warmup`

**Templates / editor**: `GET/POST/PUT/DELETE /api/v1/templates`, `/:id/use`, `/api/v1/saved-blocks`, `GET/PUT /api/v1/brand-kit`

**Tracking** (`routes/v1/tracking.ts`):
- `GET /track/o/:token` (open pixel)
- `GET /track/c/:token` (click redirect)
- `GET /t/click/:linkId` (short-link variant)

**Signup forms**: CRUD + `:id/script` (embed JS), public `/public/forms/:id`, `/view`, `/submit`, A/B variants CRUD + `/variant` selector, `/progressive` (progressive profiling)

**MVT**: `/api/v1/multivariate-tests` s `/start`, `/winner`, `/cancel`, `/assign`

**RSS**: `/api/v1/rss-campaigns`, `/preview`, `/run-due` (worker trigger)

**Inbound email**: `POST /api/v1/webhooks/inbound-email/:orgId` a `/raw` (engine→API bridge), `GET /api/v1/inbound-emails`, `:id`

**ISP feedback**: `POST /api/v1/isp/feedback`, `/postmaster` (Google Postmaster bridge stub), `/record-send`, `GET /api/v1/isp/stats`, FBL registrations CRUD

**Abuse**: 14 endpointů (rules, events, sanctions, status, spam-traps, check-trap, signals, seed-rules)

**Dedicated IPs**: pools + IPs + status changes (10 endpointů)

**Holdout**: groups + `/populate`, `/check/:contactId`

### 1.3 Go MTA engine — `apps/engine/`

**Architecture** (`main.go`):
- Single Go binary; gRPC server on `GRPC_ADDR` (default `:50051`)
- Optional inbound SMTP receiver toggled by `INBOUND_LISTEN` (řádek 44)
- Pool-based architecture (no per-message dial)

**`internal/smtp/sender.go`** — message builder + sender:
- RFC 5322 message construction s multipart/alternative when text+html both present (řádek 197)
- Builds DKIM signature inline (řádek 75) — relaxed/relaxed canonicalization, RSA-SHA256
- **ISP-aware headers via `email.ApplyIspHeaders`** (řádek 223) — single function call applies Seznam/Centrum/Volny hints
- Standard header order (řádky 232-238) including `Feedback-ID`, `X-Seznam-Campaign-Category`, `List-Unsubscribe-Post`
- SMTP error code parsing → returns Result s smtpCode/smtpMessage (řádek 284)

**`internal/dkim/signer.go`** — production-grade DKIM:
- Relaxed body + header canonicalization per RFC 6376 §3.4
- Signed headers list (řádek 27): from, to, subject, date, message-id, mime-version, content-type, list-unsubscribe, list-unsubscribe-post
- Podporuje jak PKCS8 tak PKCS1 private keys (řádky 156-176)

**`internal/email/headers.go`** — **CZ moat**:
- `IspType` enum: seznam, volny, centrum, google, microsoft, apple, yahoo, unknown
- `ResolveIsp(address)` matches: seznam.cz/email.cz → Seznam, volny.cz, centrum.cz/post.cz, gmail.com/googlemail.com, outlook/hotmail/live/msn, icloud/me/mac, yahoo.* (řádky 71-87)
- `RecommendedThrottle(isp)` per-ISP defaults (řádky 103-120):
  - Seznam: 5 conns, 5K/hr
  - Volny/Centrum: 3 conns, 2K/hr
  - Gmail: 10 conns, 20K/hr
  - Microsoft: 5 conns, 10K/hr
  - Apple/Yahoo: 5 conns, 5K/hr
- `ApplyIspHeaders` (řádek 128) sets:
  - `Precedence: bulk` (skipped pro transactional stream)
  - `Feedback-ID: <campaign>:<stream>:forgemsg:<domain>` (Google/Yahoo FBL friendly)
  - `Auto-Submitted: auto-generated` (RFC 3834)
  - **`X-Seznam-Campaign-Category`** (řádek 162) když category provided — **jediný konkurent s tímhle v kódu**

**`internal/pool/pool.go`** — per-domain SMTP pool:
- `Pool` keyed by recipient domain; max conns/domain configurable
- MX lookup s priority sort + A-record fallback (řádek 262)
- STARTTLS opportunistic (preferred, falls back to plain) — řádek 199
- Background reaper goroutine pro idle conns
- `Conn` tracks createdAt/lastUsed/useTLS
- `Get/Put/Discard` API s NOOP verification on reuse (řádek 85)

**`internal/inbound/receiver.go`** — minimal MX backend:
- Tiny SMTP listener (LHLO/MAIL/RCPT/DATA only) na `INBOUND_LISTEN`
- Expected behind real MX (Postfix/Haraka zvládá TLS/spam)
- Parses RFC 5322 → multipart walker → POSTs JSON payload do API s `X-Inbound-Secret` headerem
- Attachments base64-encoded inline (s TODO: stream to S3 pro large)

**`internal/server/grpc.go`** — gRPC service:
- 3 metody: Send, SendBatch (bounded 20-concurrency goroutine fan-out), HealthCheck
- gRPC reflection enabled (grpcurl-friendly)

### 1.4 Block editor — `apps/editor/`

**`src/schema/blocks.ts`** — Zod-validated block schema:
- 10 block types (řádky 299-310): text, image, button, divider, spacer, columns, hero, social, footer, dynamic
- Recursive containers: `columns` (s `columnRatios[]`), `hero` (background image/color/overlay), `dynamic` (if/else)
- `DynamicCondition` s AND/OR + 14 operátory (eq, neq, gt, gte, lt, lte, contains, not_contains, in, not_in, is_set, is_not_set, has_tag, not_has_tag) — řádek 42
- Global styles: contentWidth 320-800 (řádek 282), link color, font family, background colors
- `socialBlock` s explicit networks enum: facebook, twitter, instagram, linkedin, youtube

**`src/render/render.ts`** — server-side HTML render:
- Table-based layout (Outlook-friendly), inline styles
- `color-scheme` meta + `supported-color-schemes` (řádky 70-71) — dark mode hint
- Mobile media query stacks columns (`fm-col` class)
- Hidden preheader span trick (řádek 78)
- Per-render links array (pro spam/link checker passes)

**`src/render/merge-tags.ts`** — regex-based:
- Syntax: `{{field}}`, `{{field|default:"x"}}`, `{{name|vocative|default:"zákazníku"}}` (řádek 47)
- Filter chain (řádky 47-48); registers `default` built-in
- Snake_case/camelCase auto-mapping, `contact.custom_fields` fallback
- System keys: `unsubscribe_url`, `view_in_browser_url`, `current_date`, `current_year`
- **`registerMergeFilter`** API (řádek 62) — `vocative` (5. pád) filter wired ve workers
- `listMergeTags()` pro "missing data" preview warnings

**`src/render/liquid.ts`** — Liquid template layer:
- Postavený na `liquidjs`; běží **po** merge-tag resolution
- Hardened sandbox: no `include`/`render` (řádek 26), no fetch, 5s timeout, 1MB output cap (řádky 17-18)
- `strictVariables: false` → missing vars render as ''
- Jinja-style `{% if %}`, `{% for %}`, filters

**`src/render/evaluate-condition.ts`** — in-memory predicate evaluator pro `dynamic` block; zrcadlí API segment logic pro single-contact case

**Editor backend** (`apps/api/src/services/editor/`):
- `spam-checker.ts` — heuristic 0-10 score: subject ALL_CAPS ratio, spam-word list (~28 trigger phrases řádky 36-43), link/text ratio, image alt audit
- `accessibility-checker.ts` — hybrid rule-based + Claude Haiku WCAG audit (12h cache)
- `countdown-gif.ts` — GIF generator pro countdown blocky
- `product-scraper.ts` — URL → product card

### 1.5 Email workers — `apps/workers/src/jobs/`

**`campaign-splitter.ts`**:
- Loads audience contact IDs (list ± segment − exclude segment)
- Splits do batchí po `BATCH_SIZE = 1000` (řádek 23)
- Bulk-enqueues `BatchSenderJobData` via `batchSenderQueue.addBulk`
- Updates campaign status → `sending`
- Concurrency: 5

**`batch-sender.ts`** — per-contact preparation:
- Per contact: suppression check (skip pro transactional stream — řádek 58), frequency cap (only broadcast — řádek 67), merge-tag resolve subject + HTML
- Builds `messageId` (`{uuid}@forgemsg.com`)
- Generates `List-Unsubscribe` headery (mailto + https) s base64url tokenem obsahujícím `{orgId, contactId, campaignId}` (řádek 84) — RFC 8058 compliant
- `X-Mailer`, `X-ForgeMsg-Campaign`, `X-ForgeMsg-Org` debug headery
- **Per-ISP routing**: `detectIsp(domain)` → `getMtaQueue(isp)` → bulk enqueue do mta-gmail/mta-microsoft/mta-yahoo/mta-other front (řádky 100-101)
- Inline merge-tag resolver (řádek 157) — jednodušší než editor's; potřebuje unification

**`mta-sender.ts`** — gRPC bridge to Go engine:
- Currently uses HTTP fallback (`/api/v1/internal/mta/send`) — gRPC client TODO (řádek 43-45)
- Bounce classification (řádky 99-110):
  - 550-559 → hard bounce → suppress + record
  - 4xx → soft bounce → BullMQ retry (exponential backoff)
  - 554/521 nebo message matches `/blocked|blacklist|policy|spam|rbl/i` → block bounce → alert, no suppress
- Per-ISP queue workers s rate limiters: Gmail 500/hr, others 1000/hr (řádek 227)
- Concurrency: 20 per ISP queue

**`archive-email-events.ts`** — moves old PG `email_events` rows do ClickHouse via Kafka

### 1.6 Notable gaps / stubs / TODOs v Mailforge email layer

**Stubs / not production-ready:**
- `apps/workers/src/jobs/batch-sender.ts` — `fetchContacts`, `checkSuppression`, `checkFrequencyCap`, `recordFrequencySend` všechny hit internal API via fetch (řádky 207-254) — funguje ale přidává latency; should be in-process Drizzle queries (or pass via redis)
- `apps/workers/src/jobs/mta-sender.ts:42` — `sendViaMta` uses HTTP bridge, not gRPC. Znamená double-hop (Worker→API→gRPC→Engine) místo (Worker→gRPC→Engine). **Critical perf gap** at scale.
- `apps/workers/src/jobs/batch-sender.ts:182-200` — `renderEmail` checks for `content.html` string; full block-JSON render path through `apps/editor/src/render/render.ts` not wired in worker yet (TODO komentář řádek 187)
- `apps/engine/internal/inbound/receiver.go:70` — comment notes "switch to S3 pre-upload for larger payloads" not implemented; large attachments inline base64
- `apps/api/src/db/schema/isp-fbl.ts:5-12` — `ispEnum` postrádá `seznam`, `volny`, `centrum` přestože engine je handles
- `apps/api/src/services/sending/isp-throttle.ts:28-45` — `ISP_CONFIG` zná pouze gmail/microsoft/yahoo/other; CZ ISPs route do "other" bucket (no Seznam-specific throttle v Redis)
- Žádný `bimi` column v `sendingDomains` (BIMI status not tracked)
- Žádný `oneClickUnsubscribePostUrl` storage — URL je hardcoded `https://app.forgemsg.com/unsubscribe/...` v batch-sender (řádek 94)

**Úplně chybějící schemas / routes** (no file found):
- Postmaster Tools OAuth tokens / scheduled polling (only stub `POST /isp/feedback/postmaster`)
- AMP for Email part / `text/x-amp-html` MIME building v Go MTA
- VMC / BIMI logo storage and DNS guidance
- Email change-of-address (resubscribe across email rename)
- Preference center per-list / per-topic subscription types (only suppressions + groups via lists)
- Inbox preview / seed-list testing (Litmus / EmailOnAcid integration)
- Per-domain `dmarc-policy-history` (only reports stored; no policy timeline)
- Per-ISP placement reports (only generic `email_events`)
- Send-time engine per **timezone-of-recipient** is partial (`backfill-timezones` exists; per-recipient hourly model needs ClickHouse view + ML stub)
- "Power Up" interactive blocks (poll, survey-in-email) — only `social` block exists

**Code-quality flags:**
- Dvě merge-tag implementace (editor v1, worker inline regex v2) — drift risk
- `signup-forms.ts:25` — `signupFormVariants.fields` a `config` are nullable overrides; A/B variant inheritance logic must be in service
- `apps/engine/internal/pool/pool.go:179` — hard-coded port 25 (no port 587 / submission preference)

---

## Část 2: Konkurence — email-specific extraction

### 2.1 Mailchimp (`data/01_*`)

**Killer email features:**
- **Send Time Optimization (STO)** ML per-recipient (Standard+, řádek 311 v 01)
- **Time-Warp / Time-Zone delivery** — local-time per recipient
- **Multivariate testing** až 8 variant (Premium-only, řádek 308)
- **RSS-to-email** native; `*|RSSITEM:...|*` merge tagy
- **Dynamic Content blocks** (Standard+) — conditional `*|IF:FNAME|* … *|END:IF|*` syntax
- **Email archive** auto-published URL per send (`*|ARCHIVE|*`, řádek 762)
- **AI Intuit Assist**: Smart Recommendations, Content Optimizer, Subject Line Helper
- 100+ pre-built templates + image editor (Unsplash/Giphy/Adobe Stock built-in)

**Sending engine:**
- Shared IP pools (multi-tier by tier — Premium gets best); Dedicated IP only on Premium + ≥5K/day × 3 days/week (řádek 114)
- SPF intentionally fails alignment ("by design", řádek 631) — DMARC passes via DKIM
- Auto one-click unsubscribe (RFC 8058)
- `List-Unsubscribe` + List-Unsubscribe-Post auto
- BIMI configurable (řádek 270 of 58)

**Anti-patterns / lock-in:**
- Tier-rounding (8K cont = pay for 10K)
- Unsubscribed contacts still billed (řádek 119)
- Multi-step automation Standard+ only (since 2025 cut)
- US-hosted by default; EU data residency Enterprise
- Žádná native email verification (G2 score 0/5 per řádek 620)

### 2.2 Klaviyo (`data/07_*`)

**Killer email features:**
- **Smart Send Time** AI per-profile (Pro+, řádek 639)
- **Predictive CLV / Churn / Date-of-next-order** — used as flow triggers + send personalization (řádky 411-471)
- **Product blocks** dynamic Shopify catalog (auto price/image/availability)
- **AI Recommendation block** v emailu (best sellers, similar-to-viewed, cross-sell)
- **Reviews block** (pulls Klaviyo Reviews add-on)
- **Coupon block** s unique-code generation
- **AI Subject Line Generator** + predicted open rate per variant
- **Predictive A/B Testing** — AI calls winner before stat sig
- Branded tracking domain CNAME (řádek 994) — avoids `klaviyomail.com` v click URLs
- **Sunset workflow** template (auto-suppress non-engagers)
- Handlebars syntax: `{{ first_name|default:"there" }}`, `{{ predicted_clv|floatformat:0 }}`

**Sending engine:**
- US-primary, EU residency on Enterprise/Klaviyo One
- Shared IP pools multi-tier; dedicated IPs Pro+ add-on
- **Smart Sending** default-on (prevents over-emailing same recipient)
- Quiet Hours + frequency caps

**Anti-patterns / lock-in:**
- Profile-based pricing (řádek 184) — every "active" profile billed, including suppressed who engage
- Marketing Analytics ($100+/mo) gates multi-touch attribution
- Reviews/SMS/Customer Agent all separate add-ons
- DTC-first segmentation framework — B2B awkward

### 2.3 Brevo (`data/05_*`)

**Killer email features:**
- **MJML support** under-the-hood (řádek 293) — responsive guarantee
- **Aura "Send at best time"** AI (Business+, řádek 325)
- **Subscription Preference Center** Brevo-hosted, multi-language, per-list opt-out
- **Volume-based pricing** (řádky 162-208) — unlimited contacts, pay per email sent
- Industry templates: e-commerce, B2B, healthcare, nonprofits, education

**Sending engine:**
- EU-hosted (Paris, Frankfurt)
- Shared IPs multi-tier reputation; Dedicated IPs Pro+ managed warmup
- `include:spf.brevo.com` setup, DKIM TXT on subdomain
- **Brevo Authenticator (2026+)** — auto-DNS via integration partners
- Auto one-click unsubscribe
- 1-6K req/sec rate limit per plan tier

**Anti-patterns / lock-in:**
- Send at best time disabled during A/B test, IP warmup, or anonymous tracking (řádek 334)
- Two parallel automation editors (classic + new) — migration friction
- Žádný dedicated IP warmup self-service (managed)

### 2.4 ActiveCampaign (`data/17_*`)

**Killer email features:**
- **Predictive Sending** (Pro+) — per-recipient send time AI (řádek 580)
- **Conditional Content blocks** s deep operators (segment + custom field + tag + behavior + lead score range) — řádek 588
- **Až 5 A/B variant** + A/B v automation **paths** (Pro+, řádek 577)
- **AMP for Email support** (some features, řádek 613)
- **Active Intelligence** account+industry send time recommendations
- 900+ pre-built automation recipes
- Transactional via **Postmark** (řádek 1538) — bundled at higher tiers

**Sending engine:**
- US-hosted s EU servers option
- Dedicated IPs add-on
- Strong list-quality gating (account suspension pro purchased lists)

**Anti-patterns / lock-in:**
- Modulární add-on architektura — features fragmentované přes tiers
- Conditional content Pro+ only

### 2.5 MailerLite (`data/11_*`)

**Killer email features:**
- **Auto-resend campaigns** (Growing+, řádek 464) — re-send to non-openers po 24h s new subjectem; +10-30% open rate boost. **Žádný konkurent v CZ to nemá nativně.**
- **RSS campaign** real-time / daily / weekly
- **Re-send** workflow node v automation
- **AI Writing Assistant** (Advanced) — subject, body, tone, translation, rewrite
- 30+ ecommerce blocks (product, coupon, survey/quiz)
- Smart sending (AI time)

**Sending engine:**
- EU-hosted (Lithuania) — ISO 27001
- Shared IPs multi-tier; dedicated only na Enterprise
- Active anti-spam policy (suspends pro purchased lists, řádek 1130)
- One-click unsubscribe auto

**Anti-patterns / lock-in:**
- Free plan = 0 templates (start from blank, řádek 536)
- Custom HTML Advanced+ only
- Workflow triggers cap at 3 per workflow (Advanced) — vs unlimited jinde

### 2.6 Ecomail (CZ — `data/19_*`)

**Killer email features:**
- **Re-send to non-openers** (Marketer+, řádek 588)
- Product feed sync (Shoptet, WooCommerce) → auto-insert blocks
- 160+ templates se silným sezónním (Vánoce, Black Friday) coverage
- Visual workflow editor (řádek 596) chválený za jednoduchost
- **Seznam.cz partnership** + 115M emails do Seznam during Black Friday 2023 (řádek 1452)
- CDP tarif s product recommendations
- Free plan 200 cont., free až 40K kontaktů (generous)

**Sending engine:**
- EU/CZ hosted
- Direct partnerství s Seznam.cz
- DKIM CNAME, SPF include, branded tracking domain

**Anti-patterns / lock-in:**
- Žádné AI generative features (řádek 1509)
- Žádné paid newsletters / digital products
- Editor "modern but glitches" (per SmartEmailing comparison)
- API doc primarily CZ

### 2.7 SmartEmailing (CZ — `data/21_*`)

**Killer email features:**
- **CZ-specific personalization**: 5. pád oslovení (vocative case), český kalendář svátků (řádky 416-419)
- Custom data structures (PRO tier) — relational data
- Vivantis case study: 32 automation scenarios, 8-15% email obratu
- Direct relationship Seznam.cz — CEO talks at Czech Online Expo
- 4M+ emailů/day infrastructure (řádek 322)
- Q1 2026 deliverability data: Black Week 400M newsletterů via Seznam (+50M YoY)
- Strong Shoptet + Sklik integration

**Sending engine:**
- Own infra, own IP ranges
- 95%+ inbox placement claim
- Self-hosted CZ servery
- Doručovací historie scoring při importu (řádek 533)

**Anti-patterns / lock-in:**
- Starší feel, méně modern UI
- B2B / nonprofit / media specifika — overkill pro malé e-shopy
- Premium pricing CZ context

### 2.8 Mailkit (CZ — `data/23_*`)

**Killer email features:**
- **AMP for Email integrated v editoru** (řádek 783) — few competitors have this natively
- **Loops + Conditions** v emailu (for-each on product feeds, if/else, řádky 808-826)
- **300+ drag-and-drop templates** (řádek 858)
- **Engagement Score** proprietary routing (řádek 1074)
- **Free photo database** built-in
- Sub-accounts (agency / multi-market) — řádek 437

**Sending engine:**
- **Own closed infrastructure since 2006** (řádek 287) — žádné AWS/GCP/Azure
- **Direct contractual relationships s all key ISPs** (řádky 309-318) incl Seznam
- **7 ISO certifikací** (9001, 22301, 27001, 27701, 27017, 27018, 20000 — řádky 363-394)
- **CSA (Certified Senders Alliance) member** + M3AAWG + Signal Spam
- Engagement-based routing per IP
- 98%+ delivery claim (CZ transactional)
- BIMI support

**Anti-patterns / lock-in:**
- Custom pricing only (žádné public tiers, řádek 154)
- B2B-heavy / enterprise feel
- UI méně modern než US competitors

### 2.9 Targito (CZ — `data/51_*`)

**Killer email features:**
- **Contact Policy** = frequency cap system s channel limits, time-of-day restrictions, per-segment overrides (řádek 1054)
- **Language mutations** per campaign (CZ/SK/PL/EN auto-assigned by profile)
- **Skloňování** built-in (5. pád)
- CDP-foundation: 360° customer view v editor block context
- RFM segmentace + auto-update
- Per-recipient unique emails at scale (řádek 863)

**Sending engine:**
- CZ-hosted, EU data residency
- 40+ modulů architecture
- Targito AI pro personalization

**Anti-patterns / lock-in:**
- Non-public pricing (custom quote ~$3K+/mo)
- Smaller dev pace vs Bloomreach/SAP
- Modular pricing = creep

### 2.10 Boldem (CZ — `data/39_*`)

**Killer email features:**
- **Automatická kontrola kampaní** = pre-send safety: spam words, broken links, HTML validation (řádek 500)
- **A/B testing až 4 variants** (řádek 1089) — uncommon v CZ tier
- **Inteligentní brand kit** — AI logo + color auto-detection
- **Limiter** = send-rate splitting (Profi tier, řádek 1130)
- AI features advancing 2024+ (řádek 1422)

**Sending engine:**
- Own servery v ČR (řádek 1464)
- Bounce rate scoring per contact při importu (řádek 533)
- Double opt-in default

**Anti-patterns / lock-in:**
- Personalization tokens require knowing variable names (řádek 524 — less UX-friendly)
- Méně automation templates než competitors
- Recently launched (2018) — smaller integration ecosystem

### 2.11 Inxmail (DE — `data/35_*`)

**Killer email features:**
- **AI-supported text suggestions** v editoru (DACH-pragmatic, řádek 771)
- **Multi-language content per recipient** v single kampani (řádky 740-746)
- Industry-specific templates: retail, media+publishing, energy, tourism, insurance, manufacturing (řádky 826-839)
- **Mediathek** centralized image library
- WYSIWYG + Custom HTML option
- Inxmail Commerce = ecommerce specialization (řádek 1315)
- Strong reporting: time-of-day, per-list, per-segment analytics

**Sending engine:**
- **CSA founding member** — most senior v DACH (řádek 1239)
- **98% delivery rate** (11% above industry avg, řádek 1247)
- Whitelisted by GMX, web.de, T-Online, 1&1
- EU-only servery, German jurisdiction
- TLS/SPF/DKIM/DMARC, dedicated IPs + SLAs on request

**Anti-patterns / lock-in:**
- **Public pricing** (rare v enterprise!) — řádek 214 of 35
- B2B/DACH-flavored (less DTC)
- AI méně autonomní než Klaviyo
- Některé legacy templates require HTML edit pro content rearrangement (řádek 846)

### 2.12 EmailLabs (PL — `data/41_*`)

**Killer email features (pure infrastructure play):**
- **Marketing vs Transactional separation** = separate IP pools, transactional priority (řádky 339-350)
- **S/MIME signing + digital certificates** (řádky 374-385) — unique, banking-grade
- **Non-throttled email quotas** (řádky 386-394) — burst-friendly
- **0.16s delivery speed** claim (řádek 332)
- **24K emailů/month free tier** (řádek 421) — generous pro SMTP
- **6 billion+ messages/year** (řádek 322)
- SMTP relay (`smtp.emaillabs.io` 587/465) + RESTful Email API
- Plug-and-play, < 5 min setup (řádky 491-507)

**Sending engine:**
- Vercom S.A. Group — pure CPaaS
- **Per-market ISP throttling** (PL + CZ + DE + FR) — řádky 362-372
- Dedicated IPs (controllable reputation, žádný shared-IP risk)
- EU hosting only — Schrems II compliant
- Reputation Defender (řádek 1033)

**Anti-patterns / lock-in:**
- Pure infrastructure — žádný marketing campaign UI / editor / segmentation
- Integration-only s SALESmanago, Bloomreach, Mautic
- Polish-primary support (EN available)

### 2.13 Cross-platform email patterns (2026 standard)

What every competitor has, that Mailforge needs to match:

| Feature | Standard? | Mailforge state |
|---|---|---|
| Drag-drop block editor | ✅ all | ✅ has |
| Mobile responsive | ✅ all | ✅ has |
| Inline CSS render | ✅ all | ✅ has |
| Outlook-compatible tables | ✅ all | ✅ has |
| Merge tags + filters | ✅ all | ✅ has |
| Dynamic content blocks | ✅ all paid | ✅ has (`dynamic` block) |
| A/B test (subject/sender/content) | ✅ all | ✅ has (MVT + abConfig) |
| Multivariate (3-8 variants) | Premium tier | ✅ has |
| Auto-winner send | ✅ all paid | ✅ has |
| RSS campaign | ✅ most | ✅ has |
| Auto-resend to non-openers | MailerLite/Ecomail | ❌ **missing** |
| Send Time Optimization | Klaviyo/Mailchimp/AC/Brevo | ⚠️ stub (best-hour/best-day endpoints; žádné ML) |
| Time-zone delivery | ✅ all paid | ⚠️ partial (backfill-timezones only) |
| Brand kit | ✅ all | ✅ has |
| Saved blocks library | ✅ all | ✅ has |
| Subscription preference center | ✅ all | ❌ **missing schema** |
| Double opt-in | ✅ all | ✅ has (v form config) |
| List-Unsubscribe + RFC 8058 one-click | ✅ post-2024 mandatory | ✅ has |
| SPF/DKIM/DMARC setup wizard | ✅ all | ✅ has (domains routes) |
| BIMI | Mailchimp/Klaviyo/Salesforce | ❌ **missing** |
| Spam-words pre-send check | Boldem/AC/Mailchimp | ✅ has |
| Accessibility check | rare (HubSpot+) | ✅ has — **competitive edge** |
| AMP for Email | Mailkit/AC partial | ❌ **missing** |
| Branded tracking domain | ✅ all paid | ⚠️ schema present (`mailSubdomain`) ale žádný auto-CNAME service |
| Predictive metrics (CLV/churn) | Klaviyo/Emarsys/Bloomreach | ❌ **missing** |
| AI subject line | Klaviyo/AC/MailerLite/Brevo | ⚠️ via pre-send/tips (Claude) |
| AI body generator | Klaviyo/MailerLite/Brevo/HubSpot | ❌ **missing v editoru** |
| FBL integration (Gmail/Yahoo) | ✅ all paid | ✅ has |
| DMARC report ingest | enterprise (Mailkit/Inxmail/SF) | ✅ has |
| Dedicated IP pools | Pro+ all | ✅ has |
| IP warmup automation | all paid | ✅ has |
| Per-ISP throttling | enterprise / Mailkit / EmailLabs | ✅ partial (Gmail/MS/Yahoo only) |
| **CZ-ISP throttling** (Seznam/Volny/Centrum) | Mailkit/SmartEmailing/Ecomail | ✅ engine has, API doesn't |
| Mailchimp import migration | competitor table-stakes | ✅ schema present (`migrationJobs`) |
| Klaviyo/Ecomail import | rare | ❌ **missing types** |
| Inbox preview (Litmus-style) | enterprise | ❌ **missing** |
| Spam-trap detection | Mailkit/EmailLabs | ✅ has (SHA-256 hash table) |
| Engagement score per contact | Mailkit | ❌ **missing** (have raw events) |
| Sub-accounts / agency mode | Mailkit/CleverReach | ⚠️ schema-ready (`organizations`) ale žádné agency UI |

---

## Část 3: Gap analýza per kategorie

### 3.1 Editor

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| 10 block types (text/image/button/divider/spacer/columns/hero/social/footer/dynamic) | ✅ | ~15-30 v Mailchimp/Klaviyo | M | — |
| Conditional `dynamic` block (14 ops, AND/OR groups, nested) | ✅ | ✅ all | — | — |
| Liquid templating w/ sandbox | ✅ (5s timeout, 1MB cap) | partial — only Mailchimp / Klaviyo full | — | — |
| Brand kit | ✅ has CRUD | ✅ all | — | — |
| Saved blocks library | ✅ | ✅ all | — | — |
| **Product block** (catalog auto-feed) | ❌ | Klaviyo/Ecomail/AC | **H** | 5-7 days (CDP-source dependent) |
| **Coupon block** (unique codes generator) | ❌ | Klaviyo/AC | M | 3-4 days |
| **Reviews block** | ❌ | Klaviyo (paid) | L | — |
| **AMP for Email** support (`text/x-amp-html`) | ❌ | Mailkit / AC partial | M | 7-10 days (engine + render + safe-template) |
| **Countdown GIF generator** | ✅ | Klaviyo/Mailchimp | — | — |
| **HTML→blocks import** | ✅ stub endpoint | rare (Klaviyo) | — | — |
| **Mobile preview per device** | ⚠️ (CSS only) | live preview UI ve všech | M | 4-5 days |
| **Inbox preview** (real-client screenshots) | ❌ | enterprise (Litmus/EoA bridge) | M | 2-3 days integration |
| **Templates: 100+ pre-built** | ⚠️ schema ready | Mailchimp 100+, Mailkit 300+, Ecomail 160+ | **H** | 10-15 days pro 50 templates |
| **Spam check** (heuristic 0-10) | ✅ (28 trigger words) | Boldem/Mailchimp/AC | — | — |
| **Accessibility check** (WCAG, hybrid AI) | ✅ | rare (HubSpot light) | — | **edge** |
| **AI subject line generator** | ⚠️ via pre-send/tips | Klaviyo/AC/MailerLite/Brevo/Inxmail | **H** | 2 days (Claude Haiku + cache) |
| **AI body generator** (tone/translate/rewrite) | ❌ | Klaviyo/MailerLite/Brevo | **H** | 4-5 days |
| **Mediathek / DAM** pro org assets | ⚠️ `media-assets` schema exists | Inxmail Mediathek | M | 4-6 days |

### 3.2 Sending engine

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| **Custom Go MTA + DKIM relaxed/relaxed** | ✅ rare | Mailkit/EmailLabs own | — | **moat** |
| **CZ-ISP header support** (Seznam X-Seznam-Campaign-Category, Feedback-ID, Precedence) | ✅ | only Mailkit/SmartEmailing/Ecomail at infra level | — | **moat** |
| Per-domain SMTP connection pool | ✅ | all infra-class | — | — |
| STARTTLS opportunistic | ✅ | all | — | — |
| MX s A-record fallback | ✅ | all | — | — |
| **gRPC bridge from workers** | ⚠️ HTTP stub | — | **H** | 3 days (wire `@grpc/grpc-js`) |
| **Per-ISP token-bucket throttle v Redis** | ✅ (Gmail/MS/Yahoo) | EmailLabs/Mailkit | — | — |
| **Per-CZ-ISP throttle v API** | ❌ (engine has constants only) | Mailkit/SmartEmailing | **H** | 1-2 days (add seznam/volny/centrum do isp-throttle.ts) |
| **Adaptive throttle na 421/451** | ✅ (`reduced` flag, 30min half) | EmailLabs Reputation Defender | — | — |
| **IP warmup 30-day schedule** | ✅ phases 50→200→1K→5K→20K | all paid | — | — |
| **IP pools by traffic type** (marketing/txn/cold) | ✅ | all paid | — | — |
| **Dedicated IP per-org allocation** | ✅ | all paid | — | — |
| **Branded tracking domain auto-CNAME** | ⚠️ schema only | Klaviyo/Brevo standard | M | 3-4 days |
| **DKIM key rotation** (`fm1` → `fm2`) | ✅ schema | enterprise | — | — |
| **BIMI / VMC** | ❌ | Mailchimp/SF/Klaviyo announced | M | 5-7 days |
| **Postmaster Tools polling** (Gmail reputation) | ⚠️ webhook stub | none have it native (most manual) | M | 3-4 days |
| **Reputation score per IP** (0-100) | ✅ schema | rare exposed | — | — |
| **Smart Send Time per recipient** (ML) | ⚠️ best-hour endpoints | Klaviyo/AC/Mailchimp/Brevo | **H** | 5-7 days (per-recipient histogram z ClickHouse) |
| **Time-zone delivery** ("timewarp") | ⚠️ partial | all paid | M | 2-3 days (worker scheduler) |
| **MTA HTTP/3 nebo SMTP MTA-STS** | ❌ | enterprise | L | — |

### 3.3 Deliverability

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| SPF/DKIM/DMARC verification | ✅ per-domain flags | all | — | — |
| DNS records UI guidance | ✅ `/domains/:id/dns-records` | all | — | — |
| DKIM signing (RFC 6376 §3.4) | ✅ relaxed/relaxed | Mailkit/EmailLabs own | — | — |
| DMARC aggregate report ingest | ✅ (`POST /t/dmarc/report`) | enterprise (Mailkit/SF/Emarsys) | — | **edge** |
| **DMARC policy timeline** (none→quarantine→reject migration) | ❌ | none have great UX | M | 3-4 days |
| **BIMI logo storage + VMC verify** | ❌ | Mailchimp/SF | M | 4-5 days |
| FBL processing (ARF parsing) | ✅ (`/sending/fbl-inbound`) | enterprise | — | — |
| **CZ FBL (Seznam)** registration tracking | ❌ ISP enum nemá CZ | Mailkit/Ecomail (manual) | **H** | 1 day (extend `ispEnum`) |
| **Postmaster Tools integration** | ⚠️ stub | none truly native | M | 3-4 days |
| **Sender Score / RBL polling** | ⚠️ `blacklistCount` col only | EmailLabs Reputation Defender | M | 2-3 days (poll Spamhaus/Barracuda) |
| List hygiene reports + purge | ✅ | all paid | — | — |
| Spam-trap detection (hash) | ✅ | Mailkit/EmailLabs | — | **edge** |
| Health score (composite per org/domain/IP) | ✅ | enterprise | — | **edge** |
| Deliverability insights (rule engine) | ✅ | none have explicit rules engine | — | **edge** |
| **CSA membership** | ❌ org-level | Mailkit/Inxmail/CleverReach | L | external — apply for it post-launch |
| **One-click unsub RFC 8058** | ✅ (List-Unsubscribe-Post v headers) | mandatory post-2024 | — | — |
| **DMARC enforcement nudge** (auto p=quarantine po 30d clean) | ❌ | none | M | 2 days |

### 3.4 Analytics

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| Send / delivered / open / click / bounce / unsub / complaint events | ✅ + bot detection (`isBot`, `botScore`) | all (většina lacks bot detection post-MPP) | — | **edge** |
| Per-link click tracking | ✅ (`linkUrl` col) | all | — | — |
| UA + device + email-client breakdown | ✅ schema present | all | — | — |
| Geo (IP→country) | ⚠️ raw IP only | all (heatmaps) | M | 2 days (MaxMind GeoLite bundle) |
| Time-series via ClickHouse | ✅ pipeline | enterprise (SF/Emarsys/Bloomreach) | — | **edge** |
| **Heatmap of clicks** | ❌ | Klaviyo/Mailchimp | M | 4-5 days |
| **Comparative reports** (campaign-vs-campaign) | ⚠️ raw data ready | Mailchimp Premium | M | 3-4 days |
| **Cohort / retention curves** | ❌ | Klaviyo Marketing Analytics add-on | L | — |
| **Revenue attribution** | ⚠️ MVT má `totalRevenue` col | Klaviyo/SF | **H** | 5-7 days (link to commerce orders) |
| **Industry benchmarks** | ❌ | Mailchimp | L | — |
| **Per-ISP placement** (Gmail vs Outlook vs Yahoo inbox %) | ⚠️ events mají `emailClient` | Klaviyo / Litmus integrations | M | 3 days (Apple MPP-aware) |
| **Engagement score per contact** | ❌ | Mailkit (proprietary) | M | 2-3 days (rolling 90d open/click count) |
| **Live campaign dashboard** (real-time send progress) | ⚠️ denormalized stats na campaign | most | M | 3-4 days |

### 3.5 Personalization

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| Merge tags + filters | ✅ (`{{f\|filter:arg}}`) | all | — | — |
| Default fallback | ✅ | all | — | — |
| Locale filters registry (např. `vocative`) | ✅ extensible | only Targito/SmartEmailing (CZ-built) | — | **edge** |
| **5. pád / vocative pro CZ** | ✅ via filter (workers register) | Targito/SmartEmailing/Ecomail native | — | **edge** |
| Liquid `{% if %}`, `{% for %}` v body | ✅ sandboxed | Mailkit / enterprise | — | — |
| Conditional content blocks (`dynamic`) | ✅ | all paid | — | — |
| Segment-aware conditions | ✅ (in-memory eval + API segments) | all paid | — | — |
| **Per-recipient product recs** | ❌ | Klaviyo / Ecomail CDP / Targito | **H** | 7-10 days (product feed schema exists `product-catalog.ts`) |
| **Dynamic pricing** (per recipient) | ❌ | enterprise CDP | L | — |
| **Predictive (CLV/churn/next purchase)** as merge data | ❌ | Klaviyo / Emarsys / Bloomreach | M | 10-14 days (CLV model + feature store) |
| **Multi-language mutations v one campaign** | ⚠️ `locale` na campaign + `translationGroupId` na templates | Inxmail/Targito | M | 3-4 days (worker resolves locale at send) |
| **Mailchimp `*|IF:|*` syntax compatibility** | ❌ | only Mailchimp | M | 1-2 days (parser) — eases migration |
| **AI-generated body per recipient** | ❌ | none yet (frontier) | L | — |

### 3.6 Anti-abuse + list hygiene

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| 13 abuse signal types | ✅ very extensive | enterprise only | — | **edge** |
| Sanctions (alert/throttle/pause/suspend) | ✅ s expiresAt | enterprise | — | **edge** |
| Spam-trap hash table | ✅ | Mailkit/EmailLabs | — | **edge** |
| Honeypot detection signal | ✅ v enum | rare | — | — |
| **Pre-send email validation** (MX + syntax + role-account) | ❌ | Mailchimp lacks (G2 0/5); Boldem/SmartEmailing/EmailLabs have it | **H** | 3-4 days (Drizzle service + MX cache) |
| **Pre-import list quality scoring** | ⚠️ schema-ready (`list_quality_low` signal) | Klaviyo/Mailkit | M | 4-5 days |
| **Sunset workflow** (auto-suppress 90d non-engagers) | ⚠️ graymail sweep exists | Klaviyo / Mailchimp manual | M | 1 day (wire as automation template) |
| **Frequency caps per channel** | ✅ | all paid | — | — |
| **Smart sending** (max/day, cooldown) | ✅ | Klaviyo (default on) | — | — |
| **Quiet hours** (per-channel, per-tz) | ✅ | Klaviyo / AC | — | — |
| **Holdout groups** | ✅ explicit members | enterprise (Salesforce MC) | — | **edge** |
| **Duplicate detection + merge** | ✅ endpoints | Mailchimp lacks (řádek 793) | — | **edge** |
| **Stale-list-send** signal | ✅ v enum | enterprise | — | **edge** |

### 3.7 Migration / import

| What | Mailforge | Competition | Priority | Estimate |
|---|---|---|---|---|
| Migration jobs schema | ✅ generic (`type` + progress JSONB) | rare structured | — | — |
| Mailchimp connector | ⚠️ `type` enum mentions 'mailchimp' (signup-forms.ts:172) | competitor table-stakes (Klaviyo has it) | **H** | 5-7 days (audience/campaigns/templates/automations) |
| **Klaviyo connector** | ❌ | rare (none have great Klaviyo→) | **H** for DTC | 5-7 days |
| **Ecomail connector** (CZ migration ⭢ Mailforge) | ❌ | none | **H** for CZ launch | 4-5 days |
| **SmartEmailing connector** | ❌ | none | **H** for CZ launch | 4-5 days |
| HTML email → blocks importer | ✅ `/editor/html-to-blocks` | rare | — | **edge** |
| Suppression list import | ⚠️ raw POST | all | — | (covered by existing) |
| **Mailchimp `*|MERGE|*` syntax translation** | ❌ | only Mailchimp natively | M | 2 days (parser → `{{merge}}`) |

---

## Část 4: Email-specific white space

Areas where **no** competitor of the 12 excels — and Mailforge can plant a flag.

### 4.1 CZ-ISP-native MTA (already started, finish it)

- Engine has Seznam/Volny/Centrum/email.cz/post.cz domain matching + recommended throttles + X-Seznam-Campaign-Category header (`apps/engine/internal/email/headers.go:71-87`)
- API throttle layer doesn't use it (`apps/api/src/services/sending/isp-throttle.ts:28` knows only gmail/microsoft/yahoo/other)
- **No competitor** ships open-source MTA with explicit Seznam category header. Mailkit has direct ISP relationships but closed source.
- **Move**: extend `IspName` type, add Seznam/Volny/Centrum do API throttle, document Seznam category vocabulary (`newsletter`/`transactional`/`marketing`/`product`), publish as differentiation.

### 4.2 Block-level Liquid + dynamic conditions with shared schema

- Editor's `DynamicBlock` evaluator (`apps/editor/src/render/evaluate-condition.ts`) shares operators with API segments
- This means "preview as contact X" and "actually send to contact X" use the same predicate logic — rare guarantee
- **No competitor** explicitly documents shared evaluator (Mailchimp has its own template language, Klaviyo uses handlebars, Brevo uses MJML + their own conditional engine — none share segment logic)
- **Move**: lean on this in marketing — "What you preview is what gets sent" + WCAG-clean conditional rendering test framework

### 4.3 AI agent jako in-product email copywriter (with prompt caching)

- Accessibility checker already proves the pattern: hybrid rule + Claude Haiku with 12h Redis cache (`apps/api/src/services/editor/accessibility-checker.ts:13`)
- Same pattern can drive: subject AI, body AI, tone adjust, CZ/SK translation (using already-registered `vocative` filter)
- **AI-native competitors** (Klaviyo, HubSpot Breeze, Brevo Aura, Targito AI) all bill per AI usage; **Mailforge can cache aggressively** and ship as included → competitive bullet "AI included, no usage caps"
- **Move**: build `apps/api/src/services/editor/ai-copywriter.ts` mirroring spam-checker's interface; expose under `/api/v1/editor/ai-generate` with subject/body/tone variants

### 4.4 Open-source Go MTA jako marketing kanál

- Mailforge's Go engine is small (~600 LOC core), focused, and competes feature-by-feature with EmailLabs' closed PL infra
- **Mailkit, EmailLabs, SmartEmailing** all have own infra but **none are open-sourced**
- Open-sourcing `apps/engine/` under MIT and putting "We use the same engine in production" positions Mailforge as the "Postgres for email sending" — devs trust it because they can read it
- Resends.com is doing this (Rust MTA) — Mailforge can be the **EU + Go** equivalent
- **Move**: extract `apps/engine/` to its own repo (or workspace package), add comprehensive docs, publish blog post; this becomes a community moat AND a recruiting magnet

### 4.5 Built-in deliverability rules engine s severity + suggestions

- `apps/api/src/services/deliverability/insights.ts` is rare: structured rules + auto-suggestions + ignoredRules per org
- **No competitor** exposes "this is the rule that fired, here's the threshold, here's how to fix" as first-class API — most have black-box "your deliverability is bad" alerts
- **Move**: publish a public docs page listing all rules (like ESLint rules); each rule deep-linked z dashboard. Becomes SEO + trust signal

### 4.6 EU-data-residency + open-source + CZ-ISP-native = unique 4-axis

- Bloomreach: enterprise/closed, USA HQ (was SK)
- Mailkit: CZ-closed, expensive
- Brevo: EU ale generic (no Seznam-specific)
- Klaviyo: US-DTC-focused
- **Nothing** combines: (a) EU hosting, (b) open Go MTA, (c) CZ ISP headers built-in, (d) SMB-friendly pricing, (e) AI in product
- **Move**: lead with this 5-tuple v homepage hero

### 4.7 Migration completeness pro CZ trh

- No platform má "migrate from Ecomail / SmartEmailing → us" connector
- Schema `migrationJobs` je generic — just needs N adapters
- **Move**: build 4 connectors (Mailchimp + Klaviyo + Ecomail + SmartEmailing) — pokrývá ~80% CZ market churners

### 4.8 Holdout groups s explicit membership

- Holdout v Salesforce MC / Braze je internal; **Mailforge exposes it as first-class API + UI surface** s M2M membership table (`holdout-groups/:id/populate`, `/members`, `/check/:contactId`)
- **Move**: market this for "lift measurement" / incrementality testing — slovník, který hits mid-market data teams

### 4.9 Per-ISP placement reports s bot-filtered opens

- `email_events.isBot` + `botScore` + `botReason` lets Mailforge compute **MPP-corrected open rates** out of the box
- Post-2021 Apple MPP, real opens are murky; most platforms still publish inflated open rates
- **Move**: show two metrics side by side: "Raw opens" and "Human opens (bot-filtered)" — first major platform to do this transparently wins trust

### 4.10 Per-campaign locale + translation group templates

- `templates.translationGroupId` (řádek 29) je rare: link a CZ/SK/EN template set; campaign picks per recipient locale
- **Inxmail** does multi-lang content but per recipient, not by template
- **Targito** does language mutations but bound to its CDP
- **Move**: ship `/api/v1/templates/translation-groups` + campaign-level locale dispatch; bigger CZ companies expanding to SK will love this

---

## Část 5: Doporučení P0 pro email launch

Top 15 features to build first for **CZ/SK SMB launch**, with estimates and dependencies.

| # | Feature | Why now | Estimate | Depends on | Files to touch |
|---|---|---|---|---|---|
| 1 | **Wire gRPC worker → engine** (replace HTTP bridge) | Cuts hop latency 50%; required pro serious volume | 3 days | `proto/mta_grpc.pb.go` (generated), `@grpc/grpc-js` | `apps/workers/src/jobs/mta-sender.ts:43` |
| 2 | **Block-render path v workeru** (call `apps/editor/render`) | Today batch-sender only handles `content.html` string; real campaigns ship block JSON | 2 days | `@forgemsg/editor` workspace dep | `batch-sender.ts:182-200` |
| 3 | **Extend `IspName` type + Redis throttle pro Seznam/Volny/Centrum** | Engine already classifies; API uses generic "other" → underutilizes CZ-tuned throttles | 1 day | none | `apps/api/src/services/sending/isp-throttle.ts:28`, `mta-sender.ts:214` (add mta-seznam queue) |
| 4 | **Mailchimp + Ecomail + SmartEmailing migration connectors** | CZ launch needs frictionless switching — Mailchimp/Ecomail/SmartEmailing are top sources | 12 days (4 days each) | `migrationJobs` schema | new `apps/api/src/services/migrations/{mailchimp,ecomail,smartemailing}.ts` |
| 5 | **50-template starter library** (CZ-localized) | Free + free trial competitors ship 100+; blank-canvas kills conversion | 10 days | `templates` schema | `seed/templates/*.ts` |
| 6 | **AI subject + body generator** (Claude Haiku, Redis cached) | Klaviyo/MailerLite/Brevo/Inxmail all have it; máme pattern z accessibility-checker | 4 days | Anthropic key, existing AI cache | new `services/editor/ai-copywriter.ts`, new `POST /api/v1/editor/ai-generate` |
| 7 | **Auto-resend to non-openers** (MailerLite/Ecomail killer feature) | Mailchimp lacks it; biggest "switch from Ecomail" delta when missing | 3 days | campaigns schema + worker | `apps/workers/src/jobs/auto-resend.ts`, campaign field `autoResendConfig` |
| 8 | **Per-recipient send-time optimization** (real ML, not stub) | Klaviyo/AC/Mailchimp Standard+ all have; raises open rates 15-30% | 6 days | ClickHouse engagement view | `services/send-optimization/predict-best-hour.ts`, integrate do batch-sender |
| 9 | **Time-zone delivery scheduling** (timewarp finalized) | Stub exists; needs worker to slice batch by recipient tz | 3 days | `send-optimization/backfill-timezones` (already there) | `apps/workers/src/jobs/timewarp-scheduler.ts` |
| 10 | **Pre-send email validation** (MX + syntax + role-account) | Mailchimp's #1 user complaint (G2 0/5); easy moat pro SMB | 4 days | none | `services/validation/email-validator.ts`, hooked into list-import + pre-send |
| 11 | **Branded tracking domain auto-CNAME wizard** | Klaviyo / Brevo standard; clicks should hit customer's subdomain, not `app.forgemsg.com` | 4 days | `sendingDomains` (already has `mailSubdomain`) | `/domains/:id/tracking-domain` + tracking.ts URL signing |
| 12 | **Subscription preference center** (per-list opt-out, multi-lang) | Brevo/Mailchimp/Klaviyo all have; required for granular GDPR consent | 6 days | `lists`, `groups`, `signup-forms` | new `apps/api/src/routes/v1/preference-center.ts`, public `/p/center/:token`, new schema |
| 13 | **Mailchimp merge-tag compat** (`*|FNAME|*` → `{{first_name}}`) | Eases Mailchimp migration audience-side (templates already need rewrite) | 2 days | merge-tags.ts | extend `apps/editor/src/render/merge-tags.ts` parser |
| 14 | **CZ ISP enum + Seznam FBL registration** | `isp-fbl.ts:5` is missing CZ ISPs; needed pro any real Seznam FBL flow | 1 day | `isp-fbl` schema | extend `ispEnum`, generate migration |
| 15 | **MPP-aware open rate**: dual metric (raw + bot-filtered) v dashboardech | Bot detection already v DB; UI doesn't surface; first to ship transparency wins trust | 3 days | `email_events.isBot/botScore` (already populated, but check actual writer) | analytics queries + dashboard tiles |

**Total estimate: ~64 dev-days (single dev) / ~13 weeks** — realistic ~10 weeks with parallelism.

**Dependency graph (suggested order):**
- Week 1: #1, #2, #3, #14 (engine + routing path correctness)
- Week 2: #11, #12 (deliverability + compliance baseline)
- Week 3-4: #10, #7, #9 (sender quality + open-rate uplift)
- Week 5-6: #8, #15 (send-time ML + transparent metrics)
- Week 7-8: #6, #13, #4 (AI + migration)
- Week 9-10: #5 (templates — can be parallel from start with content/design)

---

## Závěr — strategic insights for the email layer

1. **The schema is more complete than the runtime.** Mailforge has world-class schemas — abuse-detection with 13 signals, dedicated-IPs with reputation, MVT with conversion+revenue metrics, holdout groups, FBL — that rival enterprise platforms. But several services are HTTP stubs (mta-sender, batch-sender ↔ API, postmaster polling). **First priority is closing the gap between schema-readiness and actual wired-up behaviour**, especially the gRPC bridge. Without this, the platform looks great in code review but underperforms in production.

2. **The CZ-ISP MTA is a real, defensible moat — but it's only half-wired.** The Go engine (`apps/engine/internal/email/headers.go`) correctly classifies seznam.cz/centrum.cz/volny.cz and sets `X-Seznam-Campaign-Category` + `Feedback-ID`. But the API throttle layer (`apps/api/src/services/sending/isp-throttle.ts`) only knows `gmail|microsoft|yahoo|other`, and `isp-fbl.ts` ISP enum doesn't list CZ providers. Plugging this end-to-end takes ~2 days and unlocks the marketing claim "the only EU open MTA with first-class Seznam support". No competitor — including Mailkit (closed) and Ecomail (relationship-based, not header-based) — has this exposed.

3. **The block editor + render path is the strongest comparative piece**, with shared dynamic-condition evaluator (`apps/editor/src/render/evaluate-condition.ts`), Liquid sandbox (`liquid.ts`), pluggable locale filters (`vocative` for CZ 5. pád), hybrid AI accessibility check, heuristic spam check, and HTML→blocks importer. Mailforge's editor matches Mailchimp/Klaviyo/MailerLite na every drag-drop dimension and **leads on accessibility check + WCAG audit + AI-cached body suggestions**. The missing piece is the template library (50 CZ-flavoured templates would change the cold-start metrics in conversion).

4. **The competitive bullet "open-source + EU + CZ-native + AI included" doesn't exist anywhere.** Bloomreach is enterprise, Mailkit is closed CZ, Brevo is generic EU, Klaviyo is US-DTC, Ecomail is closed CZ-friendly, EmailLabs is pure infra. There's no SMB-friendly, EU-hosted, OSS-engine, CZ-ISP-aware, AI-native email platform. Mailforge can occupy this exact slot — but only if all five legs are visible (especially open-source the engine, even under permissive license; this is also a recruiting + ecosystem lever).

5. **MPP-aware analytics is a positioning play, not a feature.** Bot detection columns (`isBot`, `botScore`, `botReason`) already exist v `email_events.ts:37-41` — competitors mostly haven't dealt with the post-Apple-MPP reality and still publish raw opens. Shipping a dual metric ("Raw opens 42% · Human-verified opens 18%") with a tooltip explaining the methodology is a 3-day build that gives Mailforge a thought-leadership moment that compounds in marketing. Klaviyo, Mailchimp, Brevo have all shipped opaque "engagement score" replacements; nobody has published transparent dual metrics. This is a small piece of code s disproportionate brand value.

---

*Dokument vytvořen: 2026-05-18*
*Vlastník: omniascz@gmail.com*
*Status: pracovní podklad pro email layer P0 backlog*
