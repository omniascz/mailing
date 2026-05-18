# Mailforge — Master Action Plan

> Konsolidovaný plán z 4 dokumentů: EMAIL_DEEP_ANALYSIS, MAILFORGE_FINDING_REPORT, UNPLANNED_FEATURES_AND_FLOW_AUDIT, POZICOVANI
> Vytvořeno: 2026-05-18
> Status: pracovní; aktualizovat po každém sprintu
> Sourcing: prioritizováno na **email layer** (omnichannel je sekundární)

---

## TL;DR — co budu dělat dál

**Sekvence:**
1. **Diagnostický audit kódu** (HOTOVO 2026-05-18 — viz `DIAGNOSTIC_AUDIT_REPORT.md`)
2. **Sprint A — Fix-what-broke** (1 týden) — `mcp-server` tsconfig fix, install Go SDK, git working tree cleanup, commit migrations
3. **Sprint B — Sending Flow finish** (2 týdny) — gRPC bridge, block render path, CZ ISP throttle, plain-text auto-derive, branded tracking
4. **Sprint C — Migration connectors** (3 týdny) — Mailchimp + Klaviyo + Ecomail + SmartEmailing
5. **Sprint D — Compliance UI** (2 týdny) — public preference center + GDPR endpoints + audit log UI + per-channel consent
6. **Sprint E — UNPLANNED P0 features** (10 týdnů) — viz §3 níže
7. **Sprint F — Onboarding overhaul** (2 týdny) — industry/size, AI brand kit, Entri auto-DNS, "Live" checklist
8. **Sprint G — Templates + Workflow gallery** (5 týdnů) — 50 CZ templates + 50 workflow recipes
9. **Sprint H — Beta launch + first 50 klients** (4 týdny)

**Celkový horizon do open beta: ~30 týdnů (~7 měsíců) solo + Claude.**

---

## §1 — Sprint A: Fix-what-broke (Týden 1)

**Cíl:** uvést projekt do clean-buildable stavu.

| # | Akce | Estimate | Soubory |
|---|---|---|---|
| A.1 | **Fix `mcp-server` build failure** — `apps/mcp-server/tsconfig.json` extenduje `../../tsconfig.json`, ale root má jen `tsconfig.base.json`. Změnit extend path. | 5 min | `apps/mcp-server/tsconfig.json` |
| A.2 | **Install Go 1.23+ SDK** lokálně (Windows) — winget install GoLang.Go, ověřit `go version` ≥ 1.23 | 15 min | systémové |
| A.3 | **Buildnout `apps/engine` a `apps/sms-gateway`** s nainstalovaným Go — zachytit chyby pokud jsou | 30 min | `apps/engine/`, `apps/sms-gateway/` |
| A.4 | **Spustit `go test ./...`** v obou Go appkách | 15 min | — |
| A.5 | **Commit Drizzle migrations 0001-0058** — 58 untracked SQL migrations v `apps/api/drizzle/` | 30 min | `apps/api/drizzle/*.sql` |
| A.6 | **Commit nebo zahodit modifikace v 39 souborech** working tree — projít po jednom, rozhodnout. | 2 hodiny | viz `git status` |
| A.7 | **Smazat orphaned `apps/number-intel/`** (3 souborů marked D v git) — git rm + commit | 5 min | `apps/number-intel/` |
| A.8 | **Commit 4 nové workflow YAML soubory** v `.github/workflows/cd.yml`, `db-migrations.yml`, `infra-plan.yml` (untracked) | 15 min | `.github/workflows/` |
| A.9 | **Commit 5 nových markdown dokumentů** (EMAIL_DEEP_ANALYSIS, MAILFORGE_FINDING_REPORT, POZICOVANI, TODO, UNPLANNED_FEATURES_AND_FLOW_AUDIT, ACTION_PLAN, DIAGNOSTIC_AUDIT_REPORT) | 5 min | root |
| A.10 | **Rerun `pnpm build` na clean stavu** — ověřit že všechny packages projdou | 10 min | — |
| A.11 | **Rerun `pnpm test` na clean stavu** + zachytit final pass count | 10 min | — |
| A.12 | **Commit "chore: clean working tree + fix mcp-server build"** | 5 min | git |

