# Mailforge Email Layer — Unplanned Features + Flow Audit

> Generated: 2026-05-18
> Source: Mailforge planning corpus (FORGEMSG_ROADMAP.md, todonow.md, EMAIL_DEEP_ANALYSIS.md, MAILFORGE_FINDING_REPORT.md, POZICOVANI.md, TECH_STACK.md) + `data/01-60` competitor research
> Scope: Email layer only (excludes voice/SMS/WhatsApp gold-plating, CRM/sales hub, helpdesk)
> Status: Deep gap analysis, P0–P2 backlog candidate

---

## Část A — Inventář NAPLÁNOVANÝCH email features v Mailforge

Konsolidovaný seznam z roadmapy (Fáze 0–10), `todonow.md` (Opus/Sonnet/Haiku tiers), EMAIL_DEEP_ANALYSIS Část 5 doporučení P0, MAILFORGE_FINDING_REPORT (P0/P1/P2), POZICOVANI USP a TECH_STACK Phase 9 sign-off. Group podle 8 funkčních kategorií.

### A.1 Editor + templates

- Block JSON schema (10 typů: text/image/button/divider/spacer/columns/hero/social/footer/dynamic)
- Email render engine (responsive, table-based, dark-mode meta, inline CSS, juice, preheader trick, link extraction)
- Drag-and-drop canvas editor (@dnd-kit) + property panel + undo/redo
- HTML editor (CodeMirror 6, split-screen, live preview, import .html)
- HTML → blocks AI konverze (Claude Sonnet)
- Preview panel (desktop/mobile/tablet/dark, view-as-contact, send test email)
- Spam score checker (heuristic 0-10 score, subject + body + link/image ratios)
- Link checker (HEAD requests, working/redirect/broken/suspicious)
- Accessibility checker (hybrid rule-based + Claude Haiku WCAG AA)
- Countdown timer block (server-side GIF generator)
- Product card block (Claude scrape z URL → blocks)
- Dynamic content block (14 ops AND/OR/NOT, nested groups)
- Saved blocks library (CRUD)
- Brand kit (logo, colors, fonts, footer; CRUD + apply v editoru)
- Mediathek / DAM (`media-assets` schema — partial)
- Merge tag engine (`{{field|filter|default:"x"}}`, system tags)
- Merge tag picker UI v editoru
- Liquid templating (sandboxed: 5s timeout, 1MB cap, no fetch, no include)
- CZ vocative filter (5. pád — Opus #383, #606)
- CZ 7-pád full declension (Opus #607)
- SK declension 7-pád (Opus #608)
- Gender inference CZ/SK (Opus #425, #637)
- Salutation merge tag s deklinací (Sonnet #427, #639)
- International genderize.io fallback (Haiku #428, #640)
- Auto-fill gender při importu (Sonnet #426, #638)
- Template library 100+ (CZ-flavored seed, JSON, CRUD + clone)
- Translation groups (`templates.translationGroupId` — schema ready)
- Multi-language content framework pro editor/blog (Opus #408, #586)
- AI subject-line generator (Claude Sonnet, 5 varianty s predicted CTR)
- AI body generator / copywriting (Claude Sonnet, tone presets)
- AI překlad bloků (Claude Sonnet, preserves merge tags)
- AI brand voice learning (Sonnet — analyzuje 10-20 minulých kampaní)
- Conditional Content blocks v editoru (P0 doporučení, finding #7)
- Pre-built workflow recipes 900+ (Haiku #215, #480)

### A.2 Sending engine + MTA

- Vlastní Go MTA service (gRPC, SMTP client, per-domain pool, TLS/STARTTLS)
- DKIM signing (2048-bit RSA, relaxed/relaxed canonicalization, per-domain keys)
- DKIM key rotation (`fm1` → `fm2` selector)
- DKIM key generation + DNS TXT publishing
- SPF wizard (DNS record generation + verification)
- DMARC wizard (p=none → quarantine guidance)
- Return-Path CNAME setup
- BullMQ queue architecture (campaign-splitter, batch-sender, mta-sender)
- Priority queues (transactional > triggered > campaign)
- Per-ISP throttling (Gmail/Microsoft/Yahoo/Other token buckets v Redis)
- ISP throttling pro Seznam/Volny/Centrum (engine zná; API throttle dodefinovat — P0 #3)
- Adaptive throttle na 421/451 SMTP errors (50% drop, 30min recovery)
- IP warmup engine (30-day schedule 50→200→1k→5k→20k)
- IP pools by traffic type (marketing/transactional/cold_outreach/warming/shared/dedicated)
- Dedicated IP per-org allocation
- Per-IP warmup day counter + lifetime sent
- Per-IP reputation score (5,2 decimal), blacklistCount, rolling-24h bounce/complaint rates
- Bounce processor (parse NDR, classify hard/soft/block, auto-suppress)
- Retry logic (exponential backoff, per-ISP strategie)
- gRPC bridge worker → engine (P0 #1 — replace HTTP stub)
- Block-render path v batch-sender (P0 #2 — call apps/editor/render)
- List-Unsubscribe + List-Unsubscribe-Post RFC 8058 (implemented)
- Feedback-ID header (Google/Yahoo FBL friendly)
- X-Seznam-Campaign-Category header (CZ moat)
- Inbound MX receiver (RFC 5322 + multipart, Go)
- Transactional vs Marketing IP pool separation (P0 #11 v finding report)
- Marketing vs transactional stream metrics segregation
- AMP for Email build path v Go MTA (planned P1, finding #23)
- Branded tracking domain auto-CNAME wizard (P0 #11 v deep analysis)

### A.3 Deliverability + compliance

- Per-domain SPF/DKIM/DMARC verification + flags
- DMARC aggregate report ingest (`POST /t/dmarc/report`, RUA endpoint)
- DMARC reports CRUD + summary
- FBL inbound (`POST /sending/fbl-inbound`, raw ARF parsing)
- FBL registrations (Gmail/Microsoft/Yahoo/AOL/Comcast/Other — CZ ISPs TODO #14 P0)
- Seznam Email topping header (Haiku #371, #620)
- CZ ISP throttling rules (Haiku #373, #622)
- Seznam Postmaster parser (Sonnet #372, #621)
- Postmaster Tools polling stub (`POST /isp/feedback/postmaster`)
- DMARC Digests parser (Sonnet #497)
- Sender reputation monitoring SNDS/Postmaster (Sonnet #354, #602)
- Email health score per domain/IP (Sonnet #352, #600)
- Sender reputation public badge (Sonnet #440)
- Deliverability insights engine (rules engine + severity + suggestions — implemented v `apps/api/src/services/deliverability/insights.ts`)
- List hygiene reports + purge + duplicates + merge
- Graymail suppression (auto-pause kontakty s 0 engagement > N dní — Sonnet #351, #599)
- Suppressions per-org (email + phone, cross-channel)
- One-click unsubscribe RFC 8058 (List-Unsubscribe-Post)
- Preference center (per-purpose toggle — Sonnet #434)
- Per-purpose double opt-in (Sonnet #435, #647)
- Processing purposes schema (Sonnet #429, #641)
- Contact-purpose consent tracking (Sonnet #430, #642)
- Consent workflow triggers (Sonnet #433, #645)
- Consent expiration worker (Haiku #431, #643)
- Purpose-aware send guardrail (Opus #432, #644)
- GDPR right-to-be-forgotten (data subject deletion)
- Audit logs (Sonnet #496)
- BIMI config (P1, finding `data/58` 2026 standard) — planned
- Spam-trap detection (SHA-256 hash table, type: pristine/recycled/typo/honeypot)
- Honeypot detection signal
- Abuse detection (13 signal types, 5 severities × 7 actions, sanctions table)
- Frequency capping per org per channel
- Quiet hours (timezone-aware, per-channel)
- Smart sending (max/day, cooldown, per-channel)
- Holdout groups s explicit member assignment

### A.4 Analytics + tracking

- Open pixel tracking (`/track/o/:token`)
- Click tracking + link wrapping (`/track/c/:token`, `/t/click/:linkId`)
- UTM auto-append
- Event pipeline: Kafka → ClickHouse
- ClickHouse schema (`email_events`, partition by month, TTL 2 roky)
- Bot detection columns (`isBot`, `botScore`, `botReason`) — Apple MPP-aware
- Materialized views: campaign_daily_stats, campaign_hourly_stats, org_monthly_stats
- Campaign analytics API (sent/delivered/opens/clicks/bounces/unsubs/complaints + rates + timeline + per-link + device + geo)
- Per-link click counts API
- Device + email-client breakdown
- Click heatmap (Puppeteer screenshot + per-link overlay data)
- Live campaign dashboard (KPI cards, time-series, real-time WebSocket)
- Account dashboard (KPI + recent campaigns + trends)
- Account-wide reports
- Anomaly detection (cron, bounce rate > 2x avg, etc., in-app + email alerts)
- AI campaign report summary (Claude Sonnet)
- MPP-aware dual metric "Raw opens vs Human opens" (P0 #15 deep analysis)
- Revenue attribution (P0 #15 finding report — partial: MVT má totalRevenue)
- Cohort / funnel / timeline analytics (Opus #449)
- Engagement scoring per contact — partial (lead_scoring schema)

### A.5 Personalization + AI

- AI segment z popisu (Claude Sonnet → JSON conditions)
- AI copywriting engine (full email generator)
- AI campaign builder autonomous agent (Opus #473)
- AI autonomous agent runner framework (Opus #474)
- AI flow builder (Sonnet — chat → workflow JSON)
- AI campaign summary (Sonnet)
- AI usage tracking + Redis cache + rate limiting per plan tier
- Brand voice analysis + per-org context caching
- Predictive Lead Scoring ML model (Opus #466) — planned P1
- RAG vector store pgvector (Opus #584) — planned
- MCP server (Opus #476) — planned production wire-up
- Calculated properties evaluator (Opus #598)
- NL→SQL query engine (Opus #526)
- Custom objects engine (Opus #482)
- Lifecycle stages + history (Sonnet #568)

### A.6 Anti-abuse + list hygiene

- 13 abuse signal types (high_bounce_rate, high_complaint_rate, spam_trap_hit, honeypot_hit, volume_spike, list_quality_low, new_account_high_volume, blacklist_hit, content_spam_score, suspicious_login, api_abuse, credential_stuffing, stale_list_send)
- Abuse sanctions (alert/throttle/pause/suspend/require_review) s expiresAt + throttle rate/hour
- Pre-send content moderation (Claude Haiku — phishing/misleading/regulatory)
- Email validation engine (syntax + MX + disposable + role-based) — pre-import + pre-send (P0 #10 deep analysis)
- BotSense bot click detection (Opus #484)
- Sunset workflow (graymail sweep auto-suppress)
- Frequency caps per channel + Contact Policy

### A.7 Migration + onboarding

- Migration jobs schema (generic `type` + progress JSONB)
- Mailchimp migration tool (Opus #486-style + lists + templates + automations)
- Klaviyo migration tool (P0 #4 deep analysis)
- Ecomail migration (P0 #4)
- SmartEmailing migration (P0 #4)
- Brevo migration (P0 finding)
- Boldem migration (P1 finding)
- Mailchimp `*|MERGE|*` → `{{merge}}` syntax translator (P0 #13 deep analysis)
- HTML email → blocks importer (`/editor/html-to-blocks` + Claude)
- Onboarding wizard (5-step: org name → verify domain → import contacts → first campaign → live)
- Onboarding backend (steps JSONB, /onboarding/status + /complete)
- Beta invite system + waitlist + feedback widget
- WordPress plugin
- Shopify App + customer/order sync
- Shoptet OAuth + webhooks (Sonnet #386, #615)
- Upgates integrace (Sonnet #390, #616)
- FastCentrik integrace (Sonnet #392, #617)
- Raynet CRM bi-sync (Opus #391, #619)
- Heureka/Zbozi/Google Shopping product feeds (Sonnet #381-#382, #628)
- Product feed ingestion engine (Sonnet #627)
- External feeds (RSS/CSV/JSON URL pulls — Sonnet #286, #543)

### A.8 Subscription management + lifecycle

- Double opt-in flow (configurable, token expiry, custom landing)
- Unsubscribe engine (one-click RFC 8058, preference center, reason tracking)
- Signup forms schema (inline/popup/slide/floating embed types, FormField interface)
- Signup form A/B variants (trafficSplit + view/submit counts)
- Signup form progressive profiling
- Site tracking JS snippet (Sonnet #467)
- Site messages (Sonnet #468)
- Web personalization (Sonnet #469)
- Form builder UI
- Custom signup form domains
- Signup form analytics (views/submissions/conversion rate)
- Custom fields engine
- Tags + auto-tag rules
- Segment query engine (AND/OR/NOT + 14 ops, nested, event-based)
- Lists, groups, suppressions per-org
- Lifecycle stages + transition triggers (Sonnet #317, #318, #568, #569)

### A.9 Campaign features

- Campaign types (Regular, A/B, Re-send manual, RSS, Auto)
- Campaign state machine (DRAFT → SCHEDULED → SENDING → SENT, PAUSED)
- Campaign wizard (4 steps: Audience → Design → Review → Send)
- A/B testing (subject/sender/content variants, statistická signifikance, auto-winner)
- Multivariate testing (up to 8 variants, 5 winner metrics incl revenue, deterministic per-contact assignment, confidence threshold)
- RSS campaigns (feed URL, frequency, sendTime, lastSeenGuids dedup, worker poll)
- Campaign templates (CRUD, clone)
- Send time optimization stub (best-hour, best-day, IP→tz backfill)
- Send-time optimization ML model (P0 #8 deep analysis — real ML, not stub)
- Time-zone delivery (timewarp) (P0 #9)
- Auto-resend to non-openers (P0 #7)
- Holdout group enforcement
- Pre-send tips (Claude Sonnet — recipient count aware)

### A.10 Subscription / billing flow features

- Stripe plans table (stripe_price_id, contact_limit, email_limit, sms_rate, features)
- Stripe customer create na org create
- Stripe subscription create na plan select
- Usage-based reporting (monthly email/sms count → Stripe usage records)
- Plan-change proration
- Overage handling (per email $0.001, per SMS pass-through + markup, per HLR $0.005)
- Invoice webhooks (payment_succeeded, payment_failed → org.plan_status)
- Multi-currency billing (EUR, USD, GBP — Opus #409)
- Pay-per-send / prepaid credits tier (P1 finding #39)
- Billing UI (plan compare, Stripe Elements, invoice history)

---

## Část B — Features v data/ které NEJSOU v plánu Mailforge

### B.1 Smysluplné UNPLANNED features (priority H/M/L)

Filtruje: NE v části A. Smysluplné pro CZ/SK SMB → V4+ → EU mid-market omnichannel s AI. NE: enterprise overkill, US-only, deprecated, anti-positioning.

| # | Feature | Zdroj platforma | Co dělá (1 věta) | Priority | Rationale |
|---|---------|----------------|------------------|----------|-----------|
| 1 | **Inbox preview via Litmus/EmailOnAcid bridge** | Mailchimp, Mailkit, SAP Emarsys | Před odesláním zobrazí screenshot kampaně v 30+ real email clientech (Gmail iOS, Outlook 2019, Yahoo web) | **H** | Brevo/Klaviyo/MailerLite to nemají — pro CZ SMB launch je to "premium" trust feature, integrace přes Litmus API je 2-3 dny |
| 2 | **Send Time AI per-recipient ML (real)** | Klaviyo Smart Send Time, Mailchimp STO, Brevo Aura, Bloomreach Loomi | ML model per contact analyzuje historii open/click → predikuje optimal hodinu odeslání | **H** | Mailforge má jen `/best-hour/:contactId` stub; reálný 15-30% open-rate uplift, 5-7 dní implementace nad ClickHouse engagement view |
| 3 | **Resend campaign to non-openers** native | MailerLite, Ecomail | Po N hodinách neotevření kampaně automaticky pošle s novým subjectem; +10-30% open rate | **H** | "Killer feature" v MailerLite/Ecomail; Mailchimp lacks; #7 v deep analysis P0, 3 dny |
| 4 | **Predictive CLV / Churn / Predicted Next Order Date** | Klaviyo (auto), SAP Emarsys, Bloomreach Loomi | Per-profile ML predikce: total spend lifetime, churn risk Low/Med/High, next purchase date — usable v segmentech a merge tagách | **H** | Klaviyo to má across all tiers, Mailforge v finding #2 v P0 — Claude API draft + later ML model; 4 týdny |
| 5 | **RFM auto-cohorts** (Champions/Loyal/At Risk/Lost/Hibernating × 11 segments) | Klaviyo, Ecomail CDP, Targito, Leadhub, SAP Emarsys, SALESmanago | ClickHouse materialized view per-contact recency/frequency/monetary skóre → 11 pre-built segmentů auto-updated | **H** | Finding #1 v P0; CZ/SK SMB e-shopy chtějí "Champions" segment hned, 2 týdny |
| 6 | **Custom events API** `POST /events` jako trigger | Klaviyo, SmartEmailing PRO, Boldem Profi, Bloomreach | Customer posílá arbitrary event s properties → segment trigger, automation trigger, merge tag source | **H** | Finding #4 v P0; bez tohoto nikdo nemůže triggerovat workflow z externího systému; 1 týden |
| 7 | **CZ kalendář jmenin + svátků jako workflow trigger** | SmartEmailing, Ecomail, Leadhub | DB jmenin → cron "name_day_today" + "name_day_tomorrow" → workflow trigger na contacts s daným jménem | **H** | Sonnet #360, #362, #389, #609, #611 jsou v todo ale ne v ROADMAP fáze 0-10; CZ/SK SMB konkurenční baseline |
| 8 | **Per-recipient unique coupon code generation** | Klaviyo Coupon block, SmartEmailing, Leadhub | Email block generuje per-recipient unikátní slevový kód z poolu (Shoptet API) nebo deterministickým algoritmem | **H** | P0 finding #15; CZ e-shopy kritická — vyhne se "promo code abuse"; 3-4 dny |
| 9 | **Sklik audience sync** (CZ-specific ad audience) | SmartEmailing (Sklik direct), Ecomail | Push segment jako Sklik Custom Audience (hashed email/phone), pixel pro retargeting, lookalike, conversion API | **H** | Sonnet #420-#424, #634-#636 v todo ale ne v plan body; Mailchimp/Klaviyo nemají Sklik; jedinečný CZ moat |
| 10 | **AMP for Email native v editoru + MTA** | Mailkit (native), ActiveCampaign partial, SAP Emarsys | Block-JSON podporuje AMP komponenty (form, carousel, accordion, live cart); MTA buildí `text/x-amp-html` MIME part | M | "Premium" feature; SMB nepoužívá kromě power-userů; finding #23 P1 |
| 11 | **Engagement Score per contact (proprietary)** | Mailkit Engagement Score, Klaviyo (predictive) | Continuously-updated 0-100 skóre per kontakt: opens recency × frequency × clicks × replies × time decay; usable v segments a per-IP routing | M | Mailforge má `email_events.isBot` raw data ready; rolling-90d view + score column; 2-3 dny |
| 12 | **Engagement-based IP routing** | Mailkit, EmailLabs | Cold-start IP pool routes low-engagement traffic; warm IP receive high-engagement; auto-reroute na threshold | M | Po Engagement Score feature; 2-3 dny |
| 13 | **Pre-send "automatická kontrola"** dashboard | Boldem | Konsoliduje pre-send check (spam-words, dead links, missing alt-text, HTML errors, no plain-text, missing unsubscribe, image-text ratio) do jednoho "Go/No-Go" dashboardu v campaign wizard | **H** | Boldem to má jako #1 USP pro SMB; Mailforge má jednotlivé checks ale ne unified panel; 2 dny |
| 14 | **Multi-step / multi-touch progressive signup forms** | Klaviyo, MailerLite, Brevo | Form má 2-3 kroky (email → preferences → SMS opt-in); každý krok submit-event triggeruje automation | M | Mailforge `signup-forms.ts` má progressive endpoint ale schema nezná multi-step; SMB e-commerce konverze; 3-4 dny |
| 15 | **Exit-intent + scroll-% + time-on-page popup triggers** | Klaviyo, MailerLite, ActiveCampaign, Brevo | JS SDK detekuje exit (mouse leave top viewport), % scrolled, čas na stránce → triggeruje popup formulář | M | Mailforge signup-forms má embedType:popup ale ne trigger conditions; 3 dny |
| 16 | **Form impression vs submission tracking + frequency cap per visitor** | Klaviyo, Brevo | Trackuje views per cookie, max 1× per session, max 3× per visitor — nereje vůči vrácenců | M | Plánováno povrchně; UX-critical pro neotravné popupy; 2 dny |
| 17 | **Newsletter signup multi-language** auto-detect | Inxmail, Targito | Form detekuje Accept-Language → renderuje CZ/SK/EN verzi, ukládá `contact.locale` | M | Mailforge má `locale` na contact + i18n cs/sk/en; forms ne; 2 dny |
| 18 | **Connected Content / Liquid HTTP fetch při render** | Braze Connected Content | Liquid template může volat external API přímo v render time (rate-limited, cached, sandboxed) — např. live počasí, kurz měny, dynamický katalog | M | Mailforge má Liquid sandboxed bez `include`/fetch; selektivní allow-list whitelist + cache; 4-5 dní; finding #41 P1 |
| 19 | **Quiz / Survey block v emailu** (rating → auto-action) | MailerLite Surveys+Quizzes, Mailchimp, Constant Contact NPS | Email obsahuje 5-bod NPS / rating click → loguje response → auto-tag promoter/passive/detractor → trigger workflow | M | Haiku #378 v todo (NPS templates); celá quiz infra chybí; 5 dnů |
| 20 | **Subscription Preference Center hosted page** s per-list / per-topic / per-frequency toggle | Brevo, Mailchimp, HubSpot Subscription Types, SALESmanago | Public `/p/center/:token` stránka kde kontakt řídí per-list per-topic opt-out, frequency preference (daily/weekly/monthly), čas (quiet hours per recipient) | **H** | P0 #12 deep analysis; Mailforge má jen suppressions + global; GDPR best practice; 6 dnů |
| 21 | **Per-recipient time-zone profile property** + autobackfill při importu | Klaviyo, ActiveCampaign | Contact má `timezone` IANA string; pri importu inferuje z IP/country, manuálně overridable; campaign timewarp pak slice send | M | Mailforge má `backfill-timezones` stub; rozšířit na property + per-contact storage; 2 dny |
| 22 | **Profile activity timeline** (chronological events per contact) | Klaviyo, ActiveCampaign, Bloomreach | Contact detail view: chronological list events (opens, clicks, page views, purchases, form submits, custom events) za posledních 365 dní | M | ClickHouse data ready; UI + API endpoint; 3 dny |
| 23 | **Branded preview link** ("View in browser") | Mailchimp `*|ARCHIVE|*`, Klaviyo | Každá kampaň má public archive URL s tracking; merge tag `{{archive_url}}` v emailu | M | Mailforge merge engine má `view_in_browser_url` system tag, ale chybí archive endpoint + persistence; 2 dny |
| 24 | **List warming scheduler** (nový sender, postupně zvyšuj engaged audience) | ActiveCampaign List Warming, Klaviyo | Nový list → systém postupně přidává malé batche (10% denně) místo full-blast, monitoruje engagement, halt na anomaly | M | Sonnet #485 v todo; vedle IP warmup pro list-level warm-up; 3 dny |
| 25 | **Per-domain DNS guidance via Entri auto-DNS** | Mailchimp Entri integration | Vendor-managed auto-DNS push (přihlášení k DNS provideru, automatický zápis SPF/DKIM/DMARC bez manual copy-paste) | M | Mailforge má jen DNS records UI s copy buttonem; Entri partnership ($0.05/setup) ušetří 80% support; 3 dny + partnership |
| 26 | **Reverse-DNS / PTR record exposure v UI** | EmailLabs, Mailkit | Customer v UI vidí, který sender IP mu byl přiřazený, jaký PTR ten IP má, jestli reverse-DNS sedí | M | TECH_STACK má /29 Hetzner s rDNS; UI surface; 2 dny |
| 27 | **Bounce category breakdown UI** (per ISP, per reason, time-series) | Mailchimp, Klaviyo deliverability dashboard | Dashboard: bounce% per ISP, per reason (550 vs 552 vs 421 vs DMARC), time-series, top failing domain | M | Mailforge má data ready; missing UI a aggregation queries; 3 dny |
| 28 | **Per-ISP placement reports** (Gmail vs Outlook vs Yahoo inbox % vs spam %) | Klaviyo + Litmus, Mailchimp | Reports tab: per-ISP inbox placement rate, requires seed-list email infrastructure | M | Mailforge má `email_client` v email_events; seed-list test infrastructure neexistuje; 5 dnů |
| 29 | **Reputation badge / public sender score** | Sonnet #440 mentioned (UNPLANNED) | Veřejný score page per odesílací doménu (warmup status, bounce rate, complaint rate) pro transparency vůči vlastnímu týmu | M | "Trust signal" approach; finding edge case; 2 dny — partially in todo but not in roadmap |
| 30 | **Subject line preview na real device fonts** (mobile vs desktop, character cutoff) | Mailchimp, Klaviyo | Při psaní subjectu se renderuje preview jak vypadá v Gmail iOS (35 chars cut), Outlook desktop, Apple Mail | M | UX feature, ne backend; 2 dny |
| 31 | **Emoji + special chars whitelist/blacklist v subjectu** | Boldem pre-send | Detekuje emoji a special chars které způsobí spam filter trigger (e.g. ❗, 💰, 🎁 v subjectu) | M | Rozšíření spam-check; 1 den |
| 32 | **Resend-to-non-clickers** (alternative to non-openers) | Klaviyo flow | Po N hodinách od delivery: kontakty co neklikly žádný link → resend s alternative CTA | L | "Resend to non-openers" + 1; 1-2 dny additionally |
| 33 | **Smart drip pacing** (auto-adjust drip cadence per recipient engagement) | Klaviyo, ActiveCampaign | High-engagement contacts dostávají rychlejší cadence; low-engagement zpomaluje frequency | L | Vedle smart-sending engine; 4-5 dnů |
| 34 | **Auto-pause campaign on anomaly** (low click rate, high bounce, complaint spike) | ActiveCampaign | Po prvních N tisících odeslaných emails: pokud bounce rate > 5% nebo complaint > 0.1% → auto-pause + alert | M | Mailforge má anomaly detection + abuse signals; missing pause-during-send action; 2 dny |
| 35 | **Inbox rotation A/B test** (test new sending domain vs current) | Mailkit, EmailLabs | Pošle 5% kampaně přes nový "test" sending IP/doménu, monitoruje delivery rate vs control 95% | M | Pre-launch IP-pool validation; 3-4 dny |
| 36 | **DKIM 1024-bit → 2048-bit migration helper** | Klaviyo, Mailchimp | Pokud customer má staré 1024-bit DKIM (per DNS lookup), wizard ho upgraduje na 2048-bit s kontinuální verifikací | L | Mailforge je 2048-bit od start; ale pro migration importy z Mailchimp/Klaviyo useful; 1 den |
| 37 | **DKIM rotation reminder** (90-day cycle prompt) | Mailkit, SAP Emarsys | Cron alert: "Vaše DKIM klíče jsou starší než 365 dní, rotujte na bezpečnost" | L | Mailforge má schema pro rotation (fm1 → fm2); missing reminder; 1 den |
| 38 | **DNS health monitor** (continuous DNS check, alert on misconfiguration) | Mailchimp Premium, Klaviyo | Cron každých 24h verifikuje SPF/DKIM/DMARC pro každou doménu; alert pokud zmizely | M | Mailforge má one-shot verify endpoint; rozšířit na scheduled monitor + alert; 2 dny |
| 39 | **Multi-account / Agency mode** (přepínání mezi e-shopy bez logout) | Leadhub, Ecomail, Mailkit, Boldem | Agency user má seznam clientských orgs, přepíná v navbaru bez re-login, bulk-operations across clients | **H** | Finding #19 P0 v MAILFORGE_FINDING_REPORT; CZ agentury jako akviziční kanál; 1 týden |
| 40 | **Agency white-label** (custom domain + logo + brand per sub-account) | Mailkit sub-accounts, Brevo Enterprise | Sub-account má vlastní cms.agencyname.com, vlastní logo v UI, custom sender domain | M | Po agency mode; větší work; 2 týdny; finding #35 P1 |
| 41 | **Sub-account hierarchy + permission inheritance** | Mailkit (4-level), Brevo, Salesforce | Parent org → sub-orgs → contacts isolation; parent může nastavit defaults a quotas; sub-org může overridovat | M | Opus #530 v todo; finding #35; 2 týdny |
| 42 | **Browse abandonment** = separate od cart abandonment | ExpertSender, Klaviyo flow | Trigger: kontakt zobrazil produkt > 30s + nepřidal do košíku → 4h delayed email s tím produktem | M | Finding #20 P0; pre-built recipe v gallery; potřebuje site tracking; 3 dny vedle site-tracking |
| 43 | **Back-in-stock alerts** (subscribe link na out-of-stock produkty) | Klaviyo, Mailchimp, Ecomail CDP | Kontakt na product page kde sold-out → "Notify me" → po restock auto-email | M | Sonnet #444 v todo Sonnet ale ne v plan body; produkt feed potřeba; 3 dny |
| 44 | **Price-drop alerts** (subscribe link na produkty pro track price) | Klaviyo Price Drop flow | Customer trackuje X produktů; když cena klesne → email | L | Sonnet #444; 3 dny + product feed |
| 45 | **Replenishment / next-order ML prediction** (consumables) | ExpertSender, Klaviyo Predicted Next Order Date | Pro repeat-purchase produkty (drogerie, krmení, kontaktní čočky): trackuje purchase cycle, predikuje příští objednávku, sends timely email | L | Finding #36 P1; 1 týden po CLV model; consumables vertical-specific |
| 46 | **Wallet pass / Apple/Google Pay loyalty** | Klaviyo Loyalty 2026, SAP Emarsys | Generuje Apple Wallet / Google Pay pass per loyalty member s push notification update | L | Plánovaná Phase 7+ AI voice; loyalty subsystem v ROADMAP; přidat wallet pass jako feature; 4-5 dnů |
| 47 | **GIF generator obecně** (ne jen countdown) | Klaviyo | Server-side generuje custom GIF z text/template (např. "Welcome John!" jako GIF s personalizací) | L | Mailforge má countdown-gif; rozšířit na template-based; 3 dny |
| 48 | **Video-in-email** (animated GIF nebo MP4 thumbnail s play overlay) | Constant Contact, Klaviyo | Block "video" — converts MP4 link na animated GIF preview pro inbox + click → play page | L | Auto-conversion z MP4 → GIF + cdn; 4 dny |
| 49 | **Email change-of-address flow** (kontakt změní email — preserve history) | HubSpot, Salesforce MC | Public form `/change-email/:token` → verify new email → merge history → suppress old | M | GDPR best practice + churn reduction; 2-3 dny |
| 50 | **Multi-email per contact** (až 5 email adres) | Sonnet #454 mentioned (UNPLANNED v ROADMAP) | Contact entity má `primary_email` + `secondary_emails[]`; campaign target primary, ale failback na secondary | M | "B2B kontakt má work + personal" use case; partial v finding #454 todo; 2 dny |
| 51 | **Activity export bulk CSV** per contact + date range | Constant Contact, Haiku #223 todo | Bulk download events za kontakt nebo segment za N dní (audit, compliance) | L | Haiku #223 v todo ale ne v plan body; 1-2 dny |
| 52 | **Email validation pre-import** (free + paid tiers) | Boldem, SmartEmailing, EmailLabs | Při importu list: každý email projde MX + syntax + disposable + role; výsledek → score 0-100; volitelně 3rd-party paid validation (NeverBounce, ZeroBounce) | **H** | P0 #10 deep analysis; Mailchimp G2 score 0/5 — moat opportunity; 4 dny |
| 53 | **Doručovací historie scoring při importu** | SmartEmailing | Import list → systém check posledních N kampaní per email → flag "this contact bounced 3× in last 12 months on other sends" — preventuje import spam-traps | M | Cross-org spam-trap protection layer; needs anonymized hash DB; 5 dnů |
| 54 | **Catalog product feed bi-sync** (real-time stock + price + image) | Klaviyo, Leadhub | Catalog block v emailu fetches live stock/price/image z e-shop API při render — nestaří price discrepancy | M | Mailforge má product feed schema; sync logic implementuje; 4 dny |
| 55 | **Survey response → auto-action rules engine** | Sonnet #377 mentioned, MailerLite | Per-question mapping: rating ≤3 → add tag "detractor" + trigger workflow; choice "Yes" → update field | M | Sonnet #377, #625 v todo ale ne v plan body; 3 dny |
| 56 | **Per-link UTM auto-tagging customization** (per campaign) | Mailchimp, Mailerlite, Brevo | Campaign settings: customize utm_source/medium/campaign per kampaň, optional auto-append, optional per-link override | M | Mailforge má hardcoded `utm_source=forgemsg`; přidat per-campaign config; 2 dny |
| 57 | **Per-link redirect customization** (vanity short URL) | Mailchimp, Mailerlite | Místo `track.forgemsg.com/c/xyz` použít customer's `links.eshop.cz/c/xyz` (CNAME + SSL) | M | Vedle branded tracking domain (P0 #11); 2 dny |
| 58 | **Per-link clickmap UTM passthrough** (preserve customer's existing UTM on linkurl) | Klaviyo | Pokud customer dá link s existujícím utm_*, tracking nepoškodí — append vs replace | M | UX critical pro existing analytics; 1 den |
| 59 | **Webhook payload validation by signature** (HMAC) | Klaviyo, Mailchimp | Customer dostane webhook → ověří HMAC v X-Forgemsg-Signature → garantee delivery integrity | M | Mailforge má webhook system; signature implementace; 1 den |
| 60 | **Webhook delivery retry strategy customization** (per webhook, override default exponential) | Klaviyo, Mailchimp | Customer nastaví per webhook: retry on 5xx? max attempts? backoff multiplier? | L | UX add-on; 1 den |
| 61 | **Inbound email parsing → IMAP / API webhook** | Mailgun, Postmark, Mailchimp Inbound | Customer pošle email na `customer.id@inbox.forgemsg.com` → parse → API webhook z customer | M | Mailforge má inbound-email schema + Go MX receiver; missing IMAP routing logic; 3-4 dny |
| 62 | **Email-to-ticket / inbound parsing for helpdesk** | ActiveCampaign Conversations | Customer reply → parse → push do ticket system | M | Vedle inbound email; 2 dny + helpdesk integrace |
| 63 | **Anti-phishing detection on inbound** (mark suspicious) | Mailgun | Inbound emails → check SPF/DKIM/DMARC of sender + analyze content → flag phishing | L | Bezpečnostní enhancement; 2 dny |
| 64 | **AI segment cleanup recommendations** | Klaviyo AI segment | AI analyzuje use patterns segmentů → recommend "merge with X, delete Y unused since 90 dní" | L | Sonnet add-on; 2 dny |
| 65 | **Holdout group lift / incrementality reports** | Salesforce MC, Braze | Po kampani: porovnej converze v sent group vs holdout → lift % = real campaign impact | M | Mailforge má holdout schema; missing lift calculation + reporting view; 3 dny |
| 66 | **Lookalike audience** v list/segment (find contacts s podobnými profily) | Klaviyo, Brevo, Salesforce, SmartEmailing Sklik | Seed segment X → ML model najde contacts s podobnými profile properties → "Lookalike of high-CLV customers" | L | ML model + nebo Claude embedding similarity; 5-7 dnů |
| 67 | **Frequency cap per contact across multiple channels in 1 campaign** | Klaviyo Smart Sending, Targito Contact Policy | Kontakt už dostal SMS v posledních 4h → skip email | M | Mailforge má frequency_rules per channel; cross-channel orchestrace logic; 2 dny |
| 68 | **Send-after-conversion suppression** (don't market to contacts who already bought) | Klaviyo, Targito | Po purchase event → contact je dočasně suppressed z marketingových kampaní X dní | M | Vedle frequency cap; 2 dny |
| 69 | **Predictive A/B testing** (AI calls winner before stat sig) | Klaviyo, HubSpot Adaptive Testing | AI rozhoduje winner po menším sample size než klasický stat sig | L | Vedle existing MVT + AI; 3 dny |
| 70 | **Multi-language template-set per campaign** auto-assign by `contact.locale` | Inxmail, Targito | Campaign má 3 mutations (CZ/SK/EN); worker při send choose mutation per recipient locale | M | Mailforge má translationGroupId schema; missing worker logic; 3-4 dny |
| 71 | **Geo-targeted send** (filter recipients by country/region/IP geo) | Klaviyo, Mailerlite, Brevo | Campaign audience selector: country/region multi-select + IP-based geo filter | L | Mailforge má `email_events.ip_address`; geo via MaxMind GeoLite (2 dny) |
| 72 | **Per-vertical industry-specific template packs** (e-shop, fitness, eventy, restaurace, B2B SaaS) | Mailchimp, Inxmail, SAP Emarsys (60+ Tactics) | Pre-built šablony for specific verticals — "Černý pátek e-shop sale", "Fitness studio rozvrh", "Restaurace menu" | **H** | Vedle 100-template library; CZ-specific vertical packs reduces cold-start; 2 týdny work, ale value-multiplier; can run parallel z Phase 2 |
| 73 | **Pre-built workflow recipes per vertical** (e-com 20, B2B 20, eventy 10, fitness 10, restaurace 10) | ActiveCampaign 900+ recipes, Ecomail 8+, SmartEmailing Vivantis 32 scenarios | Workflow gallery filtered by use case — instant import + customize | **H** | Finding #3 P0 — Mailforge má pre-built v shared, ale 4-5 recipes; rozšířit na 50+; 3 týdny |
| 74 | **Coupon code generator s zásobníkem** (pool generation + per-recipient unique) | SmartEmailing, Ecomail | Customer uploaduje 10k kupónů → pool → každý recipient dostane unique z pool | **H** | Vedle item #8; pool management UI a allocation; 3-4 dny |
| 75 | **AI Calendly / Booking block** (smart scheduling embed v emailu) | ActiveCampaign AI Calendly, HubSpot Meetings | Email block embeds available slots; recipient klikne → bookuje slot z customer's calendar | M | Mailforge má booking_pages schema (finding); 5-7 dnů |
| 76 | **Pre-built sending domain quality checker** (před launch ověř SPF align, DMARC ne-fail, BIMI ready) | Mailkit, Klaviyo onboarding | Wizard: domain auth health-check report (5-7 položek) vyřeší before sending | M | Mailforge má per-protocol verified flags; integrated health view; 2 dny |
| 77 | **One-step "Unsubscribe from all" vs preference center choice** | Klaviyo unsubscribe page | Public stránka po klick: 2 buttons → "Unsubscribe from all" (suppress) NEBO "Manage preferences" (preference center) | M | UX add-on po preference center; 1 den |
| 78 | **Comparative reports** (campaign A vs B side-by-side) | Mailchimp Premium | Reporting view: vyber 2-5 kampaní → side-by-side metrics, percent diff, winner indicator | M | Mailforge má raw data ready; UI + queries; 3-4 dny |
| 79 | **Industry email benchmarks** ("vaše open rate vs průměr e-com tier" widget) | Mailchimp Industry Benchmarks | Account dashboard widget: "Vaše 28% open rate vs CZ e-com tier average 22%" | L | Benchmark DB z customer pool (anonymized) + UI; 3 dny po enough customers (Y2+) |
| 80 | **Custom dashboards** (drag-drop reporting widgets) | Klaviyo Marketing Analytics, HubSpot | User-defined dashboard: drag widget = metric + filter + chart type | L | Power-user feature; 5+ dnů; Phase 6+ |
| 81 | **Scheduled report email digest** | Sonnet #447 todo, Klaviyo Marketing Analytics | Cron weekly/monthly: aggregate stats → format → email customer's admin | L | Sonnet #447 unplanned in roadmap; 2 dny |
| 82 | **Csv/XLSX export per campaign report** | Mailchimp, Klaviyo, all platforms | Tlačítko "Export" na campaign report → CSV/XLSX s metrics + per-recipient events | M | Mailforge má raw queries; export endpoint; 1-2 dny |
| 83 | **Public status page** (transparent uptime + incident log) | Instatus, Statuspage | `status.forgemsg.io` veřejná stránka: per-component uptime, planned maintenance, incident timeline | M | Brand trust feature; Instatus $20/mo + 1 den setup; can be ready den 1 |
| 84 | **Public deliverability score per sending IP** | Sonnet #440 mentioned | Pro každý shared IP customer's e-mailing přes: veřejný score page reputace, warmup status | M | Vedle Sender reputation public badge; 2 dny |
| 85 | **Coupon expiry / lifecycle** (one-time use, expires after N days, max N uses globally) | Klaviyo Coupons, Mailchimp Promo Codes | Per-coupon: max_uses, expires_at, used_count, per-customer limit | M | Vedle coupon generator; 2 dny |
| 86 | **Reviews collection email** (post-purchase request) | Klaviyo Reviews, MailerLite | Auto-email N dní po order → "Hodnotil byste produkt X?" → odpověď v emailu / link → uloží do `reviews` table | M | Mailforge má `reviews` schema (finding); email flow + UI; 4 dny |
| 87 | **Site-tracking JS snippet** (page views, custom events) | Klaviyo, Mailchimp, ActiveCampaign, Leadhub | <1KB JS snippet identifuje known visitor → tracks page views, scroll depth, custom events → push do CDP | **H** | Sonnet #467 v todo; mandatory pro browse abandonment + identity resolution; 5-7 dnů |
| 88 | **Form autofill pre-known visitors** | Sonnet #334 mentioned, Klaviyo | Cookie ID → known contact → pre-fill form fields s data z profilu | M | Vedle site tracking; 2 dny |
| 89 | **Workflow JSON export/import** (verzování, marketplace) | Sonnet #374-#376, #623 todo, ActiveCampaign Recipe marketplace | Workflow → JSON s verze + hash → import do jiného orgu | M | Sonnet #374-#376; 3 dny |
| 90 | **Workflow template marketplace** (public katalog sdílených workflow) | ActiveCampaign | Public marketplace kde org publikuje workflow šablonu, ostatní org klonují | L | Vedle JSON export/import; 4-5 dnů |
| 91 | **AI Liquid Assistant** (autosuggesce Liquid templates při psaní emailu) | Braze BrazeAI Liquid Assistant | V code editoru: AI suggesturje Liquid syntax (`{% if %}`, `{{ var | filter }}`) | L | Cool but niche; 3-4 dny |
| 92 | **Send-to-self test email** s personalizací jako daný contact | Klaviyo View-as, Mailchimp | Send test email s rendered merge tagy pro vybraný real contact (ne mock data) | M | Mailforge má preview-as-contact; ale ne send-test-as-contact; 1 den |
| 93 | **Live preview customization** (Litmus-style: per email client, per device, per dark/light) | Litmus, EmailOnAcid | Při psaní emailu: live preview pre 5-10 různých email clients side-by-side | M | UI feature; integration s Litmus API; vedle inbox preview; 2 dny |
| 94 | **Plain-text auto-derivation** (automaticky generated plain-text alternative z HTML) | Mailchimp, Klaviyo, Mailerlite | Render engine z block JSON automaticky vyrobí plain-text version pro multipart/alternative; user může overridovat | **H** | Finding zmiňuje render engine chybí plain-text auto-derivation; pro deliverability mandatory; 1-2 dny |
| 95 | **Branded preheader generator** s emoji + truncate preview | Mailchimp, Klaviyo | Při psaní subjectu: side panel s preheader generator, suggests 90-110 char preheader options based on email content; AI Claude Haiku | L | Vedle subject AI; 1 den |
| 96 | **Click-tracked unsubscribe link customization** (track who clicks unsubscribe vs goes via List-Unsubscribe) | Klaviyo, Mailchimp | Unsubscribe link v body → click trackable (analytics: % goes via List-Unsub vs body link) | L | Branded unsubscribe page + tracking; 1-2 dny |
| 97 | **AI Bot detection model** (ML klasifikuje opens jako bot) | Klaviyo BotSense, Mailchimp, Apple MPP-aware | Mailforge má columns `isBot/botScore/botReason` jako string; přejít na ML model (Claude Haiku batch evaluation) | M | Opus #484; ML model nahradí raw heuristic rules; 5 dnů |
| 98 | **Customer-facing knowledge base / docs as in-product help** | HubSpot, Klaviyo Customer Hub | In-app `?` icon → contextual help articles, search, video walkthroughs | L | UX; 3 dny + content writing |
| 99 | **Pre-send compliance gate** (GDPR audit log per kampaň) | SmartEmailing GDPR audit log | Po kliknutí Send: checklist "Všichni recipients mají valid consent?" → log per kampaň | M | Vedle pre-send tips; 2 dny |
| 100 | **AI moderator pro UGC content** (recenze + odpovědi formulářů → check pro phishing/spam) | Klaviyo Reviews moderation | Před publikováním review or form response: Claude Haiku check pro nevhodný content | L | Vedle reviews module; 2 dny |
| 101 | **Web crawling pro brand asset auto-extract** (logo, color, font, brand voice z customer URL při onboardingu) | Boldem (auto AI logo + color detection) | Customer zadá URL → AI crawler vyextrahuje brand kit (logo, primary color, font-family) → seed do brand_kit | M | Onboarding accelerator; Claude Sonnet vision; 4 dny |
| 102 | **Brand voice consistency checker** (pre-send AI compares draft email vs saved brand voice) | Braze AI Content QA, Klaviyo | AI Claude Haiku: "This email mentions X tone, but brand voice is Y — suggest adjustment" | L | Vedle brand voice learning; 2 dny |
| 103 | **Customer education hub** (in-app tutorials, mini-courses on deliverability/copywriting) | Mailchimp Academy, Klaviyo Academy | Built-in academy pages + per-feature inline tutorials | L | Content-heavy; 1 měsíc content; or use Mintlify |

### B.2 SKIP — features které data/ má, ale nedávají smysl pro Mailforge

Důvod: overkill, mimo scope (anti-positioning), deprecated, US-only, enterprise-only kde Mailforge cílí SMB→mid-market.

| # | Feature | Zdroj | Důvod SKIP |
|---|---------|-------|-----------|
| 1 | **HIPAA compliance mode** (US healthcare) | Salesforce MC Health Cloud, HubSpot Enterprise | US-only; Mailforge je EU-CZ/SK SMB; healthcare = $50k+ compliance work; Opus #495 should be deferred indefinitely |
| 2 | **FedRAMP certification** (US federal gov) | Salesforce MC only | US gov SaaS; out of scope pro EU SMB |
| 3 | **AMPscript** (proprietary scripting jako Salesforce) | Salesforce MC | Anti-pattern per finding — non-portable, vendor lock-in. Mailforge má Liquid (industry standard) — držet se |
| 4 | **Multi-touch attribution add-on** ($100+/mo) | Klaviyo Marketing Analytics | Premium add-on enterprise; pro SMB single-attribution (last-touch) je dost; add jen pokud Phase 8+ enterprise |
| 5 | **Cross-cloud activation** (Salesforce Data Cloud → Sales Cloud → Service Cloud) | Salesforce | Multi-cloud not Mailforge model; native architecture, ne ecosystem |
| 6 | **Mobile push SDK** (iOS native + Android native + React Native) | Klaviyo, Braze, Salesforce | Phase 7 web push planned; mobile app SDK = 6+ měsíců work, ROI questionable pre-V4 |
| 7 | **OfferFit reinforcement learning** | Braze (acquired) | ML-only competitive moat $303M acquisition; pre-mature optimization pro Mailforge |
| 8 | **Zero-copy DWH triggers** (Snowflake / BigQuery direct trigger) | Braze, Salesforce Data Cloud | Enterprise-only feature; SMB nemá DWH; defer indefinitely |
| 9 | **Fax channel** | (None of 27 platforms) | Mailforge omnichannel scope: email/SMS/voice/WhatsApp/push, NE fax |
| 10 | **Adobe Marketing Cloud / Oracle Marketing Cloud parity** | Enterprise stack | Wrong tier; out of competition |
| 11 | **Reverse ETL to Snowflake / BigQuery on Enterprise tier** ($500/mo Klaviyo ADP) | Klaviyo Advanced Data Platform | Enterprise-only; defer to Phase 8+ |
| 12 | **Industry-specific compliance kit** (banking/insurance regulatory) | Bloomreach, SAP Emarsys, EmailLabs S/MIME signing | Vertical-deep enterprise; SMB nepotřebuje S/MIME signing |
| 13 | **VMC (Verified Mark Certificate) issuance** | Mailchimp / Klaviyo BIMI VMC | Mailforge BIMI je M priority; VMC issuance je niche additional service (~$1k/yr per customer); customer si VMC pořídí externě |
| 14 | **Custom Permission Sets API** s field-level scopes | Sonnet #345, #593, HubSpot Enterprise | Org má 4-role model (owner/admin/editor/viewer) which is enough pro SMB; custom permission sets jsou enterprise; defer |
| 15 | **Sandboxes** (isolated schema copies pro testing) | HubSpot Enterprise, Salesforce, Opus #590 | Enterprise dev/test feature; SMB nepotřebuje |
| 16 | **App marketplace** (3rd-party plugin store) | Mailchimp, Klaviyo, HubSpot, SAP Emarsys, finding plan | Phase 10+; pre-launch focus |
| 17 | **SIP/WebRTC inbound + IVR / hunt groups** | Brevo Phone, Twilio Studio | Voice channel je outbound (AI voice robot); IVR/inbound je telco product, anti-positioning |
| 18 | **Multi-region data residency switching** (EU/US/APAC selection per org) | Salesforce, Klaviyo One | Mailforge je EU-only Hetzner; out of scope until V4+ expansion |
| 19 | **DACH-grade ISO 27001 already in V1** | Inxmail, CleverReach, rapidmail | ISO 27001 plánováno Year 1-2 v finding; spravne tempo |
| 20 | **NL→SQL query builder GUI** for power users | Bloomreach Premium, Braze SQL Query Builder | Opus #526 v todo; SMB nepoužívá; defer to Phase 8+ enterprise add-on |
| 21 | **Adaptive testing AI A/B winner před stat sig** | HubSpot, Salesforce | Vedle predictive A/B; nice-to-have but not pre-launch |
| 22 | **Customer Hub** (customer-facing portal) | Klaviyo Customer Hub ($30/mo add-on) | B2C feature; Mailforge nemá B2C self-service product; defer |
| 23 | **Webinars native engine** | GetResponse | Out of scope; GetResponse to dělá jako differentiator, Mailforge nemá kapacitu kompetovat |
| 24 | **Event registration + ticketing** | Constant Contact | Mailforge má návaznost Ticketarium projekt; ne v core Mailforge scope; cross-link as integration |
| 25 | **Field-level / property-level security** | HubSpot Enterprise, Salesforce | Opus #592 v todo; enterprise feature; SMB nepoužívá |
| 26 | **Free photo database** (Mailkit) | Mailkit | Built-in stock photo library; competitive cost ($) — Mailforge integrace Unsplash API + Giphy API zdarma; ne built db |
| 27 | **Loyalty Cloud full subsystem** (buy from SAP, vs build) | SAP Emarsys, Salesforce | Loyalty schema je v Mailforge (5 tabulek); ale full points + tiers + rewards = 4 týdny work, defer to Phase 7+ |
| 28 | **AI Agent Console / Custom AI agent dev SDK** | Braze, Salesforce Agentforce | Frontier; finding #6 white space; pre-mature pre-V4 |
| 29 | **Conversational natural-language campaign builder** | Braze Operator, Salesforce Agentforce | Vedle AI campaign builder Opus #473 v todo; ale chat-driven UX je premature |
| 30 | **Modulární add-on pricing per feature** (5 oddělené produkty) | Brevo, ActiveCampaign, Klaviyo | Anti-pattern per finding #5 anti-positioning; Mailforge tendency unified product, modular toggles |

---

## Část C — Flow audit

For each ze 15 core email flow: stav, missing pieces, doporučení.

### C.1 Onboarding flow

**Krok 1:** signup → email verify → wizard → domain auth → first import → first form → first campaign

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Backend `onboarding_steps` JSONB + `/onboarding/status` + `/complete` (`apps/api/src/routes/v1/onboarding.ts`)
- 5-step wizard UI v Fáze UI (UI 9): welcome + verify domain + import + create campaign + send test
- Domain auth wizard (UI 3): DNS records zobrazení + verify button per record
- Beta invite/waitlist system + signup forms

**Co chybí / co flow nepokrývá:**
1. **Industry / business size dotaz** v wizardu (Mailchimp/Klaviyo má → driving onboarding personalization). Žádný step pro "co prodáváš/komu" → AI segment recs nemá kontext.
2. **Migration source selection** v wizardu (Mailchimp / Klaviyo / Ecomail / SmartEmailing / New). Mailforge má migrationJobs schema ale wizard ho neintegrovuje → user musí najít migration menu manuálně.
3. **Entri auto-DNS** integrace neuvedena (manuální copy/paste DNS records je friction). Klaviyo/Mailchimp partnership s Entri.
4. **First-form vs first-import volba** chybí — wizard naskakuje na obojí, mělo by být explicit "How will you get contacts?" → form OR import.
5. **AI-detected brand kit** ze customer URL chybí (Boldem to dělá při signupu).
6. **"Live" checklist:** žádný explicit "Are you ready to send?" gate (domain verified + at least 1 contact + at least 1 template + warmup configured).
7. **Onboarding completion analytics** chybí — kdy / kde uživatel drop-off, time per step → not measured.
8. **Trial expiration warning + upgrade prompts** v onboardingu pokud Free + reaching limits.

**Doporučení:**
- Rozšířit `onboarding_steps` schema o `industry, business_size, migration_source, first_action_chosen, brand_kit_auto_extracted` fields
- Wizard step 1: industry + size dropdown (drives template recs)
- Wizard step 2: migration source select → spusť migration job v paralelu k zbytku wizardu
- Wizard step 3: domain auth WITH Entri partnership option (auto-DNS)
- Wizard step 4: AI brand kit z URL → seed brand_kit
- Wizard step 5: form-or-import-or-skip (3 paths)
- Wizard step 6: pre-built recipe gallery (welcome series)
- Wizard step 7: "Ready to send?" gate + go-live checklist
- Analytics: log per-step time + drop-off → optimize cold-start

### C.2 List building flow

**Krok 2:** forms (popup/inline/floating) → imports (CSV/XLSX/API) → integrations (Shoptet/WooCommerce/Shopify) → double opt-in

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- `signup_forms` schema + 4 embed typy (inline/popup/slide/floating)
- A/B variants per form + trafficSplit + view/submit counts
- Migration jobs (Mailchimp ready, others schema-generic)
- Double opt-in flow + token + landing page
- Custom fields + tags + auto-tag rules
- Embed JS snippet generator (`/signup-forms/:id/script`)
- Form analytics (views/submissions)

**Co chybí / co flow nepokrývá:**
1. **Trigger conditions na popup forms** chybí (exit-intent, scroll %, time-on-page, page URL pattern). Mailforge má `embedType:popup` ale ne `triggerConditions` JSONB.
2. **Frequency cap per visitor** chybí — popup může jít na 1 visitor 50× za session.
3. **Multi-step forms** schema neexistuje (signup forms je flat; Klaviyo/MailerLite mají multi-step pro progressive opt-in).
4. **Form locale auto-detect** + render odpovídající jazyk (Inxmail). Mailforge `signup_forms.config` má Form field types ale ne `i18n` field overrides.
5. **Captcha** option neexistuje v form config (zabití bot signups).
6. **CSV column auto-mapping ML** (Mailchimp Premium) — Mailforge má manual mapping krok.
7. **Pre-import validation report** (sample 100 řádků → predict deliverability) chybí. Boldem/SmartEmailing to dělá.
8. **Shopify / Shoptet / Upgates OAuth flow** je v todo (Sonnet #386, #390, #615, #616) ale není v plan body — žádný explicit setup wizard.
9. **WooCommerce REST API + webhooks** — žádná specifická implementace zmíněna.
10. **Form-to-tag-to-workflow auto-bind** logic: form má list_id + tag_ids + workflow_id, ale není dokumentováno jak je to vázané.

**Doporučení:**
- Rozšířit `signup_forms.config` o `triggerConditions` (exitIntent, scrollPct, timeOnPage, urlMatcher), `frequencyCap` (maxPerSession, maxPerVisitor), `captcha` (recaptcha/turnstile/hcaptcha), `localeOverrides` (per-language field labels)
- Rozšířit FormField na multi-step (`stepNumber` per field)
- Přidat ML CSV mapping (Claude Haiku — analyzuje column headers + sample data → suggest mapping)
- Implementovat Shopify/Shoptet/WooCommerce OAuth wizards jako first-class Phase 6 work, ne defer to integrations sprint
- Form analytics: per-trigger conversion rate, per-step drop-off

### C.3 Contact management flow

**Krok 3:** search → filter → tag → bulk actions → custom fields → dedup → merge

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Contact CRUD API (`GET/POST/PUT/DELETE /contacts`) cursor pagination
- Full-text search přes pg_trgm
- Filtering by list/tag/segment/status/phone_operator/phone_district
- Soft delete (`deletedAt`)
- Bulk tag/untag endpoint
- Custom fields engine (text/number/date/select/boolean)
- List hygiene routes + duplicates + merge
- Contact list UI (UI 1) virtualní scroll + sidebar filters + bulk akce

**Co chybí / co flow nepokrývá:**
1. **Multi-email per contact** (až 5 emailů, Sonnet #454 todo) — schema má jeden email per contact, "B2B work + personal" use case chybí.
2. **Email change-of-address flow** (kontakt změní email → preserve history, public form `/change-email/:token`).
3. **Bulk merge UI** — endpoint exists (`/list-hygiene/duplicates/merge`) ale UI flow neexistuje (jak vybrat kterou verzi keep, jak merge custom fields).
4. **Activity timeline per contact** (chronologický view všech events) — ClickHouse data ready, ale UI page chybí.
5. **Contact bulk export to CSV** (Mailchimp/Klaviyo standard) — Mailforge má jen export per list, ne per segment ad-hoc.
6. **Identity merge** (visitor → contact backfill po identifikaci, Opus #455) je v todo ale ne v plan body.
7. **AI sample suggestions na merge confidence** — když 2 contacts mají podobný email, AI suggests merge.
8. **Subscriber status** model lacks "lead" / "MQL" / "SQL" / "customer" lifecycle stages (Sonnet #317, #568 todo).
9. **Per-contact note** chybí (ActiveCampaign má sales notes per contact).
10. **Bulk action confirmation s undo** — pokud user omylem delete 5000 contacts, není rollback.

**Doporučení:**
- Rozšířit `contacts` schema o `primary_email` + `secondary_emails JSONB array`
- Implementovat `/contacts/:id/change-email` public form (Phase 6)
- Postavit activity timeline UI (Phase 4 vedle dashboards)
- Přidat bulk export endpoint `/contacts/export?segment_id=X&format=csv`
- Lifecycle stages: rozšířit `contacts.status` enum + add stage transition triggers (Sonnet #318)
- Implementovat soft-delete s undo window (7 dní → permanent purge cron)
- Bulk action confirmation modal s "Are you sure" + undo button v Notification toast

### C.4 Segmentation flow

**Krok 4:** query builder → AND/OR/NOT + nested → dynamic vs static → real-time preview → save → use in campaign/automation

**Stav:** ⚠️ Částečný (engine ready, UI partial)

**Co máme v plánu/kódu:**
- Segment query engine (`segments.conditions JSONB`): AND/OR + 14 ops + nested groups
- Event-based filtering (opened_campaign, clicked_link)
- AI segment z popisu (Sonnet)
- Segment builder UI v Fáze UI (UI 1)
- `GET /segments/:id/count` + `/contacts`

**Co chybí / co flow nepokrývá:**
1. **Dynamic vs Static segment** flag chybí (Klaviyo Segments are always dynamic, Lists are static — Mailforge konflikt).
2. **Save as Static snapshot** missing — uživatel chce "freeze" segment at point in time (e.g. "Black Friday buyers as of 2026-11-29").
3. **Segment performance preview** (estimated reach + projected open rate based on past campaigns to similar contacts).
4. **Predictive metrics jako filter** (CLV > 1000 Kč, churn_risk = high) — schema neexistuje.
5. **Per-event property filters** (e.g. "opened campaign X" + "where campaign.tag contains 'Promo'") — jen base event filter.
6. **Nested groups deep beyond 2 levels** untested + UI limit.
7. **Engagement score range filter** chybí (Mailkit-like).
8. **RFM cohort filter** chybí (Champions/At Risk/Lost) — finding #1 P0.
9. **Saved queries / Data sets** (Sonnet #356, Opus #604 todo) ne v plan body.
10. **AI segment optimization** — AI doporučí "Tento segment má too narrow → try X" or "duplicate of segment Y".

**Doporučení:**
- Přidat `is_static BOOLEAN` na `segments` + snapshot mechanism (capture contact_ids do separate table)
- Rozšířit conditions schema o `predictive_metric` operator (CLV/churn/next_order) once predictive layer existuje
- Per-event property filters (deep property path: `event.metadata.product_id IN [...]`)
- AI segment cleanup (analyze unused segments, dupes, recommend consolidation — Claude Haiku)
- RFM cohort jako pre-built segment templates (Champions, At Risk, ...)
- Engagement score range filter (once engagement score feature exists)
- UI: 3-level nested support + visual indentation + segment preview chart

### C.5 Template management flow

**Krok 5:** create → edit → save → library → brand kit → version history → translation groups

**Stav:** ⚠️ Částečný (schema ready, library missing)

**Co máme v plánu/kódu:**
- Templates schema (block JSON, globalStyles, isPublic, tags, category, locale, translationGroupId)
- `GET/POST/PUT/DELETE /templates` + `/use` (clone do kampaně)
- Brand kit CRUD
- Saved blocks library
- 100+ template seed plánováno

**Co chybí / co flow nepokrývá:**
1. **Template version history** (Mailchimp template revisions, undo to previous version) — schema má `updatedAt` ale ne explicit revision log.
2. **Template "fork from"** lineage tracking (template B was forked from template A → propagate updates).
3. **Public template gallery** (`isPublic: true` filter, marketplace, public preview URLs) — schema ready ale ne implementováno.
4. **Industry-specific template packs** (e-shop / fitness / eventy / restaurace / B2B SaaS) ne v ROADMAP detailed plan.
5. **CZ-localized templates** (Vánoce, Black Friday, jmeniny, narozeniny, Velikonoce) — generic 100 mentioned ale ne CZ-specific.
6. **Template performance preview** (when user picks template: "tato šablona má 28% open rate napříč X kampaněmi").
7. **Translation group UI** (jak user vybudovat CZ/SK/EN template set, jak je vázané).
8. **AI template generator** (Claude Sonnet — celý template z prompt) — v AI features ano, ale ne integrované do template UI.
9. **Block library category filter** v editoru (e-com blocks, B2B blocks, event blocks).
10. **Template testing across email clients** (Litmus integration; finding edge case).

**Doporučení:**
- Přidat `template_revisions` table (template_id, version, blocks JSONB, createdAt)
- Forked-from `parent_template_id` column + propagation logic
- Public gallery: `/templates/gallery` + `isPublic` filter + thumbnail render
- Build 5 vertical template packs (10 templates each) parallel z Phase 2 — CZ e-shop, fitness, eventy, restaurace, B2B
- Translation group UI: side-by-side editor pre CZ/SK/EN, sync block structure, override text per locale

### C.6 Campaign creation flow

**Krok 6:** type select (Regular/AB/MVT/Re-send/RSS/Auto) → setup → audience → design → test → schedule → confirm

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Campaign types: Regular, A/B (via abConfig), MVT, RSS, Auto-resend planned
- Campaign state machine
- Campaign wizard UI (UI 3): 4 kroky Audience/Design/Review/Send
- Pre-send tips (Claude Sonnet)
- Spam check + link check + accessibility check
- Send test email
- Schedule with timezone + IANA

**Co chybí / co flow nepokrývá:**
1. **Type select step** chybí v wizardu UI 3 (předpokládá Regular, jiné typy jak?).
2. **Re-send campaign** type (`POST /campaigns/:id/resend-non-openers`) — schema ready (`campaigns.parent_campaign_id`?), ale ne v plan body explicit.
3. **A/B variants editor** UI (jak user definuje 2-4 subject variants, allocation %) v Fáze UI partial.
4. **MVT variants editor** UI (5+ variants × 5+ elements) — complex grid UI.
5. **Auto-resend config** (delay hours, new subject auto-generated or manual) ne v plan body.
6. **Campaign duplicate / template** (klonuj past kampaň → upravuj) chybí.
7. **Pre-send GDPR audit** (consent verification before send) — finding #102.
8. **Auto-pause on anomaly during send** (real-time monitor first 1000 sends → if bounce > 5% pause).
9. **Smart send time per recipient** integrace na send button (ne jen scheduled at).
10. **Time-warp per timezone** integrace na schedule step.
11. **Skontrolovat audience est. reach** before send + "your list grew 5% since draft created" warning.
12. **Confirm send modal s checklist** (review subject, from, list, schedule, scheduled at, throttling settings) — UI nutné, ale ne explicit v plan.

**Doporučení:**
- Wizard step 0: Type select (Regular / A-B / MVT / Re-send / RSS / Auto)
- A/B / MVT specific sub-flows v step "Design" → variants tab
- Re-send: nový endpoint `/campaigns/:id/resend-non-openers {delay_hours, new_subject?, new_preheader?}`
- Auto-pause: integrate s abuse_detection signals → pokud sanction triggered during send → pause + alert
- Smart send time toggle + time-warp toggle v step "Send"
- Confirm modal s 8-item checklist + send button disabled until all green

### C.7 Sending flow

**Krok 7:** campaign-splitter → batch-sender → ISP routing → MTA gRPC → bounce processor → suppression update → event pipeline

**Stav:** 🛠️ V kódu ale neflow-uje (workers + engine separate, gRPC ne, render path partial)

**Co máme v plánu/kódu:**
- `campaign-splitter.ts` (batches po 1000, status update)
- `batch-sender.ts` (per-contact: suppression check + frequency check + merge tags + ISP routing + bulk-enqueue do per-ISP queue)
- `mta-sender.ts` (HTTP fallback to API, bounce classify, retry exponential)
- Go MTA engine (DKIM, pool, STARTTLS, ISP headers, gRPC server)
- ClickHouse event pipeline plánováno
- Per-ISP queues: Gmail/Microsoft/Yahoo/Other

**Co chybí / co flow nepokrývá:**
1. **gRPC bridge worker → engine** chybí — `mta-sender.ts:42` HTTP stub místo gRPC (P0 #1 EMAIL_DEEP_ANALYSIS). Double-hop performance gap.
2. **Block-render path v workeru** chybí — batch-sender expects `content.html` string; production campaigns ship block JSON; full render path neimplementovaný (P0 #2).
3. **CZ ISP throttle bucket missing** v API throttle (Seznam/Volny/Centrum routes to "other" — P0 #3).
4. **Inline merge-tag resolver** v batch-sender drift od editor's merge engine — dvě paralelní implementace.
5. **`fetchContacts`, `checkSuppression`, `checkFrequencyCap` via fetch internal API** místo in-process Drizzle — performance.
6. **Per-recipient time-warp slicing** ne v worker logic.
7. **Smart send time** ne v worker logic.
8. **Holdout group enforcement** v sending flow — schema ready ale worker neznamená "skip if contact is in holdout".
9. **Plain-text auto-derivation** chybí (finding §1.3 — RFC 5322 message builder s multipart/alternative pouze pokud text+html oba present, no auto-derive z HTML).
10. **Open-rate event → engagement score update** real-time chybí (rolling 90-day score).
11. **Branded tracking domain** signing v URL generation chybí (hardcoded `track.forgemsg.com`).
12. **Auto-pause na anomaly during sending** ne v worker logic (sanctions checker fires async, ne synchronously).

**Doporučení:**
- **Sprint 1** (Phase 3 wrap-up, kritické): #1 (gRPC), #2 (block render), #3 (CZ ISP), #9 (plain-text), #11 (branded tracking) — všechno na 2 týdny
- **Sprint 2:** #4 (unify merge engines), #5 (in-process Drizzle), #6 (time-warp), #7 (smart send time), #8 (holdout enforcement)
- **Sprint 3:** #10 (engagement score update), #12 (auto-pause anomaly)

### C.8 Tracking flow

**Krok 8:** open pixel → click redirect → event → Kafka → ClickHouse → analytics

**Stav:** ⚠️ Částečný (tracking layer ready, Kafka stub, branded tracking missing)

**Co máme v plánu/kódu:**
- Tracking endpoints (`/track/o/:token`, `/track/c/:token`, `/t/click/:linkId`)
- Bot detection columns ready v `email_events`
- Cloudflare Workers proposed pro tracking pixel low-latency
- Per-link click counts API
- Device + email_client + IP + UA logged
- UTM auto-append

**Co chybí / co flow nepokrývá:**
1. **Kafka producer worker** chybí (events direct do ClickHouse přes API per finding §1.8). Fronta absence = burst-load risk.
2. **Branded tracking domain CNAME** routing (track.customerdomain.com → forgemsg) chybí pre URL signing.
3. **Per-link UTM customization** per campaign chybí (hardcoded utm_source=forgemsg).
4. **Per-link UTM passthrough** (preserve customer's existing UTM if exists) chybí.
5. **Open count throttling** (Apple MPP pre-fetches → 1 contact 10 opens v 1 second → 1 logged, 9 ignored) ne v plan.
6. **Click count dedup** (same contact clicks 5× v 5 sec → 1 unique click, 5 clicks).
7. **Geo IP lookup** chybí (MaxMind GeoLite2 bundle) → ip_address column je raw, no country/city derived.
8. **Engagement score real-time update** (event → push update na contact.engagement_score) — partial.

**Doporučení:**
- Kafka producer worker — batch insert events s 10s window + retry → ClickHouse, fallback do PG email_events for hot data
- Branded tracking domain implementation: `mailSubdomain` column already exists → CNAME wizard + URL signing
- Per-campaign UTM customization v campaign wizard
- Geo IP lookup: MaxMind bundle v container, lookup at event ingest, add `country, city` columns
- Engagement score: subscribe na Kafka → score update worker

### C.9 Reporting flow

**Krok 9:** per-campaign KPI → heatmap → device/ISP breakdown → revenue attribution → comparative reports

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Campaign analytics API (sent/delivered/opens/clicks/bounces/...)
- Time-series, per-link, devices, geo (raw IP)
- Click heatmap (Puppeteer + per-link data)
- Live dashboard
- Account dashboard
- Anomaly detection
- AI campaign summary (Claude Sonnet)

**Co chybí / co flow nepokrývá:**
1. **MPP-aware dual metric** (Raw opens vs Human opens) UI chybí — `botScore` data ready but not surfaced (P0 #15 EMAIL_DEEP_ANALYSIS).
2. **Geo IP enriched analytics** (country breakdown, top cities) chybí — only raw IP.
3. **Per-ISP placement** (Gmail inbox % vs spam %) chybí — `email_client` column ready, but no seed-list test infrastructure.
4. **Comparative reports** (campaign A vs B side-by-side) chybí — finding feature #80 unplanned.
5. **Cohort / retention curves** chybí — Opus #449 todo ale ne v plan body.
6. **Revenue attribution per campaign** (last-touch, 30-day window) — partial (MVT má totalRevenue, no per-campaign roll-up).
7. **Industry benchmarks** chybí (Mailchimp).
8. **CSV/XLSX export** chybí.
9. **Scheduled report email digest** chybí (Sonnet #447, #650 todo).
10. **Custom dashboard widgets** chybí (power-user).
11. **Per-tag / per-segment cohort analysis** chybí.
12. **Engagement score distribution** chybí.

**Doporučení:**
- Sprint 1: MPP-aware dual metric (P0 #15), Geo enrichment, CSV export, Comparative reports
- Sprint 2: Revenue attribution UI + per-campaign roll-up (depends on commerce integrations)
- Sprint 3: Scheduled report digest, Engagement score distribution
- Phase 7+: Cohort curves, Custom dashboards

### C.10 Re-engagement / win-back flow

**Krok 10:** graymail detection → sunset workflow → re-engagement series → suppress

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Graymail sweep (`/deliverability/graymail/sweep` + tags graymail/dormant/at_risk/engaged)
- Sunset workflow concept v finding (auto-suppress 90d non-engagers)
- Smart sending engine
- Frequency caps

**Co chybí / co flow nepokrývá:**
1. **Pre-built sunset workflow** v workflow gallery chybí (P0 deep analysis); jen `/sweep` endpoint klasifikuje, no automated workflow.
2. **Re-engagement series** template (3-email sequence s discount) chybí v pre-built recipes.
3. **Engagement score classifier** vs static sweep — kdy contact je "dormant" by score-based, ne by static rule.
4. **Win-back specific copy templates** (s emotional appeal, last-chance discount) chybí.
5. **Re-permission emails** (GDPR consent re-confirmation after 12 months) chybí — Sonnet #431, #643 (Consent expiration worker).
6. **Auto-suppression after re-engagement failure** logic chybí (engagement_score < threshold po 30 dní → auto-suppress).
7. **Re-engagement reports** (how many succeeded vs went to suppression) chybí.

**Doporučení:**
- Build pre-built workflow: "Sunset Series" → wait 7 days → email 1 (light "we miss you") → wait 14 days → email 2 (re-permission) → wait 14 days → if no engagement → auto-suppress + tag "graymail-suppressed"
- Re-engagement specific template pack (3-5 templates) v library
- Sunset by engagement score (rolling 90-day) místo static "90 dní žádný open"
- Consent expiration worker (Haiku #431, #643) → schedule re-permission emails 30 dní před expiration
- Re-engagement dashboard widget (rolling 30d success rate)

### C.11 Compliance flow

**Krok 11:** consent capture → preference center → granular opt-out → right-to-be-forgotten → audit log

**Stav:** ⚠️ Částečný (schemy heavy, UI light)

**Co máme v plánu/kódu:**
- Processing purposes schema (Sonnet #429, #641)
- Contact-purpose consent tracking (Sonnet #430, #642)
- Consent workflow triggers (Sonnet #433, #645)
- Consent expiration worker (Haiku #431, #643)
- Per-purpose preference centre (Sonnet #434, #646)
- Per-purpose double opt-in (Sonnet #435, #647)
- Purpose-aware send guardrail (Opus #432, #644)
- Suppressions cross-channel
- Audit logs (Sonnet #496)
- GDPR right-to-be-forgotten (planned, but no specific endpoint)

**Co chybí / co flow nepokrývá:**
1. **GDPR right-to-be-forgotten endpoint** (`/contacts/:id/delete-permanent` s confirmation + 30-day grace) chybí specific.
2. **GDPR right-to-data-portability** (export per contact in standard format) chybí — partial via /contacts/export.
3. **DPA template + sub-processor list** auto-generated chybí (compliance UX).
4. **Consent record per channel** (email opted-in vs SMS opted-in vs voice opted-in) — partial; suppressions cross-channel ale not opt-in granularity.
5. **GDPR consent timestamp preservation v migrations** chybí explicit (P0 finding #60 migration scénáře — critical).
6. **ePrivacy compliance** (cookie consent, opt-in pro tracking pixel) UI chybí.
7. **Audit log searchable UI** (kdo udělal co, kdy, IP) — schema ready, UI chybí.
8. **Compliance dashboard** (% kontaktů s valid consent, % s expired consent, % bez consent) chybí.
9. **Public preference center URL** (`/p/center/:token`) per kontakt → manage preferences anonymously bez login (finding P0 #12).
10. **Per-list opt-out** vs global unsubscribe — partial (suppressions je global; per-list opt-out chybí granular).

**Doporučení:**
- GDPR endpoints: `/contacts/:id/anonymize`, `/contacts/:id/export-data` (PII export), `/contacts/:id/delete-permanent`
- Preference center: public hosted page s per-purpose toggle (Sonnet #434)
- Consent record per channel: rozšířit `suppressions` schema o `opted_in` boolean per channel (separate from suppression reason)
- Audit log UI: searchable table s filters (user, action, resource, date range)
- Compliance dashboard widget na account dashboard

### C.12 Deliverability flow

**Krok 12:** domain auth wizard → DKIM rotation → IP warmup → FBL processing → reputation monitoring → DMARC enforcement

**Stav:** ⚠️ Částečný (engine layer strong, monitoring layer thin)

**Co máme v plánu/kódu:**
- Domain auth wizard UI (UI 3)
- DKIM signing + rotation schema (`fm1` → `fm2`)
- SPF/DMARC verification flags
- IP warmup engine (30-day schedule) + dedicated IPs schema
- Per-ISP throttling (Gmail/Microsoft/Yahoo/Other)
- FBL inbound (`/sending/fbl-inbound`, ARF parsing)
- DMARC aggregate report ingest
- Deliverability insights rules engine
- Email health score per org/domain/IP
- Anomaly detection
- Blacklist count column

**Co chybí / co flow nepokrývá:**
1. **CZ ISP FBL registration** missing — `isp-fbl.ts:5` enum nemá Seznam/Volny/Centrum (P0 #14 deep analysis).
2. **Postmaster Tools polling** (Gmail reputation, Microsoft SNDS) — webhook stub, no continuous polling (Sonnet #602, #354).
3. **Sender Score / RBL polling** (Spamhaus, Barracuda, SORBS) — `blacklistCount` col only, no automated polling.
4. **DKIM rotation scheduled job** chybí (90-day reminder + auto-rotate).
5. **DMARC policy timeline** (none → quarantine → reject progression) tracking chybí.
6. **DNS health monitor** (continuous check, alert on misconfiguration after live).
7. **BIMI/VMC** plan absent in plan body — finding mentions M priority.
8. **Branded tracking domain auto-CNAME** wizard chybí (P0 #11 deep analysis).
9. **MTA-STS / TLS-RPT** ne v plan (RFC 8460-style TLS reporting).
10. **AMP for Email MIME type build** v Go MTA chybí.
11. **Inbox placement test infrastructure** (seed-list, inbox vs spam % per ISP) chybí.
12. **Reputation public badge** per IP chybí (Sonnet #440 unplanned).

**Doporučení:**
- P0 sprint (před open beta): #1 (CZ FBL), #2 (Postmaster polling), #3 (RBL polling), #6 (DNS health monitor), #8 (branded tracking domain)
- P1 sprint: #4 (DKIM rotation cron), #5 (DMARC policy timeline), #7 (BIMI), #11 (inbox placement test via Litmus/EmailOnAcid integration)
- P2: #9 (MTA-STS), #10 (AMP for Email), #12 (public reputation badge)

### C.13 Migration flow

**Krok 13:** source select → connect → import audiences → import templates → import suppression → cutover guidance

**Stav:** ❌ Chybí (schema ready, connectors not built)

**Co máme v plánu/kódu:**
- Generic `migration_jobs` schema (`type` + progress JSONB)
- Mailchimp connector v Sonnet TODO (P0 #4 deep analysis) — schema-ready but ne implementováno
- HTML email → blocks importer (`/editor/html-to-blocks`)

**Co chybí / co flow nepokrývá:**
1. **Mailchimp connector** (audiences + campaigns + templates + automations + suppression) ne v plan body.
2. **Klaviyo connector** ne v plan body — finding P0 #4.
3. **Ecomail connector** ne v plan body — finding P0 #4 P1.
4. **SmartEmailing connector** ne v plan body — finding P0 #4 P2.
5. **Brevo connector** ne v plan body.
6. **Mailchimp `*|MERGE|*` syntax translation** (P0 #13 deep analysis) chybí.
7. **Klaviyo `{{ var | filter }}` syntax translation** chybí.
8. **Migration source dropdown** v onboarding wizardu chybí.
9. **Cutover guidance docs** (DNS switch, domain auth, IP warmup post-migration) chybí.
10. **GDPR consent timestamp preservation** v migrations (critical per finding 8).
11. **AI history preservation** (vs vendor-specific AI lock) per finding #60.
12. **Bulk template conversion** (HTML emails ze Mailchimp → Mailforge blocks) — endpoint exists, batch migration logic chybí.
13. **Suppression list import** (raw POST exists, ale ne s context preservation).
14. **Migration progress UI** (per-source wizard s steps: validate API key → fetch lists → fetch contacts → map fields → import templates → import suppression).
15. **Conflict resolution** (duplicate contacts: keep old vs keep new vs merge).
16. **Migration rollback** (if something goes wrong, undo).

**Doporučení:**
- Build 4 connectors first (Mailchimp, Klaviyo, Ecomail, SmartEmailing) — P0 #4 deep analysis (12 days estimate)
- Add `migration_type` enum: `mailchimp, klaviyo, ecomail, smartemailing, brevo, boldem, csv_generic`
- Source select v onboarding wizard (Krok C.1 doporučení)
- Public migration wizard: 7 steps (source → API key → validate → fetch summary → field mapping → preview → execute)
- Syntax translators for top 2 (Mailchimp `*|...|*`, Klaviyo handlebars `{{ var }}`)
- Cutover docs page (`/docs/migration-cutover`): DNS, IP warmup, domain auth, parallel sending strategy
- Migration progress real-time UI + email completion notification

### C.14 Subscription / billing flow

**Krok 14:** plan select → Stripe → tier change → usage tracking → overage handling

**Stav:** ⚠️ Částečný

**Co máme v plánu/kódu:**
- Plans schema + Stripe integration plan
- Stripe customer create + subscription create
- Usage-based reporting (email/sms count)
- Plan-change proration
- Overage handling
- Billing UI (UI 6)
- Pricing tiers (Free / Starter / Pro / Business / Enterprise)

**Co chybí / co flow nepokrývá:**
1. **Marketing Contact vs Non-Marketing Contact** distinction (HubSpot anti-pattern fix) — billing-related decision missing.
2. **Soft cap → email warning → manual upgrade** vs auto-upgrade (Constant Contact anti-pattern fix) — finding mention.
3. **EU VAT handling** (B2B reverse charge, EU OSS quarterly returns) chybí — finding #364 ISDOC export ale ne EU VAT specific.
4. **Multi-currency display** (CZK + EUR + USD) na pricing page — Opus #409 todo ale ne v plan body.
5. **Annual billing discount logic** (17% standard) chybí explicit.
6. **Multi-year prepay discount** (enterprise standard, 20-30%) chybí.
7. **Per-send pricing tier** (vedle subscription, Brevo-style) — finding P1 #538.
8. **Pay-as-you-go credit system** chybí — Sonnet #539.
9. **Multi-product metering** (Sonnet #540) chybí — pokud customer používá email + SMS + voice, jak je billing model?
10. **Plan downgrade flow** (kontakty over new limit → reduction wizard, soft suppression) chybí.
11. **Trial → paid conversion** flow + email reminders missing in plan.
12. **Failed payment recovery** (3 retries, then suspend) — partial.
13. **Account suspension flow** (overdue invoice → soft suspend → hard suspend → data retention) chybí.
14. **Customer self-service cancel** button (vs anti-pattern Constant Contact phone-only) — implicit but not explicit.
15. **ISDOC export pro CZ účetnictví** (Sonnet #364, #388, #613) v todo ale ne v plan body.
16. **SPAYD QR code** na invoices (Haiku #365, #614) — Czech payment QR.

**Doporučení:**
- Marketing Contact flag na contact: `is_marketing_contact BOOLEAN` (defaults to true, suppression sets to false), billing counts only marketing contacts (HubSpot model — finding anti-pattern fix)
- Soft cap: 80% limit → email warning, 100% → email "send paused, upgrade or wait next cycle"
- Multi-currency: detect country at signup → show prefered currency, store stripe_currency
- Annual discount: separate stripe_price_id per plan/billing-cycle
- ISDOC export endpoint + SPAYD QR generation per invoice
- Public cancel button v billing UI (finding anti-pattern)
- Failed payment: 1d / 3d / 7d → suspend; 30d → hard suspend; 90d → data deletion warning + final email

### C.15 Abuse / anti-spam flow

**Krok 15:** pre-send scan → list quality check → throttle on anomaly → auto-pause + alert

**Stav:** ✅ Kompletní v plánu (silnejší than competition)

**Co máme v plánu/kódu:**
- 13 abuse signal types
- 5 severities × 7 actions
- Rules s windowMinutes, minSampleSize
- Abuse events + sanctions tables (s expiresAt + throttle rate/hour)
- Spam-trap detection (SHA-256 hash, 4 types)
- Spam-trap hits log
- Pre-send content moderation (Claude Haiku)
- Pre-send tips (Claude Sonnet)
- Spam check + link check + accessibility check
- Anomaly detection (cron hourly)
- Frequency rules
- Smart sending
- Quiet hours
- Health score per org/domain/IP

**Co chybí / co flow nepokrývá:**
1. **List quality pre-import scoring** (před importem: sample 100 → predict deliverability) chybí.
2. **Pre-send dashboard unified panel** chybí (Boldem-style consolidated Go/No-Go check) — individual checks exist, no rolled-up view.
3. **Doručovací historie cross-org check** při importu (spam-trap protection via anonymized hash, finding §B.1 #53).
4. **Auto-pause during send on anomaly** chybí v worker logic — sanctions exist but during send fires async.
5. **Engagement score-based abuse detection** chybí (low engagement v big batch → throttle).
6. **Account suspension UI flow** (admin tool to suspend abusive accounts) chybí.
7. **Customer-facing abuse explanation** (when account is throttled, customer sees clear reason) — sanctions schema má reason field but UI flow chybí.
8. **Appeal flow** (customer can request review of sanction) chybí.

**Doporučení:**
- Pre-import quality score: sample-based (100 rows): MX rate + syntax rate + disposable % → score 0-100 + recommend purge before import
- Pre-send unified dashboard ("Pre-send Check Panel"): 10-item checklist with red/yellow/green status before send
- Cross-org spam-trap protection: anonymized hash table + check at import (anonymized z platform-wide bounce signals)
- Auto-pause: integrate abuse sanctions check synchronously into batch-sender → if `volume_spike` triggered during send → pause campaign
- Engagement-based abuse: rule "low_engagement_send" (kontakty s engagement_score < 20 v batch > 70% = throttle)
- Admin UI: account-level abuse view + suspension action + appeal log

### C.16 Souhrn flow audit

| # | Flow | Stav |
|---|------|------|
| C.1 | Onboarding | ⚠️ Částečný |
| C.2 | List building | ⚠️ Částečný |
| C.3 | Contact management | ⚠️ Částečný |
| C.4 | Segmentation | ⚠️ Částečný |
| C.5 | Template management | ⚠️ Částečný |
| C.6 | Campaign creation | ⚠️ Částečný |
| C.7 | Sending | 🛠️ V kódu ale neflow-uje |
| C.8 | Tracking | ⚠️ Částečný |
| C.9 | Reporting | ⚠️ Částečný |
| C.10 | Re-engagement / win-back | ⚠️ Částečný |
| C.11 | Compliance | ⚠️ Částečný |
| C.12 | Deliverability | ⚠️ Částečný |
| C.13 | Migration | ❌ Chybí |
| C.14 | Subscription / billing | ⚠️ Částečný |
| C.15 | Abuse / anti-spam | ✅ Kompletní (edge) |

**TOP 5 nejméně připravené flows:**

1. **C.13 Migration** — ❌ Chybí. Schema ready, ale žádný connector ne v plan body. **CZ launch blocker:** žádný customer nemůže přejít z Mailchimp/Klaviyo/Ecomail/SmartEmailing → akviziční friction velký.

2. **C.7 Sending** — 🛠️ V kódu ale neflow-uje. gRPC bridge HTTP stub, block render path nepřipojen, CZ ISP throttle missing, plain-text auto-derive missing, branded tracking domain missing. **Production risk pre-launch.**

3. **C.1 Onboarding** — ⚠️ Velmi prázdný plán: wizard má 5 kroků, ale chybí industry/size/migration_source dropdowns, AI brand kit z URL, "Live" checklist, Entri auto-DNS partnership. **First-impression conversion gap.**

4. **C.6 Campaign creation** — ⚠️ Wizard má 4 kroky bez type-select (Regular vs A/B vs MVT vs Re-send vs RSS). Auto-resend config chybí. Smart-send-time integrace chybí. **Killer feature integration gap.**

5. **C.11 Compliance** — ⚠️ Schemy heavy (consent, purposes, audit logs) ale UI flow tenký. Public preference center chybí, GDPR delete endpoint chybí, per-channel consent records chybí. **GDPR risk pre-launch v EU.**

---

## Část D — Klíčové insights

### D.1 TOP 10 nejhodnotnějších UNPLANNED features

Z části B.1, výběr 10 s největším impact-vs-effort poměrem:

| Rank | Feature | Priority | Estimate | Impact |
|------|---------|----------|----------|--------|
| 1 | **Resend campaign to non-openers** (B.1 #3) | H | 3 dny | "Switch from Ecomail" killer; +10-30% open rate compounding |
| 2 | **Site-tracking JS snippet** (B.1 #87) | H | 5-7 dnů | Mandatory enablér pro browse abandonment + identity resolution + form autofill + dynamic content; whole-platform multiplier |
| 3 | **Pre-built workflow gallery 50+ recipes** (B.1 #73) | H | 3 týdny | Cold-start blocker; ActiveCampaign 900+, Mailforge má 4-5; SMB conversion |
| 4 | **CZ kalendář jmenin + svátků workflow trigger** (B.1 #7) | H | 1 týden | CZ/SK SMB baseline (Sonnet #360 lying unused); marketing differentiator |
| 5 | **Per-recipient unique coupon code generation** (B.1 #8) | H | 3-4 dny | CZ e-shop kritická; vyhne se "promo code abuse"; integruje se s Shoptet/Upgates |
| 6 | **Predictive metrics native (CLV/Churn/Next Order Date)** (B.1 #4) | H | 4 týdny | Klaviyo's #1 selling point; Mailforge bez nich vypadá jako "Mailchimp clone"; Claude API draft → ML later |
| 7 | **RFM auto-cohorts** (B.1 #5) | H | 2 týdny | Champions/At Risk pre-built segmenty hned; ClickHouse view + UI templates |
| 8 | **Inbox preview via Litmus bridge** (B.1 #1) | H | 2-3 dny + API | Mailchimp/Klaviyo/MailerLite to nemají; premium trust signal pro pre-send confidence |
| 9 | **Plain-text auto-derivation** (B.1 #94) | H | 1-2 dny | Deliverability mandatory — Gmail/Yahoo požaduje multipart/alternative; finding §1.3 zmiňuje chybí |
| 10 | **Pre-built sending domain quality checker** (B.1 #76) | M-H | 2 dny | Onboarding cold-start success; vede customer od signup k first send 3× rychleji |

**Cumulative impact:** ~10 týdnů parallel work; potential to lift product perception z "Mailchimp clone" → "CZ-native Klaviyo".

### D.2 TOP 5 nejnaléhavějších flow gaps

| Rank | Flow | Gap | Why urgent |
|------|------|-----|------------|
| 1 | **C.7 Sending** | gRPC bridge + block render + CZ ISP throttle + plain-text auto-derive + branded tracking | Production launch blocker — bez těchto pieces engine je "dev stub", ne production-ready. |
| 2 | **C.13 Migration** | 4 connectors (Mailchimp/Klaviyo/Ecomail/SmartEmailing) | CZ launch acquisition blocker — žádný customer nepřejde "manually re-create everything"; bez connectors customer churn z konkurence není možný. |
| 3 | **C.1 Onboarding** | Industry/size/source dropdowns, AI brand kit, Entri auto-DNS, Live checklist | First-impression conversion gap — bez personalization Mailforge vypadá jako "any tool". |
| 4 | **C.11 Compliance** | Public preference center, GDPR delete endpoint, per-channel consent, audit log UI | EU GDPR risk pre-launch — bez těchto features Mailforge nemůže legálně přijmout enterprise klienta v EU. |
| 5 | **C.4 Segmentation** | Dynamic vs static, predictive metrics filter, RFM cohort templates, AI segment optimization | Power-user gap — schema ready, UI shallow; competitive parity gap vs Klaviyo. |

### D.3 Strategická doporučení

#### Insight 1: Mailforge má enterprise-class architekturu, ale SMB-tier polish

Mailforge má **schemy a engine bonton enterprise** (Bloomreach-class: abuse-detection s 13 signals, MVT s revenue, holdout, FBL, DKIM rotation, IP pools, deliverability rules engine). Ale **production-facing wiring je SMB-tier**: gRPC stubbed na HTTP, render path partial, migration connectors none, preference center missing. **Doporučení:** P0 work je "finish what's started" ne "build more schemas". Před dalšími fázemi: **3-week sprint na C.7 Sending + C.13 Migration + C.11 Compliance**. Tím Mailforge přejde z "looks great in code review" → "actually works in production".

#### Insight 2: Vertikální focus dává Mailforge moat — neaspirovat na Klaviyo-DTC ani Mailchimp-generic

Analyza 27 platforem ukazuje, že **každý úspěšný hráč má vertikální focus** (Klaviyo = DTC Shopify; Constant Contact = US nonprofits/events; Inxmail = DACH B2B; Mailkit = CZ transactional; SAP Emarsys = retail). Mailforge se snaží "omnichannel + AI + EU + CZ + open source = unique 5-tuple" (per finding §4.6). To je correct vertikální focus, ale **musí být vidět v product UI**, ne jen v positioning page. **Doporučení:** UI 0 design system + first templates + onboarding všechno **musí mít** CZ flavour (názvy průmyslů Czech, jmeniny widgets, primary fonts pro česká diakritika, branded tracking domain examples z .cz domén). První 50 templates: 80% CZ-specific (Vánoce, jmeniny, fitness studia, e-shop CZ).

#### Insight 3: Open-sourcing engine je product strategy, ne marketing tactic

Finding §4.4 zmiňuje open-source Go MTA jako moat. **Tohle není ne marketing — je to product strategy**. Resends.com (US Rust MTA, AGPL) je rapidly growing developer community kolem jejich infra; Postal (Ruby MTA, MIT) má 17k GitHub stars. **Mailkit's lock-in (closed CZ infra) je důvod, proč 14% G2 reviews kritizuje "old UI"** — protože developers neumí kontribuovat. Pro Mailforge:
- Extrahovat `apps/engine/` do separate GitHub repo s MIT license (ne AGPL — méně friction)
- Publikovat blog post "Why we open-sourced our email engine" (CZ + EN)
- Add "Powered by Mailforge Engine — open source MTA" badge na emails
- Hire-multiplier: developers s nimi GitHub-known kontribute → recruiting pool

**Risk vyhodnocení:** Mailkit/Ecomail nemají kapacitu kompetovat na open-source layer pomocí closed dev orgs; engine je core-MTA + ISP routing, ne celá Mailforge stack (forms, editor, automation, billing zůstávají proprietary).

#### Insight 4: AI features musí být cached aggressively, ne metered

Klaviyo Customer Agent $140-200/mo add-on, Salesforce Agentforce premium tier — to jsou anti-pattern (per finding anti-positioning). **Mailforge má technické předpoklady pro "AI included, no usage caps"**:
- Claude Haiku ($1/$5 per MTok) — at scale 10k customers × 50 AI calls/month × 1000 tokens avg = 500M tokens × $1/MTok = $500/month = $0.05/customer/mo
- Aggressive prompt caching (per-system-prompt + per-org context) → ~70% cache hit → $150/mo
- Anthropic Batch API 50% discount na non-real-time work (campaign post-summary)

**Doporučení:** AI included in Free + Starter + Pro + Business; soft cap (AI calls/day) ne hard cap. Marketing: **"AI included — no usage caps"** je customer-friendly positioning vs Klaviyo. Backend: aggressive Redis cache + Batch API for everything non-realtime.

#### Insight 5: Migration tool je #1 akviziční hook — ne feature

Finding §60 zmiňuje 6 P0 migration importers (Mailchimp, Klaviyo, Ecomail, SmartEmailing, Brevo, Boldem). **Toto není feature — je to akviziční hook**. V SaaS competitive market kde každý SMB má existing ESP, **migration friction je hlavní conversion barrier**. Mailforge ROADMAP má jen Mailchimp connector v Phase 6 — to je 6 měsíců po Phase 0 start. **Doporučení:**
- Migration musí být **Phase 6 P0, ne P1** — paralel z core development
- 4 connectors do open beta launch (Mailchimp, Klaviyo, Ecomail, SmartEmailing) — toto je důvod, proč customer kliká na "Sign up"
- Migration page jako primary landing page (`/migrate-from-mailchimp`, `/migrate-from-klaviyo`, `/migrate-from-ecomail`)
- SEO-targeted: "How to switch from Mailchimp to Mailforge" blog posts (10 articles)
- Free guided migration concierge call pro first 50 customers (high-touch akvizice)

---

*Dokument vytvořen: 2026-05-18*
*Konsolidováno z FORGEMSG_ROADMAP.md (901 řádků) + todonow.md (316 úkolů) + EMAIL_DEEP_ANALYSIS.md + MAILFORGE_FINDING_REPORT.md + POZICOVANI.md + TECH_STACK.md + `data/01-60` (60 souborů, 27 platforem).*
*Status: pracovní podklad pro Mailforge email layer roadmap revize před Phase 9 (closed beta) sign-off.*