**Sprint A doba: ~5 hodin reálného work.**

---

## §2 — Sprint B: Sending Flow finish (Týden 2–3)

**Cíl:** dotáhnout C.7 Sending flow na production-ready (per UNPLANNED_FEATURES_AND_FLOW_AUDIT C.7 a EMAIL_DEEP_ANALYSIS Část 5).

| # | Akce | Estimate | Soubory |
|---|---|---|---|
| B.1 | **gRPC bridge worker → engine** — replace HTTP fallback v `mta-sender.ts:42` skutečným `@grpc/grpc-js` clientem | 3 dny | `apps/workers/src/jobs/mta-sender.ts`, `apps/engine/proto/mta_grpc.pb.go` |
| B.2 | **Block-render path v batch-sender** — call `apps/editor/render` pro full block JSON instead of `content.html` string | 2 dny | `apps/workers/src/jobs/batch-sender.ts:182-200`, workspace dep `@forgemsg/editor` |
| B.3 | **Extend `IspName` type pro Seznam/Volny/Centrum** + Redis throttle bucket | 1 den | `apps/api/src/services/sending/isp-throttle.ts:28`, `apps/workers/src/jobs/mta-sender.ts:214` |
| B.4 | **CZ ISP enum v isp-fbl.ts** — přidat `seznam`, `volny`, `centrum` do ispEnum | 0.5 dne | `apps/api/src/db/schema/isp-fbl.ts:5-12`, drizzle migration |
| B.5 | **Plain-text auto-derivation v render engine** — z block JSON automaticky generate plain-text version pro multipart/alternative | 1.5 dne | `apps/editor/src/render/render.ts`, `apps/engine/internal/smtp/sender.go` |
| B.6 | **Branded tracking domain auto-CNAME wizard** — `mailSubdomain` v `sendingDomains` už existuje, postavit UI + URL signing | 4 dny | `apps/api/src/routes/v1/domains.ts`, `apps/api/src/routes/v1/tracking.ts`, `apps/web/.../domain-wizard` |
| B.7 | **Unify merge-tag implementations** — drift mezi editor's merge-tags.ts a worker inline regex | 1 den | `apps/workers/src/jobs/batch-sender.ts:157`, `apps/editor/src/render/merge-tags.ts` |
| B.8 | **In-process Drizzle queries v batch-sender** — replace fetch-via-internal-API (`fetchContacts`, `checkSuppression`, `checkFrequencyCap`, `recordFrequencySend`) | 2 dny | `apps/workers/src/jobs/batch-sender.ts:207-254` |
| B.9 | **Per-recipient time-warp slicing** v worker logic — campaign-splitter dělí batche per timezone | 1.5 dne | `apps/workers/src/jobs/campaign-splitter.ts`, `timewarp-scheduler.ts` |
| B.10 | **Holdout group enforcement** v sending flow — worker checkuje "skip if contact is in holdout" | 0.5 dne | `apps/workers/src/jobs/batch-sender.ts` |

**Sprint B doba: ~17 dnů = ~3.5 týdne reálného work.**

---

## §3 — Sprint C: Migration connectors (Týden 4–6)

**Cíl:** dotáhnout C.13 Migration flow z ❌ na ✅ (per UNPLANNED §C.13).

| # | Akce | Estimate | Files |
|---|---|---|---|
| C.1 | **Migration source select** v onboarding wizardu | 1 den | `apps/api/src/routes/v1/onboarding.ts`, web UI |
| C.2 | **Mailchimp connector** — audiences + contacts + templates + automations + suppression import + `*\|MERGE\|*` syntax translator | 5 dnů | new `apps/api/src/services/migrations/mailchimp.ts` + worker |
| C.3 | **Klaviyo connector** — lists + segments + flows + templates + suppression + `{{ var \| filter }}` handlebars translator | 5 dnů | new `apps/api/src/services/migrations/klaviyo.ts` |
| C.4 | **Ecomail connector** — kontakty + kampaně + scénáře + Shoptet/Mergado integration data | 4 dny | new `apps/api/src/services/migrations/ecomail.ts` |
| C.5 | **SmartEmailing connector** — kontakty + GDPR consent records + custom data structures + Sklik audience | 4 dny | new `apps/api/src/services/migrations/smartemailing.ts` |
| C.6 | **Migration wizard UI** — 7 steps (source → API key → validate → fetch summary → field mapping → preview → execute) | 4 dny | `apps/web/app/onboarding/migrate/` |
| C.7 | **GDPR consent timestamp preservation** napříč všemi importy — povinný field mapping | 1 den | shared lib |
| C.8 | **Migration progress real-time UI** + WebSocket | 2 dny | `apps/web/.../migration-progress` |
| C.9 | **Migration rollback** capability — pokud něco selhá | 1 den | shared lib |
| C.10 | **Cutover guidance docs** (`/docs/migration-cutover`) — DNS, IP warmup, domain auth, parallel send | 2 dny | content |

**Sprint C doba: ~29 dnů = ~5 týdnů reálného work** (paralelizovatelné: 3 connectory soubežně).

---

## §4 — Sprint D: Compliance UI (Týden 7–8)

**Cíl:** dotáhnout C.11 Compliance flow z ⚠️ na ✅ (per UNPLANNED §C.11).

| # | Akce | Estimate |
|---|---|---|
| D.1 | **Public preference center** `/p/center/:token` — per-purpose toggle, multi-language, anonymous access | 4 dny |
| D.2 | **GDPR right-to-be-forgotten endpoint** `/contacts/:id/delete-permanent` s confirmation + 30-day grace | 1 den |
| D.3 | **GDPR right-to-data-portability** `/contacts/:id/export-data` (PII export ve standard formátu) | 1 den |
| D.4 | **Per-channel consent records** — rozšířit `suppressions` schema o `opted_in` boolean per channel | 1 den + migration |
| D.5 | **DPA template + sub-processor list** auto-generated stránky | 2 dny |
| D.6 | **Audit log searchable UI** — filters (user, action, resource, date range) | 2 dny |
| D.7 | **Compliance dashboard widget** na account dashboard (% kontaktů s valid consent, % expired, % bez) | 1 den |
| D.8 | **ePrivacy tracking pixel opt-in** flow pro EU | 1 den |
| D.9 | **Per-list opt-out** vs global unsubscribe — granular flag | 1 den |

**Sprint D doba: ~14 dnů = ~3 týdny.**

---

## §5 — Sprint E: UNPLANNED P0 features (Týden 9–18)

Z UNPLANNED_FEATURES_AND_FLOW_AUDIT §D.1 — TOP 10 nejhodnotnějších UNPLANNED features.

| Rank | Feature | Estimate | Sprint |
|------|---|---|---|
| E.1 | **Resend campaign to non-openers** native | 3 dny | E.1 |
| E.2 | **Site-tracking JS snippet** (page views, custom events, identity resolution) | 7 dnů | E.1 |
| E.3 | **Pre-built workflow gallery 50+ recipes** | 15 dnů | E.2 |
| E.4 | **CZ kalendář jmenin + svátků** jako workflow trigger | 5 dnů | E.2 |
| E.5 | **Per-recipient unique coupon code generation** (Shoptet/Upgates pool) | 4 dny | E.3 |
| E.6 | **Predictive metrics native** (CLV / Churn / Next Order Date) — Claude API draft + ML later | 20 dnů | E.3 |
| E.7 | **RFM auto-cohorts** (Champions/At Risk/Lost/Hibernating) v ClickHouse materialized view + UI | 10 dnů | E.4 |
| E.8 | **Inbox preview via Litmus / EmailOnAcid bridge** | 3 dny | E.4 |
| E.9 | **Plain-text auto-derivation** (už v Sprint B) | (B.5) | — |
| E.10 | **Pre-built sending domain quality checker** | 2 dny | E.5 |

**Sprint E doba: ~70 dnů = ~10 týdnů.**

---

## §6 — Sprint F: Onboarding overhaul (Týden 19–20)

**Cíl:** dotáhnout C.1 Onboarding flow (per UNPLANNED §C.1).

| # | Akce | Estimate |
|---|---|---|
| F.1 | Industry + business size dropdown v step 1 (drives template recs) | 1 den |
| F.2 | Migration source select v step 2 (paralelní migration job) | 1 den |
| F.3 | Domain auth s Entri auto-DNS partnership ($0.05/setup) | 3 dny |
| F.4 | AI brand kit auto-extract z customer URL (Claude Sonnet vision) | 4 dny |
| F.5 | Form-or-import-or-skip 3-cesta volba | 1 den |
| F.6 | Pre-built recipe gallery picker | 1 den |
| F.7 | "Live" checklist gate (domain verified + 1 contact + 1 template + warmup config) | 1 den |
| F.8 | Onboarding completion analytics (per-step time, drop-off) | 1 den |

**Sprint F doba: ~13 dnů = ~3 týdny.**

---

## §7 — Sprint G: Templates + Workflow gallery (Týden 21–25)

**Cíl:** SMB cold-start je dnes brutální — bez templates a recipes není akvizice.

| # | Akce | Estimate |
|---|---|---|
| G.1 | **50 CZ-localized email templates** napříč verticals: e-shop (15), fitness (8), eventy (8), restaurace (5), B2B SaaS (8), nonprofit (3), seznam (3) | 15 dnů (s Claude) |
| G.2 | **50+ workflow recipes** napříč verticals: welcome series, cart abandon, browse abandon, post-purchase, birthday, jmeniny, win-back, re-engagement, sunset, replenishment, lead nurture, … | 15 dnů |
| G.3 | **Template version history** + forked-from tracking | 2 dny |
| G.4 | **Public template gallery** s `isPublic` filter + thumbnails | 3 dny |
| G.5 | **Workflow JSON export/import** + marketplace seed | 3 dny |

**Sprint G doba: ~38 dnů = ~8 týdnů** (heavy content work, parallelizable s designerem).

---

## §8 — Sprint H: Beta launch (Týden 26–30)

| # | Akce | Estimate |
|---|---|---|
| H.1 | **Hetzner + Vercel infrastructure setup** per `infra/PIVOT_AWS_TO_HETZNER.md` (Týden 2.5 Akční plán) | 5 dnů |
| H.2 | **Beta klient identification** — 30-50 lidí z PulseUp + Ticketarium network + LinkedIn | 3 dny |
| H.3 | **Onboarding concierge calls** s prvními 20 beta klienty | 10 dnů |
| H.4 | **Production smoke test** — send 10K email kampaní přes celý pipeline | 2 dny |
| H.5 | **Status page** (`status.mailforge.io`) Instatus setup | 1 den |
| H.6 | **Public pricing page** s CZK/EUR/USD multi-currency | 2 dny |
| H.7 | **Migration landing pages** `/migrate-from-mailchimp`, `/migrate-from-ecomail`, `/migrate-from-smartemailing` | 3 dny |
| H.8 | **10 SEO blog posts** ("How to switch from X to Mailforge") | 10 dnů (Claude content) |
| H.9 | **Documentation hub** (Mintlify nebo Docusaurus) | 5 dnů |
| H.10 | **Critical incident response** během prvního týdne beta | ongoing |

**Sprint H doba: ~41 dnů = ~8 týdnů.**

---

## §9 — Backlog: P1 features pro post-beta (5+ měsíců)

Z MAILFORGE_FINDING_REPORT §2.2 P1 + UNPLANNED_FEATURES_AND_FLOW_AUDIT §B.1 priority M:

**B.1 P1 features (~30 položek):** Channel Scoring per recipient, AMP for Email native, Audience sync Meta/Google/TikTok/Sklik, Web personalization module, Identity resolution L2-L3, Reviews collection module, Digital Products + Paid Newsletters, Customer Hub, Surveys & Quizzes, RSS auto-campaigns, GDPR evidence audit log per kontakt, Pre-send unified Go/No-Go panel, Engagement Score proprietary, Sub-account hierarchy, Replenishment ML, Slovak localization, DACH compliance kit, Pay-per-send tier, B2B vs B2C playbook split, Connected Content / Liquid HTTP fetch, React Flow workflow canvas s heatmap debugger, Sentiment Analysis 1:1 replies, Bulk coupon zásobník, Relational Custom Data Structures, Site Messages, Reverse ETL, Webinars integrace (Twilio/Daily), Polish ISP pool + lokalizace, Funnel builder.

**B.1 P1 features unplanned (~28 položek):** Multi-step progressive forms, Exit-intent triggers, Form impression frequency cap, Locale auto-detect, Connected Content, Quiz/Survey block, Preference center hosted, Time-zone profile property, Activity timeline, Branded preview link, List warming, Entri auto-DNS, rDNS UI exposure, Bounce category UI, Per-ISP placement reports, Reputation badge, Subject preview real-device, Emoji whitelist, Resend-to-non-clickers, Smart drip pacing, Auto-pause anomaly, DKIM rotation reminder, DNS health monitor, Multi-account/agency, Email change-of-address, Multi-email per contact, Activity export bulk, Email validation pre-import, Catalog feed bi-sync, Survey response auto-action, Per-link UTM customization, Webhook HMAC signature, Inbound IMAP parsing, AI segment cleanup, Holdout lift reports, Lookalike audience, Cross-channel frequency cap, Send-after-conversion suppression, Multi-language mutations, Geo-targeted send.

---

## §10 — Backlog: P2 features (Phase 7+ / Year 2)

Enterprise scope, defer indefinitely until Year 2+:
- Custom Objects / Data Extensions (HubSpot Enterprise-style)
- Multi-touch revenue attribution s linear/position/time-decay/custom models
- Reinforcement learning A/B (multi-armed bandit)
- Conversational natural-language campaign builder
- Cross-journey orchestration + frequency caps cross-workflow
- Hierarchical teams / partitioning per asset
- Field-level / property-level security
- Sandbox environments
- Mobile SDK (iOS + Android + React Native)
- Loyalty Cloud full engine (tiers/points/rewards)
- Predictive Lead Scoring s trained model
- Zero-copy DWH triggers (Snowflake / BigQuery)
- AI Agent Console / Custom AI agents in workflow steps
- WhatsApp Commerce / 2-way conversations
- Industry-specific playbooks per vertical (retail / fashion / B2B SaaS / nonprofit / events)
- AI Content QA / brand voice consistency checker
- SQL Query Builder s AI assistant nad event store
- Mobile push provisioning (FCM/APNs/VAPID)
- BIMI configurable
- Webinars native engine
- Event registration + ticketing (cross-link s Ticketarium)
- HIPAA mode (US healthcare) — SKIP
- FedRAMP — SKIP

---

## §11 — Anti-patterns to avoid (z TCO + migration analýz)

Zachovat v product strategy:

| Anti-pattern | Mailforge alternativa |
|---|---|
| Event-based pricing (Bloomreach) | Per-contact + per-send hybrid s capped overage |
| Auto-upgrade na vyšší tier (Constant Contact) | Soft cap → email warning → manual upgrade prompt |
| Premier Success 30% add-on (Salesforce) | Support included v base price |
| Cancellation phone-only (Constant Contact) | Self-service cancel button visible |
| AI jako separate tier (Salesforce Agentforce) | AI included napříč tiers s usage cap |
| All contacts incl. unsubscribed v billing (Klaviyo) | Marketing Contact vs Non-Marketing flag (HubSpot model) |
| Per-seat pricing (HubSpot Pro+) | Unlimited seats v paid tieres |
| Mandatory $3K onboarding fee (HubSpot Pro+) | Self-service onboarding + optional paid concierge |
| Sales-only pricing (Targito/Leadhub/SALESmanago/Bloomreach) | Public pricing až do Enterprise tier |
| Vendor-specific AI lock-in (Klaviyo/Bloomreach) | Foundation models (Claude) + portable per-org context |
| AMPscript proprietary language (Salesforce) | Liquid (industry standard) + optional SSJS escape hatch |
| 5 oddělených produktů (Brevo) | Unified product s modular toggles |
| Per-message SMS markup | Transparent pass-through + 2× markup, žádný monthly SMS fee |
| EU "data center selection" jako paid feature | EU data residency default na všech tieres |

---

## §12 — White space opportunities (TOP 7 unikátů)

Z MAILFORGE_FINDING_REPORT §4 — kde žádný z 27 konkurentů neexceluje:

1. **AI voice agent jako kampaňový kanál** (outbound voice s Claude + ElevenLabs) — stack hotov v `apps/voice-bot`
2. **CZ/SK hluboká lokalizace** (skloňování + gender + jmeniny + svátky + Sklik) **s globální feature parity** — i18n packages existují
3. **Low-code app-studio user-extensible moduly** — schema `app_studio` existuje
4. **AI agents jako first-class entity v Claude pricing tier** (Sonnet 4.6 + Haiku 4.5 included) — framework + MCP hotový
5. **EU-sovereign omnichannel s vlastním Go MTA + 9 channel adapters** — MTA engine 1 733 řádků Go
6. **Unified omnichannel s shared frequency cap** napříč voice/SMS/email/WhatsApp/push — adapter pattern hotový
7. **Booking + Calendar + Scheduling v messaging platform** — schemas hotové, UI integration TODO

---

## §13 — Open questions (k rozhodnutí před open beta)

- [ ] **Final brand name**: Mailforge vs ForgeMsg vs nové
- [ ] **Voice robot v MVP** nebo až Vlna 2? Production wire-up ~4 týdny
- [ ] **HLR lookup** reaktivovat?
- [ ] **App-studio runtime engine** priorita — killer feature ale 6+ týdnů work
- [ ] **Kdy z Coolify na k3s?** Phase 5 nebo 7?
- [ ] **CSA membership** (DE deliverability) €1500-3000/rok — ROI viable jen po DACH launch
- [ ] **Open-source Go MTA** license — MIT (recommended) vs AGPL
- [ ] **Reseller program** — kdy spustit, rev-share (Mailgun 30%/10% / Klaviyo 15%)
- [ ] **ISO 27001 timeline** — Year 1 nebo Year 2? €20-50k jednorázově + €15k/rok audit
- [ ] **Standalone Postmark-class "Mailforge Send"** — vyextrahovat MTA jako transactional API ($35-99/mo)?
- [ ] **B2B vs B2C playbook split** — dva default templaty (B2B lead nurture vs B2C e-shop). Kdy?
- [ ] **Working tree cleanup decision per soubor** — co commitnout vs zahodit (39 souborů)

---

## §14 — Měření úspěchu

**Sprint A (po týdnu 1):**
- ✅ `pnpm build` 9/9 packages PASS
- ✅ `go build ./...` v engine + sms-gateway pass
- ✅ `git status` clean
- ✅ Všechny dokumenty committed

**Sprint B–D (po týdnu 8):**
- ✅ Production end-to-end send funkční přes gRPC engine
- ✅ Migration z Mailchimpu funkční pro 100k kontaktů
- ✅ Public preference center live

**Sprint E–G (po týdnu 25):**
- ✅ TOP 10 P0 features live
- ✅ 50 CZ templates v gallery
- ✅ 50 workflow recipes v gallery
- ✅ Onboarding wizard reflects flow audit doporučení

**Sprint H (po týdnu 30):**
- ✅ Beta launch s 30-50 platícími klienty
- ✅ First $5K MRR
- ✅ Status page + docs live
- ✅ 10 SEO blog posts ranking na "migrate from X"

---

## §15 — Související dokumenty

- `DIAGNOSTIC_AUDIT_REPORT.md` — výsledky `pnpm install/typecheck/test/build` + Go build
- `EMAIL_DEEP_ANALYSIS.md` — email layer deep dive vs 12 konkurentů
- `MAILFORGE_FINDING_REPORT.md` — overall gap analýza vs 27 platforem
- `UNPLANNED_FEATURES_AND_FLOW_AUDIT.md` — 103 unplanned features + 15 flow audit
- `POZICOVANI.md` — competitive positioning + GTM
- `infra/PIVOT_AWS_TO_HETZNER.md` — infrastructure pivot
- `infra/DELIVERABILITY.md` — IP warming, FBL, multi-tenant isolation
- `infra/HOSTING_DETAIL.md` — Hetzner produkty + IP plánování
- `TECH_STACK.md` — technology choices (revidováno 2026-05-18)
- `FORGEMSG_ROADMAP.md` — 52-week original plan (potřebuje update)
- `todonow.md` — 316 todos (potřebuje reality update)

---

*Dokument vytvořen: 2026-05-18*
*Owner: omniascz@gmail.com*
*Status: working backlog; aktualizovat po každém sprintu*
