# TODO — Mailchimp vs MailForge (gap analysis + implementation plan)

> Vygenerováno: 2026-04-15 z `Mailchimp_Kompletni_Analyza_2026.md` vs `FORGEMSG_ROADMAP.md` + aktuální stav kódu.
> Frontend/UI je záměrně vyloučen (user memory: backend only, dokud není systém kompletní).
>
> **🇨🇿 LAUNCH MARKET = ČR.** Start v CZ, další země přijdou později. **§18 (CZ lokalizace + Shoptet + Raynet + Seznam) má přednost před většinou §17 HubSpot advanced features.** Viz §19 Globální priorita níže.

Legenda: ✅ hotovo · 🛠️ plánováno v roadmapě · ❌ chybí · 🚫 úmyslně vynecháno · ➕ nově implementováno v této iteraci
Modely: 🧠 Opus · 🛠️ Sonnet · ⚡ Haiku (viz §21 pro kritéria)

**ID úkolů:** Každý řádek má stabilní `#N` identifikátor (nezávislý na čísle řádku). Pro odkaz na úkol používej `#16` místo „řádek 39“.

---

## 1. E-mail marketing
> **Hotovo:** 32/32 (100%) ✅ · 🚫 2 úmyslně vynecháno

### 1.1 Tvorba e-mailů
> **Hotovo:** 12/12 (100%) ✅ · 🚫 1 úmyslně vynecháno

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #1 | 🛠️ Sonnet | Drag-and-drop editor (JSON schema) | ✅ | `apps/editor/src/schema/blocks.ts`, `render/render.ts` |
| #2 | ⚡ Haiku | 260+ šablon | ✅ (10 šablon, 7 kategorií — rozšiřitelné) | `apps/api/src/services/editor/templates/index.ts` |
| #3 | 🛠️ Sonnet | Custom HTML editor + HTML→blocks | ✅ | `apps/api/src/services/editor/html-to-blocks.ts` |
| #4 | 🧠 Opus | Creative Assistant (AI) | ✅ (email generator) | `POST /api/v1/ai/generate-email` |
| #5 | 🛠️ Sonnet | Brand Kit | ✅ | `routes/v1/editor.ts` (GET/PUT brand-kit) |
| #6 | 🛠️ Sonnet | Content Blocks (text, image, button, countdown, produkt…) | ✅ | editor schema + countdown GIF + product scraper |
| #7 | 🛠️ Sonnet | Merge tags | ✅ | `apps/editor/src/render/merge-tags.ts` |
| #8 | 🛠️ Sonnet | Dynamic Content | ✅ | `apps/editor/src/render/evaluate-condition.ts` |
| #9 | 🛠️ Sonnet | Uložené bloky | ✅ | `routes/v1/editor.ts` (saved-blocks) |
| #10 | 🛠️ Sonnet | Content Studio / Media Library | ✅ | `routes/v1/media.ts`, `services/media/index.ts` |
| #11 | — | Integrace Canva / Shutterstock | 🚫 (low priority) | — |
| #12 | 🛠️ Sonnet | Liquid templating | ✅ (bonus) | `apps/editor/src/render/liquid.ts` |
| #13 | 🛠️ Sonnet | Spam score / accessibility check | ✅ (bonus) | `services/editor/spam-checker.ts`, `accessibility-checker.ts` |

### 1.2 Typy kampaní
> **Hotovo:** 6/6 (100%) ✅ · 🚫 1 úmyslně vynecháno

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #14 | 🛠️ Sonnet | Regular campaigns | ✅ | `services/campaigns/index.ts` |
| #15 | 🛠️ Sonnet | A/B test campaigns | ✅ (ab_config + A/B split node) | `campaigns.ts`, `workflows/actions.ts::executeSplit` |
| #16 | 🧠 Opus | Multivariate testing | ✅ | `db/schema/multivariate-tests.ts`, `services/multivariate-tests`, `routes/v1/multivariate-tests.ts` |
| #17 | 🧠 Opus + 🛠️ Sonnet | Automated campaigns / workflows | ✅ | `services/workflows/*` |
| #18 | 🛠️ Sonnet | RSS-to-email | ✅ | `routes/v1/rss-campaigns.ts`, `services/rss/index.ts` |
| #19 | 🛠️ Sonnet | Plain-text campaigns | ✅ (render engine podporuje HTML + text) | `apps/editor/src/render/render.ts` |
| #20 | — | Postcards | 🚫 (fyzická pošta — out of scope) | — |

### 1.3 Doručitelnost a autentizace
> **Hotovo:** 8/8 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #21 | 🧠 Opus | SPF / DKIM / DMARC | ✅ DKIM signing | `apps/engine/internal/dkim/signer.go` |
| #22 | 🛠️ Sonnet | Custom domain authentication | ✅ | `db/schema/domains.ts`, `routes/v1/domains.ts` |
| #23 | 🧠 Opus | Dedicated IP | ✅ | `db/schema/dedicated-ips.ts`, `services/dedicated-ips`, `routes/v1/dedicated-ips.ts` |
| #24 | 🛠️ Sonnet | IP Warm-up | ✅ (schema) | `db/schema/domains.ts` (warmup fields) |
| #25 | 🛠️ Sonnet | ISP Feedback Loops | ➕ | `services/sending/fbl-processor.ts`, `routes/v1/isp-feedback.ts`, `db/schema/isp-fbl.ts` |
| #26 | 🛠️ Sonnet | Bounce management | ✅ (hard/soft + suppression) | `db/schema/email-events.ts`, `services/suppressions` |
| #27 | 🛠️ Sonnet | Spam score check | ✅ | `services/editor/spam-checker.ts` |
| #28 | 🧠 Opus | Abuse Detection | ✅ | `db/schema/abuse-detection.ts`, `services/abuse-detection`, `routes/v1/abuse-detection.ts` |

### 1.4 Plánování a optimalizace odesílání
> **Hotovo:** 6/6 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #29 | 🛠️ Sonnet | Schedule campaigns | ✅ | `campaigns.scheduledAt` + state machine |
| #30 | 🧠 Opus | **Send Time Optimization (STO)** — AI per-contact | ✅ | `services/send-optimization/index.ts` |
| #31 | 🧠 Opus | **Send Day Optimization** | ✅ | `services/send-optimization/index.ts` |
| #32 | 🛠️ Sonnet | **Timewarp** — per-contact timezone | ✅ | `services/send-optimization/index.ts` |
| #33 | 🛠️ Sonnet | Batch Delivery | ✅ | `apps/workers/src/jobs/batch-sender.ts` |
| #34 | 🧠 Opus | **Pre-send tips (AI)** | ✅ | `services/pre-send/index.ts`, `routes/v1/pre-send.ts` |

---

## 2. SMS marketing
> **Hotovo:** 9/9 (100%) ✅ · 🚫 1 úmyslně vynecháno

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #35 | 🛠️ Sonnet | SMS kampaně | ✅ | campaign type = `sms`, `routes/v1/sms.ts` |
| #36 | 🛠️ Sonnet | SMS automatizace | ✅ | workflow action `send_sms` |
| #37 | 🛠️ Sonnet | SMS opt-in | ✅ | signup forms + `sms_consents` table |
| #38 | 🛠️ Sonnet | Unikátní slevové kódy v SMS | ➕ | `services/sms/coupon-merge.ts` — merge tag `{{coupon_code:batchId}}` |
| #39 | 🛠️ Sonnet | SMS šablony | ✅ (merge tag + templates table) | — |
| #40 | 🛠️ Sonnet | Transactional SMS API | ✅ | `routes/v1/sms.ts::send`, nově `routes/v1/transactional.ts::sms` |
| #41 | 🛠️ Sonnet | A/B testování SMS | ✅ (workflow A/B split + SMS send) | — |
| #42 | 🛠️ Sonnet | SMS reporting | ✅ | `sms_send_log` + delivery webhooks |
| #43 | — | ChatGPT integrace | 🚫 (místo toho Claude API) | — |
| #44 | 🛠️ Sonnet | Compliance (TCPA, GDPR) | ✅ | `services/sms/compliance.ts` |

---

## 3. Marketing automatizace
> **Hotovo:** 10/10 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #45 | 🧠 Opus | Customer Journey Builder | ✅ (backend kompletní) | `services/workflows/*` |
| #46 | 🛠️ Sonnet | Triggery (14 typů) | ✅ | `services/workflows/triggers.ts` |
| #47 | 🛠️ Sonnet | Conditions & Branching | ✅ | `actions.ts` (condition, split) |
| #48 | 🛠️ Sonnet | Wait / Delay | ✅ | action `wait` |
| #49 | 🛠️ Sonnet | Multichannel actions (email, sms, wa, push, voice, in-app) | ✅ | 14 action types |
| #50 | ⚡ Haiku | Pre-built journeys (welcome, abandoned cart, re-engagement, onboarding) | ✅ | `services/workflows/flow-templates.ts` |
| #51 | 🧠 Opus | Smart channel selector | ✅ (bonus) | `services/workflows/smart-channel.ts` |
| #52 | 🛠️ Sonnet | Cascade delivery | ✅ (bonus) | `services/workflows/actions.ts::executeCascade` |
| #53 | 🛠️ Sonnet | Goal nodes + conversion tracking | ✅ | `workflow_runs.converted` |
| #54 | 🛠️ Sonnet | **Campaign Manager / Marketing Calendar** | ✅ | `routes/v1/marketing-calendar.ts` |

---

## 4. Správa publika a CRM
> **Hotovo:** 23/23 (100%) ✅ · 🚫 1 úmyslně vynecháno

### 4.1 Kontakty
> **Hotovo:** 10/10 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #55 | 🛠️ Sonnet | Audience dashboard (API) | ✅ | analytics routes |
| #56 | 🛠️ Sonnet | Import (CSV/XLSX + mapping) | ✅ | `services/import/*` |
| #57 | 🛠️ Sonnet | Contact profiles | ✅ | `routes/v1/contacts.ts` |
| #58 | 🛠️ Sonnet | Tags | ✅ | `routes/v1/tags.ts` |
| #59 | 🛠️ Sonnet | **Groups (interest groups)** — oddělené od tagů | ✅ | `db/schema/groups.ts`, `routes/v1/groups.ts` |
| #60 | 🛠️ Sonnet | Custom fields | ✅ | `routes/v1/custom-fields.ts` |
| #61 | 🛠️ Sonnet | Marketing status (subscribed, unsubscribed…) | ✅ | `contact_status` enum |
| #62 | 🛠️ Sonnet | List hygiene / cleaner | ✅ | `services/list-hygiene/index.ts`, `routes/v1/list-hygiene.ts` |
| #63 | 🧠 Opus | **Duplicate management** | ❌ → ➕ | `services/duplicate-detection/index.ts`, `routes/v1/duplicates.ts` |
| #64 | 🛠️ Sonnet | GDPR tools (double opt-in, export, delete) | ✅ | `routes/v1/subscriptions.ts` (opt-in + preference centre) |

### 4.2 Segmentace
> **Hotovo:** 7/7 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #65 | 🛠️ Sonnet | Základní segmentace | ✅ | `routes/v1/segments.ts` |
| #66 | 🛠️ Sonnet | Behaviorální segmentace | ✅ | segments + email_events |
| #67 | 🛠️ Sonnet | E-commerce segmentace | ➕ | `services/segments/query-builder.ts` — `engagement.*` fields (total_orders, total_revenue, last_order_at, …) |
| #68 | 🧠 Opus | Advanced Segment Builder (AND/OR) | ✅ | segments schema (rules JSONB) |
| #69 | 🧠 Opus | AI segment from description | ✅ (bonus) | `POST /api/v1/ai/segment` |
| #70 | 🧠 Opus | **Predictive Segmentation (CLV, likelihood, churn)** | ✅ | `services/predictive-segmentation/index.ts` |
| #71 | 🧠 Opus | Real-time segmentace | ✅ | segments re-evaluated on event |

### 4.3 Formuláře
> **Hotovo:** 6/6 (100%) ✅ · 🚫 1 úmyslně vynecháno

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #72 | 🛠️ Sonnet | Embedded forms | ✅ | `services/signup-forms/*` |
| #73 | 🛠️ Sonnet | Popup forms | ✅ (embed_type=`popup`) | — |
| #74 | — | Signup landing pages | 🚫 (UI — odloženo) | — |
| #75 | 🛠️ Sonnet | **Surveys** | ✅ | `db/schema/surveys.ts`, `routes/v1/surveys.ts` |
| #76 | 🛠️ Sonnet | A/B test pop-upů | ➕ | `db/schema/signup-forms.ts` (`signupFormVariants`), `services/signup-forms` + `routes/v1/signup-forms` (variant CRUD + visitor split) |
| #77 | 🛠️ Sonnet | SMS opt-in forms | ✅ | signup form field type = `phone` |
| #78 | 🛠️ Sonnet | **QR kódy (signup forms)** | ✅ | `routes/v1/qr-codes.ts` |

---

## 5. Webové stránky a landing pages

🚫 Website builder a landing page builder nejsou v plánu jako samostatný produkt. Místo toho MailForge nabízí:
- Embeddable signup forms (✅ hotovo)
- Preference centre (✅ hotovo přes `routes/v1/subscriptions.ts::preferences`)

Full website builder je Mailchimp-specifický ballast — přeskakujeme.

---

## 6. E-commerce funkce
> **Hotovo:** 12/12 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #79 | 🛠️ Sonnet | Shopify integrace | ➕ | `db/schema/ecommerce-integrations.ts`, `services/ecommerce`, `routes/v1/ecommerce-integrations.ts` — OAuth + webhooks + order sync |
| #80 | 🛠️ Sonnet | WooCommerce plugin | ➕ | (v `ecommerce-integrations`) REST key auth + webhook receiver + order sync |
| #81 | 🛠️ Sonnet | BigCommerce / Magento / PrestaShop | ➕ | (v `ecommerce-integrations`) BigCommerce HMAC webhook + Magento Bearer + PrestaShop REST key |
| #82 | 🧠 Opus | **Product recommendations (AI)** | ✅ | `services/product-recommendations/index.ts` |
| #83 | ⚡ Haiku | Abandoned cart emails | ✅ (workflow template) | — |
| #84 | 🛠️ Sonnet | Order notifications | ✅ (transactional) | nově `routes/v1/transactional.ts` |
| #85 | 🛠️ Sonnet | Retargeting / Browse abandonment | ➕ | `db/schema/browse-abandonment.ts`, `services/browse-abandonment`, `routes/v1/browse-abandonment.ts` — page view tracking, abandonment detection, workflow `browse_abandoned` trigger |
| #86 | 🛠️ Sonnet | Back-in-stock alerts | ✅ | `services/back-in-stock/index.ts`, `routes/v1/stock-alerts.ts` |
| #87 | 🛠️ Sonnet | Promo codes | ➕ | `services/campaigns/email-coupon-merge.ts` — `{{coupon_code:batchId}}` merge tag pro emaily; SMS verze v `services/sms/coupon-merge.ts` (coupon batches + assign + redeem) |
| #88 | 🧠 Opus | **Revenue tracking / attribution** | ✅ | `services/revenue-attribution/index.ts`, `routes/v1/revenue.ts` |
| #89 | 🧠 Opus | Customer Lifetime Value | ✅ | `services/predictive-segmentation/index.ts` |
| #90 | 🧠 Opus | Purchase likelihood | ✅ | `services/predictive-segmentation/index.ts` |

---

## 7. Sociální sítě a reklama

🚫 Mimo rozsah MVP — Facebook/Instagram/TikTok/Google Ads integrace jsou pro růstovou fázi.
Místo toho MailForge nabízí: API + webhooks pro propojení s externími ad platformami přes Zapier/Make.

---

## 8. AI a Intuit Assist
> **Hotovo:** 15/15 (100%) ✅

| ID | Model | Mailchimp funkce | MailForge ekvivalent | Stav |
|---|---|---|---|---|
| #91 | 🧠 Opus | Intuit Assist (GenAI asistent) | Claude-native AI stack | ✅ |
| #92 | 🧠 Opus | Email Content Generator | `POST /api/v1/ai/generate-email` | ✅ |
| #93 | 🧠 Opus | Creative Assistant | brand voice + generate-email + templates | ✅ |
| #94 | 🧠 Opus | Content Optimizer | spam + accessibility + pre-send tips | ✅ / ➕ |
| #95 | 🧠 Opus | Send Time Optimization | `services/send-optimization/sto.ts` | ➕ |
| #96 | 🧠 Opus | Send Day Optimization | `services/send-optimization/day.ts` | ➕ |
| #97 | 🧠 Opus | **Predictive Segmentation** | `services/predictive-segmentation/*` | ➕ |
| #98 | 🧠 Opus | **Product Recommendations** | `services/product-recommendations/*` | ➕ |
| #99 | 🧠 Opus | Subject Line Helper | `POST /api/v1/ai/subject-lines` | ✅ |
| #100 | 🧠 Opus | **Pre-send tips** | `POST /api/v1/pre-send/tips` | ➕ |
| #101 | ⚡ Haiku | One-click automations | workflow templates | ✅ |
| #102 | 🛠️ Sonnet | ChatGPT integrace | API je otevřené, Zapier Claude action možné | ✅ |
| #103 | 🧠 Opus | Inline text generation | AI API k dispozici | ✅ |
| #104 | 🧠 Opus | AI Brand Voice | `POST /api/v1/ai/analyze-brand-voice` | ✅ |
| #105 | 🛠️ Sonnet | AI translation | `POST /api/v1/ai/translate` | ✅ (bonus) |

---

## 9. Analytika a reporting
> **Hotovo:** 10/10 (100%) ✅

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #106 | 🧠 Opus | Campaign reports (opens, clicks, bounces…) | ✅ | `services/analytics/index.ts` |
| #107 | 🛠️ Sonnet | Click maps / heatmap | ✅ | `analytics.ts::getHeatmap` |
| #108 | 🛠️ Sonnet | Geo tracking | ✅ (email_events.country) | — |
| #109 | 🛠️ Sonnet | Device & client reports | ✅ | `analytics.ts::getDeviceStats` |
| #110 | 🛠️ Sonnet | **Industry benchmarks** | ✅ | `services/benchmarks/index.ts`, `routes/v1/benchmarks.ts` |
| #111 | 🧠 Opus | Revenue attribution | ✅ | viz výše |
| #112 | 🛠️ Sonnet | **Comparative reports** (více kampaní vedle sebe) | ❌ → ➕ | `routes/v1/analytics.ts::compare` (nové) |
| #113 | 🛠️ Sonnet | A/B test results | ✅ (workflows) | — |
| #114 | 🛠️ Sonnet | Audience growth | ✅ | analytics (rolling counts) |
| #115 | 🛠️ Sonnet | Engagement metrics | ✅ (lead score) | `services/lead-scoring/*` |

---

## 10. Transactional Email (Mandrill equivalent)
> **Hotovo:** 10/11 (91%)

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #116 | 🛠️ Sonnet | **Samostatná transactional API** (pure send, bez kampaní) | ✅ | `routes/v1/transactional.ts` |
| #117 | 🧠 Opus | SMTP relay | ✅ (engine) | `apps/engine/internal/smtp` |
| #118 | 🛠️ Sonnet | Templates v API | ✅ | `routes/v1/templates.ts` |
| #119 | 🛠️ Sonnet | Webhooks (events) | ✅ | `routes/v1/webhooks.ts` |
| ✅ #120 | 🧠 Opus | Inbound email processing | ➕ | `db/schema/inbound-email.ts`, `services/inbound-email/index.ts`, `routes/v1/inbound-email.ts` |
| #121 | 🛠️ Sonnet | Transactional SMS | ✅ (přes `routes/v1/sms.ts`) | — |
| #122 | 🧠 Opus | Dedicated IPs + IP pools | ✅ | `db/schema/dedicated-ips.ts`, `services/dedicated-ips`, `routes/v1/dedicated-ips.ts` |
| #123 | 🛠️ Sonnet | Multi-domain sending | ✅ | `domains` table |
| #124 | 🛠️ Sonnet | Delivery analytics | ✅ | analytics routes |
| #125 | 🛠️ Sonnet | Scheduled sending (transactional) | ➕ | `routes/v1/transactional.ts::schedule` |
| ✅ #126 | ⚡ Haiku | Activity export | ➕ | `services/contacts/activity-export.ts`, `routes/v1/contacts.ts::activity-export` |

---

## 11. Integrace a ekosystém
> **Hotovo:** 10/10 (100%)

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #127 | 🛠️ Sonnet | Zapier | ✅ | `packages/zapier-app/` |
| #128 | 🛠️ Sonnet | Mailchimp migration | ✅ | `services/migrations/mailchimp.ts` |
| #129 | 🛠️ Sonnet | Marketing API | ✅ | Fastify REST + OpenAPI auto-gen |
| #130 | 🛠️ Sonnet | E-commerce API | ✅ (contacts + events + webhooks) | — |
| #131 | 🛠️ Sonnet | Webhooks (marketing) | ✅ | `routes/v1/webhooks.ts` |
| #132 | 🛠️ Sonnet | Webhooks (transactional) | ✅ | stejné — dispatchEvent |
| #133 | 🧠 Opus | **OAuth 2.0 pro 3rd-party apps** | ✅ | `db/schema/oauth.ts`, `routes/v1/oauth.ts` |
| #134 | 🛠️ Sonnet | SDK (TS/Python) | ✅ | `packages/sdk/`, `packages/sdk-python/` |
| #135 | — | Mobile SDKs (iOS/Android) | 🚫 (roadmap) | — |
| #136 | 🛠️ Sonnet | Make / n8n | ✅ (přes otevřené API + webhooks) | — |
| ✅ #137 | 🛠️ Sonnet | Stripe integrace (billing) | ➕ (Checkout, Portal, webhooks, subscription) | `db/schema/billing.ts`, `services/billing/index.ts`, `routes/v1/billing.ts` |

---

## 12. Bezpečnost a compliance
> **Hotovo:** 9/9 (100%)

| ID | Model | Funkce | Stav | Kde |
|---|---|---|---|---|
| #138 | 🧠 Opus | **Two-Factor Authentication (TOTP)** | ✅ | `db/schema/two-factor.ts`, `routes/v1/two-factor.ts` |
| ✅ #139 | 🧠 Opus | SSO (Single Sign-On) | ➕ (SAML + OIDC) | `db/schema/sso.ts`, `services/sso/index.ts`, `routes/v1/sso.ts` |
| #140 | 🧠 Opus | Role-based access (owner/admin/editor/viewer) | ✅ | `plugins/auth.ts::requireRole` |
| #141 | 🛠️ Sonnet | GDPR tools | ✅ (double opt-in, unsubscribe, preference centre) | — |
| #142 | 🛠️ Sonnet | CAN-SPAM | ✅ (unsubscribe link auto) | — |
| #143 | 🧠 Opus | Šifrování dat | ✅ (DB at-rest, TLS) | — |
| #144 | 🛠️ Sonnet | Rate limiting / abuse prevention | ✅ | `@fastify/rate-limit` |
| ✅ #145 | 🛠️ Sonnet | Audit logging | ➕ | `db/schema/audit-logs.ts`, `services/audit-log/index.ts`, `routes/v1/audit-log.ts` |
| ✅ #146 | 🧠 Opus | SOC 2 | ➕ (controls catalog, access reviews, retention) | `db/schema/compliance.ts`, `services/compliance/index.ts`, `routes/v1/compliance.ts` |

---

## 13. Mobilní aplikace

🚫 Mimo rozsah — viz UI roadmap. Web app je responsive.

---

## Shrnutí nově implementovaných modulů (➕)
> **Hotovo:** 19/19 (100%) ✅

Všechny nové backendové moduly jsou uvnitř `apps/api/src` a registrované v `src/index.ts`.

| ID | Model | Modul | Nové soubory |
|---|---|---|---|
| ✅ #147 | 🧠 Opus | Send Time / Day / Timewarp | `services/send-optimization/index.ts`, `routes/v1/send-optimization.ts` |
| ✅ #148 | 🧠 Opus | Pre-send tips (AI) | `services/pre-send/index.ts`, `routes/v1/pre-send.ts` |
| ✅ #149 | 🧠 Opus | Predictive segmentation | `services/predictive-segmentation/index.ts`, `routes/v1/predictive.ts` |
| ✅ #150 | 🛠️ Sonnet | Media library (Content Studio) | `db/schema/media-assets.ts`, `services/media/index.ts`, `routes/v1/media.ts` |
| ✅ #151 | 🛠️ Sonnet | Surveys | `db/schema/surveys.ts`, `services/surveys/index.ts`, `routes/v1/surveys.ts` |
| ✅ #152 | 🛠️ Sonnet | Interest groups | `db/schema/groups.ts`, `services/groups/index.ts`, `routes/v1/groups.ts` |
| ✅ #153 | 🛠️ Sonnet | QR codes | `routes/v1/qr-codes.ts` |
| ✅ #154 | 🧠 Opus | Duplicate detection | `services/list-hygiene/index.ts` (findDuplicates/mergeDuplicates), `routes/v1/list-hygiene.ts` (/api/v1/duplicates) |
| ✅ #155 | 🛠️ Sonnet | List hygiene | `services/list-hygiene/index.ts`, `routes/v1/list-hygiene.ts` |
| ✅ #156 | 🧠 Opus | Revenue attribution | `db/schema/revenue.ts`, `services/revenue-attribution/index.ts`, `routes/v1/revenue.ts` |
| ✅ #157 | 🛠️ Sonnet | Marketing calendar | `routes/v1/marketing-calendar.ts` |
| ✅ #158 | 🛠️ Sonnet | RSS-to-email | `db/schema/rss-campaigns.ts`, `services/rss/index.ts`, `routes/v1/rss-campaigns.ts` |
| ✅ #159 | 🛠️ Sonnet | Transactional API | `routes/v1/transactional.ts` |
| ✅ #160 | 🧠 Opus | Product recommendations (AI) | `db/schema/product-catalog.ts`, `services/product-recommendations/index.ts`, `routes/v1/product-recommendations.ts` |
| ✅ #161 | 🛠️ Sonnet | Industry benchmarks | `services/benchmarks/index.ts`, `routes/v1/benchmarks.ts` |
| ✅ #162 | 🛠️ Sonnet | Comparative reports | ➕ | nová route `GET /api/v1/analytics/compare`, `compareCampaigns()` v `services/analytics/index.ts` |
| ✅ #163 | 🧠 Opus | 2FA (TOTP) | `db/schema/two-factor.ts`, `services/two-factor/index.ts`, `routes/v1/two-factor.ts` |
| ✅ #164 | 🧠 Opus | OAuth 2.0 | `db/schema/oauth.ts`, `services/oauth/index.ts`, `routes/v1/oauth.ts` |
| ✅ #165 | 🧠 Opus | Migrace 0014 | `drizzle/0014_mailchimp_parity.sql` |

---

## 14. Klaviyo gap analýza — 2026-04
> **Hotovo:** 17/17 (100%) ✅

Zdroj: `C:\Users\omnia\Downloads\Klaviyo_Kompletni_Analyza_2026.md`. Cíl: dorovnat rozdíly mezi MailForge a Klaviyo, které nebyly pokryty Mailchimp-parity vlnou.

### 14.1. Co MailForge měl ✅

Většina core modulů se už překrývá s Mailchimp-parity: segmentace, workflows, analytics, SMS/WhatsApp/Push/Voice kanály, AI content, frequency rules, send-time optimization, revenue attribution, product recommendations, industry benchmarks, comparative reports, oAuth/2FA, import/export, media library, signup forms, transactional API.

### 14.2. Klaviyo-specific mezery → nově implementováno (➕)
> **Hotovo:** 17/17 (100%) ✅

| ID | Model | Modul | Klaviyo analogie | Nové soubory |
|---|---|---|---|---|
| ✅ #166 | 🧠 Opus | **RFM segmentace** (recency/frequency/monetary, 11 lifecycle segmentů) | "Predictive Analytics → RFM" | `services/rfm/index.ts`, `routes/v1/rfm.ts`, rozšíření `db/schema/engagement.ts` (rfm_recency/frequency/monetary/score/segment, predicted_next_order_at, avg_order_interval_days) |
| ✅ #167 | 🧠 Opus | **Smart Sending** (per-contact-per-channel frequency cap + cooldown) | "Smart Sending" | `db/schema/smart-sending.ts`, `services/smart-sending/index.ts`, `routes/v1/smart-sending.ts` |
| ✅ #168 | 🛠️ Sonnet | **Quiet Hours** (timezone-aware okna tiše) | "Quiet Hours" | `db/schema/quiet-hours.ts`, `services/quiet-hours/index.ts`, `routes/v1/quiet-hours.ts` |
| ✅ #169 | 🛠️ Sonnet | **Back-in-stock / Price-drop alerts** | "Back in Stock" & "Price Drop" flows | `db/schema/alerts-subscriptions.ts`, `services/back-in-stock/index.ts`, `services/price-drop/index.ts`, `routes/v1/stock-alerts.ts` |
| ✅ #170 | 🛠️ Sonnet | **Unikátní coupon batches** | "Unique Coupons" | `db/schema/coupons.ts`, `services/coupons/index.ts`, `routes/v1/coupons.ts` |
| ✅ #171 | 🛠️ Sonnet | **Product reviews & moderation queue** | "Reviews" | `db/schema/reviews.ts`, `services/reviews/index.ts`, `routes/v1/reviews.ts` |
| ✅ #172 | 🛠️ Sonnet | **Scheduled reports dispatch** | "Scheduled Report Delivery" | `db/schema/scheduled-reports.ts`, `services/scheduled-reports/index.ts`, `routes/v1/scheduled-reports.ts` |
| ✅ #173 | 🧠 Opus | **Holdout groups** (deterministic hash-mod) | "Holdout Testing" | `db/schema/holdout.ts`, `services/holdout/index.ts`, `routes/v1/holdout.ts` |
| ✅ #174 | 🧠 Opus | **Cohort / Funnel / Timeline analytics** | "Cohort Analysis", "Funnel Reports", "Customer Timeline" | `services/cohort/index.ts`, `services/funnel/index.ts`, `services/timeline/index.ts`, `routes/v1/advanced-analytics.ts` |
| ✅ #175 | 🛠️ Sonnet | **Catalog insights** (best-sellers, slow-movers, revenue by category) | "Catalog Insights" | `services/catalog-insights/index.ts`, součást `routes/v1/advanced-analytics.ts` |
| ✅ #176 | 🛠️ Sonnet | **Helpdesk / tickety** (+ pause marketing při otevřeném ticketu) | "Helpdesk (Customer Hub)" | `db/schema/helpdesk.ts`, `services/helpdesk/index.ts`, `routes/v1/helpdesk.ts` |
| ✅ #177 | 🧠 Opus | **Warehouse sync** (S3/Snowflake/BigQuery/Redshift/webhook) | "Data Warehouse Sync" | `db/schema/warehouse-sync.ts`, `services/warehouse-sync/index.ts`, `routes/v1/warehouse-sync.ts` |
| ✅ #178 | 🛠️ Sonnet | **SMS keyword routing** (subscribe/unsubscribe/info/reply) | "SMS Keyword Campaigns" | `db/schema/sms-keywords.ts`, `services/sms-keywords/index.ts`, `routes/v1/sms-keywords.ts` |
| ✅ #179 | 🛠️ Sonnet | **Multi-email profily** (až 5 e-mailů per contact) | "Multiple Emails per Profile" | `db/schema/contact-emails.ts`, `services/multi-email/index.ts`, `routes/v1/contact-emails.ts` |
| ✅ #180 | 🧠 Opus | **Identity merge** (visitor_id → contact_id backfill) | "Anonymous → Known Merge" | `db/schema/anonymous-profiles.ts`, `services/identity-merge/index.ts`, `routes/v1/identity.ts` |
| ✅ #181 | 🛠️ Sonnet | **RCS messaging** (carousel, suggested replies, rich cards) | "RCS Business Messaging" | `db/schema/rcs.ts`, `services/rcs/index.ts`, `routes/v1/rcs.ts` |
| ✅ #182 | 🧠 Opus | **Migrace 0015** | — | `drizzle/0015_klaviyo_parity.sql` |

### 14.3. Záměrně nepokryto

- **Klaviyo CDP branding, Reviews UI widgety, mobile SDKs** — out of scope pro backend-only fázi.
- **Klaviyo AI (Generate copy, Subject line)** — již máme přes `services/ai-client` + `routes/v1/ai.ts`.
- **Klaviyo Integrations marketplace (Shopify, BigCommerce, Square)** — integrations layer sedí ve fázi Fáze-4 (viz roadmap).

---

## 15. ActiveCampaign gap analýza — 2026-04-15
> **Hotovo:** 16/51 (31%)

Zdroj: `C:\Users\omnia\Downloads\ActiveCampaign_Kompletni_Analyza_2026.md`. Cíl: dorovnat AC silné stránky (nejpokročilejší automation builder, integrovaný sales CRM, 1000+ integrací, Active Intelligence AI vrstva). Frontend/UI stále odloženo — backend only.

### 15.1. Co MailForge už pokrývá ✅

- **E-mail** — drag-and-drop, templates, HTML editor, saved blocks, merge tagy, conditional content, dynamic product blocks, brand kit, spam score, link tracking, předběžný preview, A/B, RSS, plain-text, transactional API.
- **SMS/WhatsApp** — kampaně, automatizace, personalizace, TCPA/GDPR, A/B, reporting, keyword routing, WhatsApp adapter.
- **Automation** — visual workflow backend, triggery (14), conditions/branching, wait, multichannel akce (14), goals, conversion tracking, flow templates, smart channel, cascade.
- **Segmentace** — basic/advanced/behavioral/predictive (CLV, likelihood, churn), real-time re-eval, AI-from-description.
- **Forms** — embedded, popup, SMS opt-in, QR kódy, surveys, double opt-in.
- **E-commerce** — abandoned cart, post-purchase, win-back, promo codes (částečně), revenue attribution, product recommendations, back-in-stock, price-drop.
- **AI** — generate email, brand voice, subject lines, translation, spam/accessibility, pre-send tips, STO/Day/Timewarp, predictive segmentation.
- **Deliverability** — DKIM, SPF, DMARC, custom domain, bounce management, IP warmup schema.
- **Transactional** — samostatné API, SMTP relay, templates, webhooks, scheduled.
- **Security** — 2FA, RBAC, GDPR, CAN-SPAM, rate-limit.
- **Analytics** — campaign/automation/cohort/funnel/timeline, benchmarks, comparative reports, heatmap, geo, device.
- **Integrace core** — Zapier, Mailchimp migration, REST API, webhooks, OAuth 2.0, SDK (TS/Python), warehouse sync (S3/Snowflake/BigQuery/Redshift).

### 15.2. ActiveCampaign-specific mezery → k implementaci (❌ → 📋)
> **Hotovo:** 16/51 (31%)

Nejsilnější diferenciátor AC je **integrovaný sales CRM** (Pipelines + Sales Engagement add-ony) a **Active Intelligence AI** (Win Probability, Sentiment, autonomous agents, AI Campaign Builder). MailForge má pouze `lead-scoring` bez plné CRM vrstvy.

#### A) Sales CRM — Pipelines (AC Pipelines add-on, $68/měs.)

| ID | Model | Funkce | Popis | Navrhované soubory |
|---|---|---|---|---|
| ✅ #183 | 🧠 Opus + 🛠️ Sonnet | **Sales pipelines** (kanban, multi-pipeline) | vizuální pipeline s custom stages per pipeline | `db/schema/pipelines.ts`, `services/crm/pipelines.ts`, `routes/v1/crm/pipelines.ts` |
| ✅ #184 | 🧠 Opus + 🛠️ Sonnet | **Deal management** | deals s contact/account linkem, stage, value, currency, expected_close, owner, custom fields | `db/schema/deals.ts`, `services/crm/deals.ts`, `routes/v1/crm/deals.ts` |
| ✅ #185 | 🛠️ Sonnet | **Deal stages & automation** | stage-change triggery, time-in-stage tracking | rozšíření `services/workflows/triggers.ts` (deal_stage_changed, deal_created, deal_won, deal_lost) |
| ✅ #186 | 🧠 Opus + 🛠️ Sonnet | **Account records (B2B)** | firemní účty, vazba contact→account, parent-child, industry, revenue, employees | `db/schema/accounts.ts`, `services/crm/accounts.ts`, `routes/v1/crm/accounts.ts` |
| ✅ #187 | 🛠️ Sonnet | **Task management** | úkoly (call/email/meeting/todo) přiřazené userům, deadline, priority, linked deal/contact | `db/schema/tasks.ts`, `services/crm/tasks.ts`, `routes/v1/crm/tasks.ts` |
| ✅ #188 | 🛠️ Sonnet | **Task assignments & round-robin** | automatické přidělení z workflow action `assign_task` | nový action type v `services/workflows/actions.ts` |
| ✅ #189 | 🛠️ Sonnet | **Notes on contacts/deals** | timestamped note entity s authorem | `db/schema/notes.ts`, `services/crm/notes.ts`, `routes/v1/crm/notes.ts` |
| ✅ #190 | 🛠️ Sonnet | **Activity feed per contact** | chronologický log (events + emails + deals + notes + tasks + sms) | `services/crm/activity-feed.ts`, `routes/v1/crm/activity.ts` |
| ✅ #191 | 🧠 Opus | **Pipeline reports & sales reports** | deals by stage, conversion rate, velocity, rep performance | `services/crm/sales-reports.ts`, nové routes v `routes/v1/crm/reports.ts` |
| ✅ #192 | 🧠 Opus | **Win/loss analysis** | důvody ztráty, výhra-ratio per source/rep | součást sales-reports |
| ✅ #193 | 🧠 Opus | **Revenue forecasting** | weighted pipeline value × win probability | `services/crm/forecasting.ts` |
| ✅ #194 | 🧠 Opus | **Migrace 0016** | — | `drizzle/0032_sales_crm.sql` |

#### B) Sales Engagement AI (AC Sales Engagement add-on, $111/měs.)

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #195 | 🧠 Opus | **Win Probability (AI)** | ML skóre pravděpodobnosti uzavření per deal (features: stage, age, activity, contact engagement) | `services/ai-sales/win-probability.ts`, `routes/v1/ai-sales.ts::win-probability` |
| ✅ #196 | 🧠 Opus | **Deal risk assessment** | flagy stalled/at-risk (no activity N days, past expected close) | `services/ai-sales/deal-risk.ts` |
| ✅ #197 | 🧠 Opus | **Sentiment Analysis (AI)** | Claude analýza email/SMS/helpdesk textů → pozitivní/neutrální/negativní skóre per kontakt a per deal | `services/ai-sales/sentiment.ts`, rozšíření `db/schema/email-events.ts` o `sentiment_score` |
| ✅ #198 | 🛠️ Sonnet | **Automated 1:1 emails** | personalizované emaily vypadající jako přímá zpráva obchodníka (from: rep email, reply-to: rep, plain-text style) | `services/crm/one-to-one-email.ts`, action `send_personal_email` ve workflows |
| ✅ #199 | 🛠️ Sonnet | **Sales engagement sequences** | multi-step outreach (email → wait → call task → email → social) per deal/contact | `db/schema/sales-sequences.ts`, `services/crm/sales-sequences.ts`, `routes/v1/crm/sequences.ts` |
| ✅ #200 | 🧠 Opus | **Predictive Lead Scoring** | rozšíření stávajícího lead-scoring o ML model (conversion probability) | rozšíření `services/lead-scoring` o `predictive.ts` |

#### C) Onsite & Web personalization

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #201 | 🛠️ Sonnet | **Site tracking JS snippet** | JS tracker pro page views, events, identifikaci kontaktu přes cookie/email | `apps/api/src/services/tracking/site-tracker.ts`, public endpoint `routes/v1/track.ts`, static JS asset `apps/api/public/track.js` |
| ✅ #202 | 🛠️ Sonnet | **Site messages** (behavior-triggered popup/banner na webu) | pravidla (visited_page, time_on_site, exit_intent, cart_value) → zobrazit zprávu | `db/schema/site-messages.ts`, `services/site-messages/index.ts`, `routes/v1/site-messages.ts` |
| ✅ #203 | 🛠️ Sonnet | **Web personalization** (hide/show DOM elements per segment) | pravidlo → selektor → akce (hide/show/swap content) dodané přes tracker | `db/schema/web-personalization.ts`, `services/web-personalization/index.ts`, `routes/v1/web-personalization.ts` |
| ✅ #204 | 🛠️ Sonnet | **Connected sites** (multi-domain tracking) | více domén pod jednou org, cross-domain cookie sync | rozšíření schema `domains.ts` o `tracking_enabled`, `cross_domain_sync` |
| ✅ #205 | 🛠️ Sonnet | **Progressive profiling** | form renderer přeskočí už vyplněná pole, nabídne nová per návštěvu | rozšíření `services/signup-forms` o `progressive.ts` |
| ✅ #206 | 🛠️ Sonnet | **Chatbot / Conversations widget** | live chat API napojený na helpdesk (už máme tickety) | rozšíření `services/helpdesk` o `live-chat.ts`, WebSocket endpoint v API |

#### D) Active Intelligence — autonomous AI

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| #207 | 🧠 Opus | ✅ **AI Campaign Builder** (autonomous) | Claude agent: vstup = goal + audience + brand → návrh kampaně (subject, body, segment, send time, follow-up workflow) | `services/ai-agents/campaign-builder.ts`, `routes/v1/ai-agents.ts::build-campaign` |
| #208 | 🧠 Opus | ✅ **Autonomous AI agents** (task runners) | Claude agent framework — "optimize low-open campaigns", "cleanup inactive contacts", "suggest segment splits" jako scheduled jobs | `services/ai-agents/runner.ts`, `db/schema/ai-agents.ts`, `routes/v1/ai-agents.ts` |
| #209 | 🛠️ Sonnet | ✅ **AI sidebar / context-aware recommendations API** | endpoint `POST /api/v1/ai/recommend` s context (current_page, entity_id) → top-N akcí | `services/ai-recommendations/index.ts`, `routes/v1/ai-recommendations.ts` |
| #210 | 🧠 Opus | ✅ **MCP Server** (Postmark-style) | MCP server expo­nující send_email / send_sms / create_contact / query_segments — aby Claude/ChatGPT mohly přirozeně ovládat MailForge | `apps/mcp-server/` (nový balíček), SSE + stdio transport |
| ✅ #211 | 🛠️ Sonnet | **AI Calendly Block** (smart scheduling) | email block: dynamicky vybere best timeslots per recipient timezone + rep calendar | `apps/editor/src/blocks/calendly-smart.ts`, `services/scheduling/smart-slot.ts` |
| ✅ #212 | 🧠 Opus | **Voice Agent APIs** (<200ms latency) | rozšíření voice-bot o nízkolatenční streaming API pro 3rd-party konverzační aplikace | rozšíření `apps/voice-bot` o `src/api/streaming.ts` |

#### E) Automation builder — pokročilé

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #213 | 🛠️ Sonnet | **Nested automations** (spuštění workflow z workflow) | action `start_workflow` předávající context | nový action type v `services/workflows/actions.ts::executeStartWorkflow` |
| ✅ #214 | 🛠️ Sonnet | **Automation maps** (graf všech workflow a jejich napojení) | build graph: který workflow spouští který přes start_workflow / goals | `services/workflows/map.ts`, `routes/v1/workflows.ts::map` |
| 🔴 #215 | ⚡ Haiku | **900+ pre-built recipes** | rozšíření `flow-templates.ts` z ~10 na širší knihovnu (B2B, e-com, SaaS onboarding, re-engagement, sales sequences) | `services/workflows/templates/` (split do kategorií) |
| ✅ #216 | 🛠️ Sonnet | **Click actions** (add tag / update field po kliknutí na link/image) | render-time: link wrapper s tracking ID → na click resolve action | rozšíření `apps/editor/src/render/render.ts` + `services/campaigns/click-actions.ts` |

#### F) Contact data — custom objects a social

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #217 | 🧠 Opus | **Custom objects** (vlastní datové entity, např. Properties, Policies, Subscriptions) | generický entity framework: schema JSONB, relations, CRUD | `db/schema/custom-objects.ts`, `services/custom-objects/index.ts`, `routes/v1/custom-objects.ts` |
| ✅ #218 | 🛠️ Sonnet | **Social data enrichment** | lookup sociálních profilů přes email (Clearbit/enricher adapter) | `services/enrichment/social.ts`, `routes/v1/enrichment.ts` |
| ✅ #219 | 🧠 Opus | **BotSense** (AI bot click detection) | heuristika + ML na email_events (UA, timing, sekvence kliků) → filtrovat bot opens/clicks z metrik | `services/deliverability/bot-detection.ts`, flag `is_bot` na email_events |
| ✅ #220 | 🛠️ Sonnet | **List warming** (gradual send ramp-up per new domain/IP) | schedule-aware sender: % of list / day, podle domain.warmup_stage | rozšíření `apps/workers/src/jobs/batch-sender.ts` + `services/domains/warmup-scheduler.ts` |

#### G) Transactional & Postmark-parity

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #221 | 🧠 Opus | **Inbound email processing** | MX receiver → parse → dispatch na webhook/helpdesk | `apps/engine/internal/inbound/` (Go), `services/inbound/index.ts`, route `routes/v1/inbound.ts` |
| ✅ #222 | 🛠️ Sonnet | **Message streams** (oddělené queues broadcast vs transactional) | tagging stream na send, separátní suppression/metrics | rozšíření `db/schema/email-events.ts` o `stream` (enum), worker queue routing |
| 🔴 #223 | ⚡ Haiku | **Activity export (transactional)** | bulk CSV/JSON export per date-range | `routes/v1/transactional.ts::export` |

#### H) Integrace marketplace

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #224 | 🛠️ Sonnet | **Shopify / WooCommerce / BigCommerce native integrace** | obous­měrná sync contacts/orders/products (roadmap fáze 9 — zahrnuto zde) | `apps/api/src/integrations/{shopify,woocommerce,bigcommerce}/` |
| ✅ #225 | 🧠 Opus | **Salesforce integrace** (bi-directional sync) | CRM mapping: Deal↔Opportunity, Account↔Account, Contact↔Contact | `apps/api/src/integrations/salesforce/` |
| ✅ #226 | 🛠️ Sonnet | **HubSpot integrace** | contact/deal sync | `apps/api/src/integrations/hubspot/` |
| ✅ #227 | 🛠️ Sonnet | **Calendly integrace** | booking → create deal / trigger workflow | `apps/api/src/integrations/calendly/` |
| ✅ #228 | 🛠️ Sonnet | **Stripe integrace (billing + e-com)** | subscription events → tagy/workflow | rozšíření existujícího stripe billing hook o e-com events |
| ✅ #229 | 🧠 Opus | **App Studio** (low-code integration builder) | API pro custom "apps": OAuth + webhook subscribers + action definitions | `db/schema/app-studio.ts`, `services/app-studio/index.ts`, `routes/v1/app-studio.ts` |

#### I) Security & compliance

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #230 | 🧠 Opus | **SSO (SAML 2.0)** | enterprise SSO provider integration | `services/auth/saml.ts`, `routes/v1/auth/sso.ts` (roadmap, nyní spec) |
| ✅ #231 | 🧠 Opus | **HIPAA compliance mode** (per-org flag + BAA) | PHI field flags, audit log hardening, encryption-at-field | `services/compliance/hipaa.ts`, `db/schema/organizations.ts` (hipaa_mode col) |
| ✅ #232 | 🛠️ Sonnet | **Audit logs** (detailní per-user per-action) | append-only log table + viewer | `db/schema/audit-log.ts`, `services/audit/index.ts`, `routes/v1/audit.ts` |
| ✅ #233 | 🛠️ Sonnet | **DMARC Digests** (monitoring reports) | parse aggregate DMARC XML z postmaster feedů → dashboard | `services/deliverability/dmarc-digest.ts`, `routes/v1/dmarc.ts` |

### 15.3. Záměrně nepokryto

- **Mobile iOS/Android app** — backend-only fáze, UI odložené.
- **Landing page builder / Website builder** — AC ani nemá website builder; MailForge stejně přeskakuje (viz sekce 5).
- **Free plán** — billing/tarify mimo rozsah backend-only fáze.
- **Certifikační program, ActiveCampaign University, free migration services** — jsou business-side procesy, ne backend.
- **Native review system, Postcards, Native CDP vrstva** — AC je sama nemá, nedorovnáváme.
- **1000+ integrací marketplace** — pokryjeme pouze top-tier (viz H); long-tail přes Zapier/Make/webhooks.

### 15.4. Priorita implementace

1. **Sales CRM (A)** — největší hodnota, odlišuje AC od Mailchimp/Klaviyo. Migrace 0016.
2. **Sales Engagement AI (B)** — Win Probability + Sentiment = AC killer feature.
3. **Onsite & Web personalization (C)** — site tracking je prerequisite pro behavioral triggers.
4. **Autonomous AI & MCP server (D)** — strategicky důležité pro 2026+ positioning.
5. **Automation advanced (E)**, **Custom objects (F)** — incremental.
6. **Transactional Postmark-parity (G)**, **Integrace (H)**, **Security (I)** — fáze 9+ hardening.

---

## 16. Brevo gap analýza — 2026-04-15
> **Hotovo:** 2/53 (4%)

Zdroj: `C:\Users\omnia\Downloads\Brevo_Kompletni_Analyza_2026.md`. Brevo je all-in-one platforma s unikátními moduly, které AC/Mailchimp/Klaviyo nemají: **Loyalty Program**, **Universal Inbox** (Instagram/FB Messenger/chat v jedné schránce), **Cloud Phone** (Yodel.io), **Meetings scheduler** a plnohodnotná **CDP vrstva**. Tato sekce pokrývá jen to, co ještě není v §1–§15.

### 16.1. Co už máme z předchozích parity vln ✅

Email/SMS/WhatsApp, transactional API (marketing+transactional v jednom — §10), workflows multi-kanál, AI content/subject/segmentation/STO, landing-page preference centre, signup forms (embedded/popup/QR), helpdesk + live-chat (§15 C/I), warehouse sync & identity merge (§14), RSS campaigns, revenue attribution, product recommendations, push notifications (roadmap), voice-bot, 2FA, RBAC, audit logs (plán), SSO (plán), HIPAA (plán).

### 16.2. Brevo-specific mezery → k implementaci (❌ → 📋)
> **Hotovo:** 2/53 (4%)

#### A) Loyalty Program (Brevo killer feature, od 2024)

Vestavěný věrnostní program — žádný jiný konkurent ho nemá jako nativní modul.

| ID | Model | Funkce | Popis | Navrhované soubory |
|---|---|---|---|---|
| ✅ #234 | 🧠 Opus | **Program setup** (multi-program per org) | tiers (bronze/silver/gold), earning rules, expiration policy | `db/schema/loyalty-programs.ts`, `services/loyalty/programs.ts`, `routes/v1/loyalty/programs.ts` |
| ✅ #235 | 🛠️ Sonnet | **Member enrollment** | kontakt ↔ loyalty_member, auto-enroll přes workflow action | `db/schema/loyalty-members.ts`, `services/loyalty/enrollment.ts`, workflow action `enroll_in_loyalty` |
| ✅ #236 | 🧠 Opus | **Points ledger** (append-only) | earn/spend/expire/adjust events, audit trail, balance caching | `db/schema/loyalty-points.ts`, `services/loyalty/ledger.ts` |
| ✅ #237 | 🛠️ Sonnet | **Rewards catalog** | odměny (coupon/product/tier-up/custom), redemption flow | `db/schema/loyalty-rewards.ts`, `services/loyalty/rewards.ts`, `routes/v1/loyalty/rewards.ts` |
| ✅ #238 | 🛠️ Sonnet | **Earning rules engine** | pravidla: "za každý $1 = 1 bod", "review +50", "birthday +100" | `services/loyalty/earning-rules.ts` |
| ✅ #239 | 🛠️ Sonnet | **Loyalty webhooks & triggers** | events → dispatch, triggery pro workflows (`points_earned`, `tier_up`, `reward_redeemed`) | rozšíření `services/workflows/triggers.ts` |
| ✅ #240 | 🛠️ Sonnet | **Loyalty analytics** | active members, avg points/member, redemption rate, ROI | `services/loyalty/analytics.ts`, `routes/v1/loyalty/analytics.ts` |
| ✅ #241 | 🧠 Opus | **Migrace 0017** | — | `drizzle/0036_dmarc_loyalty.sql` + `0037_hipaa_saml.sql` |

#### B) Universal Inbox — multi-channel konverzační vrstva

Brevo Conversations sjednocuje chat + email + WhatsApp + Instagram DM + FB Messenger v jedné inboxu. MailForge má helpdesk tickety a live-chat (§15 C), ale chybí social inbox kanály.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #242 | 🛠️ Sonnet | **Instagram DM adapter** | Meta Graph API, inbound messages → helpdesk thread | `apps/api/src/channels/instagram/adapter.ts`, webhook `routes/v1/webhooks/instagram.ts` |
| ✅ #243 | 🛠️ Sonnet | **Facebook Messenger adapter** | FB Graph API, inbound → helpdesk thread | `apps/api/src/channels/messenger/adapter.ts`, webhook `routes/v1/webhooks/messenger.ts` |
| ✅ #244 | 🧠 Opus | **Universal inbox routing** | jedna thread entity napříč kanály, auto-link přes email/phone/social_id | rozšíření `db/schema/helpdesk.ts` o `channel` + `external_thread_id`, `services/helpdesk/universal-inbox.ts` |
| ✅ #245 | 🛠️ Sonnet | **Chat routing & assignment** | round-robin / skill-based / manual, agent availability status | `db/schema/agent-availability.ts`, `services/helpdesk/routing.ts` |
| 🔴 #246 | ⚡ Haiku | **Canned responses** | shared library per org, merge tags, kategorie | `db/schema/canned-responses.ts`, `routes/v1/helpdesk/canned.ts` |
| ✅ #247 | 🛠️ Sonnet | **Chat analytics** | response time, resolution time, CSAT, volume per channel | `services/helpdesk/analytics.ts` — rozšíření §15-C |
| ✅ #248 | 🛠️ Sonnet | **Aura Support Agent (AI)** | sumarizace konverzace, tone adjust, notes→message | `services/ai-support/{summarize,tone-adjust,note-to-message}.ts`, `routes/v1/ai-support.ts` |

#### C) Cloud Phone (Yodel.io-style VoIP)

Integrovaný cloud-based telefonní systém. MailForge má voice-bot (outbound AI calls), ale ne plnohodnotný VoIP pro agenty.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #249 | 🧠 Opus | **SIP/WebRTC calling** | Twilio Voice nebo Telnyx provider, inbound/outbound pro agenty | `apps/api/src/services/phone/voip.ts`, provider adapter pattern |
| ✅ #250 | 🛠️ Sonnet | **Phone numbers management** | pronájem/port čísel per org, assignment to users | `db/schema/phone-numbers.ts`, `routes/v1/phone/numbers.ts` |
| ✅ #251 | 🧠 Opus | **Call routing** | IVR, hunt groups, business hours, overflow → voice-bot | `services/phone/routing.ts`, `db/schema/call-routing.ts` |
| ✅ #252 | 🛠️ Sonnet | **Call recording & transcription** | S3 ukládání, Deepgram/Whisper transkripce, Claude summary | `services/phone/recording.ts`, `services/phone/transcription.ts` |
| ✅ #253 | 🛠️ Sonnet | **CRM integration** | vytvoř call activity na contact/deal, auto-log, click-to-call | rozšíření `db/schema/calls.ts` (již existuje) o agent_id, outcome, recording_url |
| ✅ #254 | 🛠️ Sonnet | **Voicemail** | inbound voicemail transcribe + notify agent | `services/phone/voicemail.ts` |
| ✅ #255 | 🛠️ Sonnet | **Agent softphone API** | WebSocket signaling pro browser-based softphone | `routes/v1/phone/softphone.ts` (WS endpoint) |

#### D) Meetings scheduler (Calendly-alternative)

Nativní plánovač schůzek v CRM (Brevo Meetings).

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #256 | 🛠️ Sonnet | **Booking pages** | public URL per user, available slots, timezone aware | `db/schema/booking-pages.ts`, `services/meetings/index.ts`, `routes/v1/meetings.ts` |
| ✅ #257 | 🛠️ Sonnet | **Event types** | 15min/30min/60min, buffer, min-notice, max-per-day | součást schema |
| ✅ #258 | 🧠 Opus | **Calendar sync** | Google Calendar + Microsoft Outlook (OAuth + CalDAV) | `services/meetings/calendar-sync.ts`, integrace v `integrations/{google,microsoft}/` |
| ✅ #259 | 🛠️ Sonnet | **Meeting links** | auto-create Zoom/Google Meet/Teams link | `services/meetings/video-links.ts` |
| ✅ #260 | 🛠️ Sonnet | **Meeting workflows** | triggery `meeting_booked`, `meeting_canceled`, `meeting_reminder` | rozšíření triggerů |
| ✅ #261 | 🛠️ Sonnet | **Round-robin scheduling** | team pool, fair distribution | `services/meetings/round-robin.ts` |
| ✅ #262 | 🧠 Opus | **Migrace 0018** | — | dodáno jako `drizzle/0038_phone_meetings_identity.sql` |

#### E) CDP vrstva (Octolis-style unified profiles)

Máme `identity-merge` (§14) a `warehouse-sync`, ale ne plnou CDP vrstvu pro realtime unifikaci.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #263 | 🛠️ Sonnet | **Source connectors** | CRM, ecom, support, ad platforms, analytics — pull/push do CDP tabulek | `db/schema/cdp-sources.ts`, `services/cdp/connectors/*` |
| ✅ #264 | 🧠 Opus | **Identity graph** | multi-signál resolution (email, phone, cookie, device_id, hashed_id, account_id) | `services/cdp/identity-graph.ts` (rozšíření identity-merge) |
| ✅ #265 | 🧠 Opus | **Unified profile view** | one-query merged profile napříč zdroji (cache-first) | `services/cdp/unified-profile.ts`, `routes/v1/cdp/profile.ts` |
| ✅ #266 | 🧠 Opus | **Data activation** | push segments/traits zpět do source systémů (reverse-ETL) | `services/cdp/activation.ts`, využívá warehouse-sync |
| ✅ #267 | 🧠 Opus | **Event ingestion API** | high-throughput events endpoint (batch, idempotent) | `routes/v1/cdp/events.ts`, Kafka topic |
| ✅ #268 | 🧠 Opus | **Trait computation** | real-time computed traits (LTV, last_purchase_at, total_orders) | `services/cdp/traits.ts`, materialized views v ClickHouse |

#### F) Aura Analytics — Natural-language dotazy

AI dotazy na datech v přirozeném jazyce → vizualizace / tabulka.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #269 | 🧠 Opus | **NL → SQL/segment query** | Claude tool-use: otázka → query plan → ClickHouse/PG dotaz → formát | `services/ai-analytics/nl-query.ts`, `routes/v1/ai-analytics.ts::ask` |
| ✅ #270 | 🧠 Opus | **Query sandboxing** | whitelist tabulek/sloupců, row-level org isolation, timeout | `services/ai-analytics/sandbox.ts` |
| ✅ #271 | 🛠️ Sonnet | **Chart suggestion** | vrátit i doporučený typ grafu (bar/line/pie/table) | součást nl-query |
| ✅ #272 | ⚡ Haiku | **Saved questions** | uložené dotazy per user/org | `db/schema/saved-queries.ts`, `services/ai-analytics/{pure,saved-queries}.ts` (isSafeReadOnlySql, suggestChartType, CRUD s visibility), `routes/v1/saved-queries.ts`, migrace `0058` |

#### G) Subaccounts (agentury / enterprise)

Parent-child organizační struktura, cross-account billing a správa.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #273 | 🧠 Opus | **Parent-child orgs** | `organizations.parent_org_id`, permissions inheritance | rozšíření `db/schema/organizations.ts` |
| ✅ #274 | 🛠️ Sonnet | **Cross-account user access** | user ↔ multiple orgs, rychlé přepínání | rozšíření `db/schema/organization-members.ts` |
| ✅ #275 | 🛠️ Sonnet | **Consolidated billing** | parent platí za children, per-child usage reports | `services/billing/subaccounts.ts` |
| ✅ #276 | 🛠️ Sonnet | **Shared assets** | templates/brand-kits sdílené z parent do children (read-only) | rozšíření editor routes o `shared_from_parent_org_id` |

#### H) Security & infrastructure extras

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| #277 | 🛠️ Sonnet | ✅ **IP restrictions** (per-org allowlist) | login + API blocked mimo allowlist | `db/schema/ip-restrictions.ts`, middleware `plugins/ip-restrictions.ts` |
| #278 | 🧠 Opus | ✅ **EU data residency mode** | per-org region flag → data sharded do EU DB cluster | rozšíření `organizations.ts` o `data_region` enum (us/eu), routing v DB layer |
| ✅ #279 | 🛠️ Sonnet | **Long-term log storage** (transactional) | archivace email_events > 30 dní do S3 parquet | `services/archive/email-events.ts`, worker job |
| ✅ #280 | 🛠️ Sonnet | **40+ webhook endpoints per org** | zvýšit limit + batching per endpoint | rozšíření `db/schema/webhooks.ts` o priority + batch_size |

#### I) Billing & packaging (per-email model alternative)

Brevo účtuje za e-maily, ne za kontakty. MailForge tohle má naplánované v billing fázi, ale stojí za zmínku:

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #281 | 🛠️ Sonnet | **Per-send pricing tier** | plán účtovaný za odeslané zprávy (ne za kontakty) | rozšíření `services/billing/plans.ts` (plán typ enum) |
| ✅ #282 | 🛠️ Sonnet | **Pay-As-You-Go credits** | předplacené kredity bez expirace, deduct per send | `db/schema/credit-balances.ts`, `services/billing/credits.ts` |
| ✅ #283 | 🛠️ Sonnet | **Multi-product billing** | separátní billing per modul (email/sms/whatsapp/voice/loyalty) | rozšíření billing services o product-aware meters |

#### J) Multi-channel transactional API enhancements

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #284 | 🛠️ Sonnet | **Batch send API** (až 1 000 personalizovaných v 1 callu) | array input, per-recipient merge vars, dedup | rozšíření `routes/v1/transactional.ts::batch` |
| ✅ #285 | 🛠️ Sonnet | **Unified messaging API** | jedna struktura pro email/sms/whatsapp — channel field + payload | `routes/v1/messaging/send.ts` (nový unified endpoint) |
| 🔴 #286 | 🛠️ Sonnet | **External feeds** | automatické data pulls (RSS/CSV/JSON URL) → contacts/events | `db/schema/external-feeds.ts`, `services/external-feeds/index.ts`, scheduled worker |

### 16.3. Záměrně nepokryto

- **Free plán branding ($10 odstranění loga)** — business model, neřešíme technicky.
- **Brevo Academy / community forum** — content a marketing, mimo backend scope.
- **Yodel.io fyzická telefonní infrastruktura** — řešíme přes Twilio/Telnyx provider adapter, ne vlastní telco.
- **Mobile app** — stále odloženo (backend only).
- **Facebook Ads nativní integrace** (FB reklamy z Brevo) — §7 TODO.md to už označilo jako out-of-scope.
- **Octolis UI dashboard** — backend CDP vrstva ano (E), UI později.

### 16.4. Priorita implementace

1. **Loyalty Program (A)** — unikátní diferenciátor, žádný konkurent ho nativně nemá. Migrace 0017.
2. **Universal Inbox + Aura Support (B)** — rozšiřuje existující helpdesk o social channels + AI.
3. **CDP vrstva (E)** — staví na identity-merge + warehouse-sync, realtime unifikace profilů.
4. **Meetings scheduler (D)** — synergické s Sales CRM z §15-A.
5. **Cloud Phone (C)** — synergické s existujícím voice-bot + Sales CRM.
6. **Subaccounts (G)**, **Aura Analytics (F)** — enterprise/agency enablement.
7. **Security extras (H)**, **Billing (I)**, **Batch/Unified API (J)** — fáze 9+ hardening.

---

## 17. HubSpot gap analýza — 2026-04-15
> **Hotovo:** 0/71 (0%)

Zdroj: `C:\Users\omnia\Downloads\HubSpot_Kompletni_Analyza_2026.md`. HubSpot je nejkompletnější all-in-one business platforma (7 Hubů + Breeze AI). Mnoho core funkcí už pokryto v §1–§16 (Sales CRM, Deals, Accounts, Meetings, Universal Inbox, AI agenti, attribution, custom reports, 2FA, SSO, audit logs, custom objects, progressive profiling). Tato sekce pokrývá HubSpot-unikátní moduly, které ještě chybí.

### 17.1. Co už máme ✅

Sales CRM (§15-A), Predictive lead scoring + Win Probability (§15-B), Meetings (§16-D), Universal Inbox (§16-B), Cloud Phone (§16-C), Custom objects + Social enrichment (§15-F), Progressive profiling (§15-C), Autonomous AI agents + MCP (§15-D), Aura Analytics NL→SQL (§16-F), Revenue attribution (§6), Shopify/Woo/Salesforce/HubSpot/Calendly integrace (§15-H), Liquid templating (§1.1), Sandboxes přes EU residency (§16-H), IP restrictions (§16-H), Subaccounts parent-child (§16-G), CDP unified profiles (§16-E).

### 17.2. HubSpot-specific mezery → k implementaci (❌ → 📋)
> **Hotovo:** 0/71 (0%)

#### A) SEO Tooling (Content Hub)

Žádný z analyzovaných konkurentů nemá integrovaný SEO modul. HubSpot má topic clusters + keyword research + on-page audit. Má smysl pouze pokud přidáme i blog/content layer.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #287 | 🛠️ Sonnet | **Topic clusters & pillar pages** | organizace contentu do clusterů, pillar ↔ spokes relace | `db/schema/seo-clusters.ts`, `services/seo/clusters.ts`, `routes/v1/seo/clusters.ts` |
| ✅ #288 | 🛠️ Sonnet | **Keyword research** | Claude + SERP scraper: volume, difficulty, intent per keyword | `services/seo/keyword-research.ts` (provider adapter: DataForSEO/Semrush API), `routes/v1/seo/keywords.ts` |
| ✅ #289 | 🛠️ Sonnet | **On-page SEO audit** | URL → analýza: title, meta, H1-H6, alt texty, word count, readability, internal links | `services/seo/on-page-audit.ts`, `routes/v1/seo/audit.ts` |
| ✅ #290 | 🧠 Opus | **Content strategy AI** | Claude agent: seed topic → cluster návrh + blog titulů | `services/ai-agents/seo-strategist.ts` |
| ✅ #291 | ⚡ Haiku | **Sitemap + robots.txt + canonical** | auto-generate per content collection | `services/seo/pure.ts` (renderSitemap, renderRobotsTxt, canonicalize s UTM/gclid strip), `services/seo/sitemap.ts` (generateSitemap s extensible sources), `routes/v1/seo/sitemap.ts` (GET /seo/sitemap.xml + /seo/robots.txt) |
| ✅ #292 | 🛠️ Sonnet | **Search ranking tracker** | poll Google SERP pozice per keyword/URL (DataForSEO) | `services/seo/rank-tracker.ts`, scheduled worker |

#### B) Social Media Management

V §7 TODO.md bylo označeno jako out-of-scope, ale HubSpot + Brevo mají plnohodnotný social module. **Reconsider** — navrhujeme implementovat jako samostatný modul, protože je to standardní funkce all-in-one platforem.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #293 | 🛠️ Sonnet | **Social accounts connect** | OAuth s Facebook/Instagram/LinkedIn/X (Twitter)/TikTok | `db/schema/social-accounts.ts`, `services/social/accounts.ts`, `routes/v1/social/accounts.ts` |
| ✅ #294 | 🛠️ Sonnet | **Social publishing & scheduling** | post → scheduled, media upload, multi-platform cross-post | `db/schema/social-posts.ts`, `services/social/publisher.ts`, scheduled worker |
| ✅ #295 | 🛠️ Sonnet | **Social content calendar** | kalendář view per channel, drag-to-reschedule | rozšíření `routes/v1/marketing-calendar.ts` o social |
| ✅ #296 | 🛠️ Sonnet | **Social monitoring** | mentions/keywords → events + notifikace | `services/social/monitoring.ts`, `routes/v1/social/mentions.ts` |
| ✅ #297 | 🛠️ Sonnet | **Social inbox** | comments/DMs → Universal Inbox (§16-B) thread | rozšíření `services/helpdesk/universal-inbox.ts` o social_comment kanál |
| ✅ #298 | 🛠️ Sonnet | **Social analytics** | impressions, engagement, followers, best-time | `services/social/analytics.ts`, `routes/v1/social/analytics.ts` |
| ✅ #299 | 🧠 Opus | **Breeze Social Agent (AI)** | Claude agent: trending topics → draft post per channel + hashtags | `services/ai-agents/social.ts` |
| ✅ #300 | 🧠 Opus | **Migrace 0019** | — | `drizzle/0019_social_ads.sql` (shipped as `0045_social_ads.sql`) |

#### C) Ads Management

§7 TODO.md také out-of-scope, ale HubSpot má nativní ad management se sync do CRM. **Reconsider** pro value-add (leads z ads → workflow triggers).

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #301 | 🛠️ Sonnet | **Ad platform connections** | OAuth s Facebook Ads / Google Ads / LinkedIn Ads / TikTok Ads | `db/schema/ad-accounts.ts`, `services/ads/accounts.ts` |
| ✅ #302 | 🛠️ Sonnet | **Audience sync (CRM → Ad platforms)** | push segment jako Custom Audience / Matched Audience | `services/ads/audience-sync.ts` |
| ✅ #303 | 🛠️ Sonnet | **Lookalike audience generation** | seed segment → lookalike request přes API | `services/ads/lookalike.ts` |
| ✅ #304 | 🛠️ Sonnet | **Lead sync (Ads → CRM)** | FB Lead Ads / LinkedIn Lead Gen Forms → contacts + workflow trigger | `services/ads/lead-sync.ts`, webhook `routes/v1/webhooks/ads.ts` |
| ✅ #305 | 🛠️ Sonnet | **Ad performance reporting** | impressions/clicks/cost/conversions sjednoceně | `services/ads/reporting.ts`, rozšíření `routes/v1/analytics.ts` |
| ✅ #306 | 🛠️ Sonnet | **Attribution to ads** | UTM + view-through → revenue attribution | rozšíření `services/revenue-attribution` o ad-source |
| ✅ #307 | 🛠️ Sonnet | **Retargeting workflows** | segment → automatic audience push s refresh | action `sync_to_ad_audience` ve workflows |

#### D) Commerce Hub (quotes / invoicing / subscriptions / payments)

HubSpot Commerce Hub + Stripe. Synergické se Sales CRM (§15-A).

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #308 | 🛠️ Sonnet | **Quotes / Proposals** | generovat PDF quote z deal (line items, terms), e-sign flow | `db/schema/quotes.ts`, `services/commerce/quotes.ts`, `routes/v1/commerce/quotes.ts` |
| ✅ #309 | 🛠️ Sonnet | **E-signature** | built-in nebo adapter na DocuSign/HelloSign | `services/commerce/e-signature.ts` (provider adapter) |
| ✅ #310 | 🛠️ Sonnet | **Products / Line items** | product catalog, SKU, price tiers, recurring flag | `db/schema/products.ts`, `services/commerce/products.ts` |
| ✅ #311 | 🛠️ Sonnet | **Invoicing** | invoice generation z deal/subscription, PDF, reminders | `db/schema/invoices.ts`, `services/commerce/invoicing.ts`, worker `invoice-reminder` |
| ✅ #312 | 🛠️ Sonnet | **Payment processing** | Stripe integrace — collect payment per invoice/quote | `services/commerce/payments.ts` (Stripe provider) |
| ✅ #313 | 🧠 Opus | **Subscriptions management** | recurring billing, upgrade/downgrade, proration, dunning | `db/schema/subscriptions.ts`, `services/commerce/subscriptions.ts`, `routes/v1/commerce/subscriptions.ts` |
| ✅ #314 | 🧠 Opus | **Dunning workflows** | failed payment → retry + email sequence | template ve `services/workflows/templates/dunning.ts` |
| ✅ #315 | 🧠 Opus | **Revenue schedule & recognition** | MRR/ARR tracking, revenue recognition for accounting | `services/commerce/revenue-schedule.ts` |
| ✅ #316 | 🧠 Opus | **Migrace 0020** | — | `drizzle/0020_commerce_hub.sql` (shipped as `0046_ads_commerce.sql`) |

#### E) Lifecycle Stages & Associations engine

HubSpot Smart CRM má lifecycle_stage jako first-class pole + generic associations mezi entitami. MailForge má `contact_status` ale ne lifecycle journey stages.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #317 | 🛠️ Sonnet | **Lifecycle stages** | předdefinované: subscriber → lead → MQL → SQL → opportunity → customer → evangelist (customizable) | `enums.ts::lifecycleStageEnum` + `contacts.lifecycle_stage/lifecycle_stage_entered_at` + `lifecycle_stage_history`, `services/lifecycle/{pure.ts,index.ts}` (canTransition, transitionStage, suggestedStageFromSignals), routes `/api/v1/contacts/:id/lifecycle`, migrace `0056` | ✅ |
| ✅ #318 | 🛠️ Sonnet | **Stage transition triggers** | workflows triggered on `lifecycle_stage_changed` | enum `lifecycle_stage_changed` + `transitionStage` emituje přes `onApiEvent` | ✅ |
| ✅ #319 | 🧠 Opus | **Stage auto-advance rules** | "MQL → SQL if score > 80 AND has_meeting_booked" | `db/schema/lifecycle-rules.ts`, `services/lifecycle/auto-advance.ts` |
| ✅ #320 | 🧠 Opus | **Associations engine** (generic M:N) | contact ↔ company, contact ↔ deal, company ↔ deal, deal ↔ ticket, custom ↔ custom | `db/schema/associations.ts` (generic entity_type/entity_id pairs), `services/associations/index.ts`, `routes/v1/associations.ts` |
| 🔴 #321 | 🛠️ Sonnet | **Association labels** | custom relationship types: "primary contact", "decision maker", "referred by" | součást associations schema |
| 🔴 #322 | 🛠️ Sonnet | **Company-based workflows** | workflows triggered on company events (enriched, deal won, ARR threshold) | rozšíření `services/workflows/triggers.ts` o company_* triggers |
| 🔴 #323 | 🛠️ Sonnet | **Ticket-based workflows** | workflows na helpdesk events (ticket_created, sla_breached, reopened) | rozšíření triggerů o ticket_* |

#### F) Sales Hub extras

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| 🔴 #324 | 🛠️ Sonnet | **Playbooks** | standardizované sales scripty (call script, discovery Q&A) s checklist + logging | `db/schema/playbooks.ts`, `services/crm/playbooks.ts`, `routes/v1/crm/playbooks.ts` |
| ✅ #325 | 🧠 Opus | **1:1 video messaging** | rep nahraje krátké video (browser) → link v emailu s play tracking | `services/video/recorder.ts` (S3 upload + HLS transcode worker), `db/schema/video-messages.ts`, `routes/v1/video.ts` |
| 🔴 #326 | 🛠️ Sonnet | **Record rotation / round-robin assignment** (generalized) | fair distribution dealů/leadů/tiketů na tým | `services/crm/rotation.ts`, action `rotate_to_user` |
| 🔴 #327 | 🛠️ Sonnet | **Quotes templating** | HTML/Liquid templates per brand | rozšíření quotes (§D) |
| 🔴 #328 | 🛠️ Sonnet | **Sales sequences cadence** | více-kanálové sekvence: email → LinkedIn → call task → email (již v §15-B) | doplnění o LinkedIn InMail adapter v `services/crm/sales-sequences` |

#### G) Breeze-specific AI agents (rozšíření §15-D)

§15-D má autonomous agent framework a Campaign Builder. HubSpot má 4 konkrétní agenti — dodefinujeme je jako first-class Claude agents.

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #329 | 🧠 Opus | **Prospecting Agent** | input = ICP → research target accounts (firmographic + intent + news) → personalized outreach draft | `services/ai-agents/prospecting.ts`, napojeno na social enrichment + intent data |
| ✅ #330 | 🧠 Opus | **Customer Agent** (autonomous support) | trained na KB + helpdesk history + blog → autonomně odpovídá na tickety, eskaluje při nízké confidence | `services/ai-agents/customer-support.ts`, napojeno na helpdesk + RAG vector store |
| 🔴 #331 | 🛠️ Sonnet | **Content Agent** | generuje blog/landing/email/podcast-script z brand voice + product data | `services/ai-agents/content.ts` (generalizace stávajícího `generate-email`) |
| ✅ #332 | 🧠 Opus | **Deal Loss / Health Agent** | analyzuje historii uzavřených dealů → identifikuje loss patterns, flaguje at-risk deals | `services/ai-agents/deal-health.ts`, rozšíření §15-B deal-risk |
| 🔴 #333 | 🛠️ Sonnet | **Buyer intent signals** | third-party intent data providers (Bombora/6sense adapter) + site activity intent score | `db/schema/intent-signals.ts`, `services/intent/provider-adapter.ts`, `services/intent/scoring.ts` |
| 🔴 #334 | 🛠️ Sonnet | **Form autofill (identified visitor)** | cookie/IP → known contact → pre-fill form fields in API | rozšíření `services/signup-forms` o `autofill.ts` |
| ✅ #335 | 🧠 Opus | **RAG vector store** | per-org knowledge base embeddings pro Customer/Content agents | `db/schema/kb-embeddings.ts` (pgvector), `services/rag/index.ts` |

#### H) Content extras (Blog only — website builder stále 🚫)

Blog přidáváme (stát se content platformou pro SEO), ale plný website builder / landing page builder stále out-of-scope (stejně jako v §5).

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #336 | 🛠️ Sonnet | **Blog platform** (API-first / headless) | posts, kategorie, tagy, autoři, draft/published, scheduled — duplicitní s #412, shipped session 6 | `db/schema/blog.ts`, `services/blog/{index,pure,ctas}.ts`, `routes/v1/blog.ts` |
| 🔴 #337 | 🛠️ Sonnet | **Blog → email automation** | new post → trigger workflow + RSS email campaign | rozšíření RSS campaigns (§1.2) |
| ✅ #338 | 🧠 Opus | **Multi-language content** | content variants per locale, auto-detect reader locale, fallback chain | rozšíření editor schema + blog schema o `locale`, `translations` relační tabulka |
| 🔴 #339 | 🛠️ Sonnet | **Content staging / versioning** | draft → staged → published, revision history | rozšíření blog + landing schema o `version` + `published_version_id` |
| 🔴 #340 | 🛠️ Sonnet | **CTAs (Calls-to-Action) widgets** | clickable buttons/popups/banners s A/B, analytics, smart content (segment-based) | `db/schema/ctas.ts`, `services/ctas/index.ts`, `routes/v1/ctas.ts`, served přes site-tracker (§15-C) |
| 🔴 #341 | 🛠️ Sonnet | **Smart/Dependent forms** | field visibility podmíněná předchozí odpovědí | rozšíření signup-forms schema o `visibility_rules` per field |

#### I) Platform extras

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #342 | 🧠 Opus | **Sandboxes** (dev/test env per org) | isolated schema copy, seed z production subset, jobs no-op mode | `services/sandboxes/index.ts`, `db/schema/sandboxes.ts`, CLI `packages/cli/sandbox-create.ts` |
| ✅ #343 | 🧠 Opus | **Partitioning / Teams** | team-scoped data access (kontakty, deals, tickets per team), cross-team roles | `db/schema/teams.ts`, `db/schema/team-members.ts`, row-level filter middleware |
| ✅ #344 | 🧠 Opus | **Field-level permissions** | role → allowed fields per entity (skrytí revenue pro non-managers) | `db/schema/field-permissions.ts`, rozšíření `plugins/auth.ts` |
| ✅ #345 | 🛠️ Sonnet | **Custom permission sets** | opakovaně použitelné sady oprávnění | `db/schema/permission-sets.ts` (permission_sets + user_permission_sets), `services/auth/permission-sets/{pure,index}.ts` (ROLE_PERMISSIONS owner=`*` / admin / editor / viewer, resolveEffectivePermissions, hasPermission s `prefix:*` wildcards, findInvalidPermission, canonicalisePermissions; CRUD + assign/unassign + getEffectivePermissions; +20 testů) |
| ✅ #346 | 🧠 Opus | **Serverless functions in workflows** | user code (sandboxed V8/QuickJS isolate) jako action step | `services/workflows/serverless-runner.ts` (isolated-vm), action type `run_code` |
| ✅ #347 | 🧠 Opus | **Custom Channels API** | SDK pro přidání vlastního messaging kanálu (Telegram, Signal, Discord) | `packages/channel-sdk/`, registrace přes `routes/v1/channels/register.ts` |
| 🔴 #348 | 🛠️ Sonnet | **CRM extension cards (backend SDK)** | 3rd-party apps mohou přidat data panel na contact/deal view přes iframe+API | rozšíření `services/app-studio` (§15-H) o card registrace |
| ✅ #349 | ⚡ Haiku | **Data quality automation** | auto-format: phone E.164, email lowercase, name TitleCase, country ISO | `services/data-quality/normalizers.ts` (pure: normaliseEmail/normalisePhone/normaliseName/normaliseCountry + normaliseContact aggregator + 33 testů) |
| ✅ #350 | 🧠 Opus | **Calculated properties** | user-defined computed fields: "days_since_last_order = NOW - last_order_at" | `db/schema/calculated-properties.ts`, evaluator `services/calculated-props/evaluator.ts` |

#### J) Deliverability extras

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #351 | 🛠️ Sonnet | **Graymail suppression** | auto-pause sending to contacts with zero engagement > N dní | `services/deliverability/{pure.ts,graymail.ts}` (classifyGraymail 4-tier + `sweepOrg` s tagováním), route `POST /api/v1/deliverability/graymail/sweep` |
| ✅ #352 | 🛠️ Sonnet | **Email health score per domain/IP** | composite: bounce rate, spam rate, complaint rate, inbox placement | `services/deliverability/{pure.ts::computeEmailHealthScore,health-score.ts::computeOrgHealth}`, route `GET /api/v1/deliverability/health-score?days=&domain=&ip=` |
| ✅ #353 | 🧠 Opus | **Deliverability insights / recommendations** | rules engine: "hard-bounce rate > 2% → warn + suggestions" | `services/deliverability/insights.ts` |
| 🔴 #354 | 🛠️ Sonnet | **Sender reputation monitoring** | integrace se SenderScore / Google Postmaster / Microsoft SNDS | `services/deliverability/reputation.ts` (provider adapters) |

#### K) Data Hub — programmable data operations

| ID | Model | Funkce | Popis | Soubory |
|---|---|---|---|---|
| ✅ #355 | 🧠 Opus | **Bi-directional CRM data sync** | HubSpot/Salesforce/Pipedrive → field-level bi-sync, conflict resolution | rozšíření §15-H integrations o `services/data-sync/engine.ts`, `db/schema/data-sync-mappings.ts` |
| ✅ #356 | 🛠️ Sonnet | **Data sets** (named queries) | saved SQL/segment queries reusable napříč reporty | `db/schema/data-sets.ts` (kind enum sql/segment/aggregate), `services/data-sets/{pure,index}.ts` (bindParameters `:name → $N`, findUndeclaredPlaceholders, cacheKey, prepareQuery s SQL allowlist), `routes/v1/data-sets.ts`, migrace `0059` |
| ✅ #357 | 🧠 Opus | **Programmable automation** | drag-drop data transform steps: filter/map/aggregate/join (vedle workflow actions) | `services/data-ops/pipeline.ts`, `db/schema/data-pipelines.ts` |

### 17.3. Záměrně nepokryto

- **Website builder (CMS Hub)** — stále 🚫 (viz §5). Blog ano (§H), plný CMS ne.
- **Landing page builder UI** — plný drag-drop builder odložen (backend-only fáze).
- **HubSpot Academy / certifikace** — business/content, ne backend.
- **Mobile app, business card scanner** — backend only.
- **Per-seat pricing** — billing decision, ne engineering.
- **Onboarding fees** — business model.
- **HubL šablonový jazyk** — máme Liquid ✅, duplicitní nedoplňujeme.

### 17.4. Priorita implementace

1. **Lifecycle Stages & Associations (E)** — fundament pro HubSpot-grade CRM, rozšiřuje §15-A. Low-effort, high-leverage.
2. **Commerce Hub (D)** — synergické se Sales CRM, dokončuje full sales→cash cyklus. Migrace 0020.
3. **Sales Hub extras (F)** — playbooks + 1:1 video + rotation.
4. **Breeze AI agents (G)** — Customer Agent, Prospecting, Buyer Intent, RAG — extends §15-D autonomous framework.
5. **Deliverability extras (J)** — graymail + health score. Low-effort, dávno žádáno.
6. **Social Media (B) + Ads (C)** — reconsider out-of-scope decision; migrace 0019. Important pro full-funnel positioning.
7. **Platform extras (I)** — sandboxes + teams/partitioning + serverless funkce + calculated properties. Enterprise-grade.
8. **Content/Blog (H)** — API-first blog + CTAs + multi-language. Prerequisite pro SEO (A).
9. **SEO tooling (A)** — topic clusters + keyword research + rank tracker. Závislé na (H).
10. **Data Hub (K)** — bi-sync + data sets + programmable automation. Fáze 9+.

---

## 18. Ecomail gap analýza — 2026-04-15
> **Hotovo:** 0/25 (0%)

Zdroj: `C:\Users\omnia\Downloads\Ecomail_Kompletni_Analyza_2026.md`. Ecomail je česká SMB platforma (6 000+ zákazníků, 200M Kč obrat). Většina jeho funkcí je už v MailForge pokryta ze silnější konkurence (Mailchimp/Klaviyo/AC/Brevo/HubSpot). Unikátní Ecomail value-add je **český lokalizační modul** + **CZ/SK e-commerce integrace** — nutné pokud MailForge cílí CZ/SK trh.

### 18.1. Hodnocení priority

Každá položka označena jako:
- 🔴 **NUTNÉ** — bez toho nelze konkurovat Ecomailu na CZ/SK trhu
- 🟡 **OBOHACENÍ** — hodnotný add-on, ne kritický
- ⚪ **POKRYTO** — už v §1–§17 (pro úplnost, neimplementujeme znovu)
- 🚫 **SKIP** — out-of-scope nebo business decision

### 18.2. Co už máme ⚪

Drag-drop editor, 170+ šablon (rozšiřitelné z 10), AI subject/content, merge tagy, dynamic content, product blocks, saved blocks, A/B, RSS, transactional API, bounce management, web tracking (§15-C), Facebook Custom Audiences + Lead Ads (§17-C), Shopify/Woo/BigCommerce/Magento (§15-H), RFM (§14), AI product recommendations (§1.8), slevové kupóny (§14), surveys (§4.3), double opt-in, webhooks, heat maps, revenue attribution, kreditový billing (§16-I), EU data residency (§16-H), external data feeds (§16-J), multi-language content (§17-H).

### 18.3. Ecomail-unikátní mezery pro CZ/SK trh
> **Hotovo:** 0/25 (0%)

#### A) 🔴 Český/slovenský lokalizační modul (NUTNÉ)

Bez tohoto na CZ/SK trhu neprodáme — Ecomail tohle má jako killer feature a my nemáme nic.

| ID | Model | Funkce | Popis | Navrhované soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #358 | 🧠 Opus | **Skloňování českých jmen** (5. pád / vocative) | merge tag `{{contact.first_name \| vocative}}` → "Petr" → "Petře"; knihovna deklinačních pravidel + výjimky | `packages/i18n-cs/src/vocative.ts` (nový package), rozšíření `apps/editor/src/render/merge-tags.ts` o filtry `vocative`/`genitive`/`dative`/`accusative`/`locative`/`instrumental` | ✅ |
| ✅ #359 | 🧠 Opus | **Slovenské skloňování** | obdobně pro SK (7 pádů) | `packages/i18n-sk/src/cases.ts`, stejné merge filtry | ✅ |
| ✅ #360 | ⚡ Haiku + 🛠️ Sonnet | **Český kalendář svátků (jmeniny)** | databáze jmenin → trigger `name_day_today` → auto-email na kontakty se shodným jménem | `packages/i18n-cs/src/name-days.ts` (366 days, normalized match), enum + `processDailyNameDayTriggers` v `services/workflows/triggers.ts`, migrace `0051_name_day_trigger.sql` | ✅ |
| ✅ #361 | ⚡ Haiku | **Slovenský kalendář svátků** | obdobně pro SK | `packages/i18n-sk/src/name-days.ts` (366 dní SK meniny), rozšíření `processDailyNameDayTriggers` o locale switch cs/sk v `triggerConfig` + 10 testů | ✅ |
| 🔴 #362 | ⚡ Haiku + 🛠️ Sonnet | **České/slovenské státní svátky** | calendar data pro marketing workflow triggery ("2 dny před Vánocemi") | `packages/i18n-cs/src/public-holidays.ts`, `packages/i18n-sk/src/public-holidays.ts`, trigger `n_days_before_holiday` | 🟡 |
| ✅ #363 | ⚡ Haiku | **Lokalizace UI/emails** | CZ/SK překlady system emailů (preference centre, opt-in, unsubscribe, password reset) | `packages/shared/src/i18n/{emails.cs.ts,emails.sk.ts,emails.en.ts,types.ts,index.ts}` (resolver + `t()`), `apps/api/src/services/system-emails/index.ts` (renderDoi/PasswordReset/EmailVerification/TeamInvite), `subscriptions.ts` přepsán na i18n | ✅ |
| ✅ #364 | 🛠️ Sonnet | **CZ/SK fakturace** | CZK měna, DPH 21%, číslování faktur per rok, ISDOC export pro české účetnictví | `services/commerce/invoicing-cz.ts` (CZ_VAT_RATES, computeVatBreakdown, formatCzInvoiceNumber, isValidIco/Dic/Psc, formatCzk), `services/commerce/isdoc-export.ts` (ISDOC 6.0.2 XML) | ✅ |
| ✅ #365 | ⚡ Haiku | **Bank account QR code (SPAYD)** | czech payment QR code na fakturách | `services/commerce/spayd.ts` (buildSpaydString + validace VS/KS/SS) | ✅ |

#### B) 🔴 CZ/SK e-commerce integrace (NUTNÉ)

Shoptet je dominantní CZ platforma (40%+ českých e-shopů). Bez tohoto ztrácíme celý CZ SMB e-commerce segment.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #366 | 🛠️ Sonnet | **Shoptet integrace** | OAuth + webhook: contacts, orders, products, abandoned carts bi-sync | `db/schema/ecommerce-integrations.ts` (+enum, +ShoptetCredentials), `services/ecommerce/index.ts` (OAuth, refresh, HMAC verify, normalizeShoptetOrder, testConnection), `integrations/shoptet/{index.ts,pure.ts}`, `routes/v1/ecommerce-integrations.ts` (install/callback + webhook), migrace `0052_shoptet_platform.sql` | ✅ |
| ✅ #367 | 🛠️ Sonnet | **Upgates integrace** | API-based contact+order sync | enum +`upgates` + `UpgatesCredentials`, `integrations/upgates/{index.ts,pure.ts}`, routes install + webhook, migrace `0053` | ✅ |
| ✅ #368 | 🛠️ Sonnet | **FastCentrik integrace** | XML feed + orders API sync | enum +`fastcentrik`, `FastCentrikCredentials`, `integrations/fastcentrik/{pure.ts,index.ts}` (mini XML parser + `parseFastCentrikOrdersFeed` + `ingestFeed`), routes install + `/pull`, migrace `0053` | ✅ |
| 🔴 #369 | ⚡ Haiku | **Shoptet app listing** | submit MailForge do Shoptet App Store (business ops, ale technicky vyžaduje spec OAuth flow) | — | 🟡 |

#### C) 🔴 Raynet CRM integrace (NUTNÉ pro CZ B2B)

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #370 | 🛠️ Sonnet | **Raynet CRM bi-sync** | contacts + deals + companies bi-directional sync | `db/schema/raynet.ts` (connection + 3× remote-id maps), `integrations/raynet/{pure.ts,client.ts,sync.ts,index.ts}` (listContacts/Companies/Deals + pullContacts/Companies/Deals), `routes/v1/raynet.ts` (connect/test/sync/disconnect), migrace `0054` | ✅ |

#### D) 🟡 Seznam Email deliverability (OBOHACENÍ)

Seznam.cz je druhý největší email provider v ČR (~20% tržní podíl). Má specifická pravidla pro inbox placement.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #371 | ⚡ Haiku | **Seznam Email headers** | Precedence/Feedback-ID/Auto-Submitted + volitelný `X-Seznam-Campaign-Category`; ISP resolver + throttle defaults | `apps/engine/internal/email/headers.go` (+`headers_test.go`), rozšíření `smtp/sender.go` Message {CampaignID, SendingDomain, CampaignCategory, Stream} |  ✅ |
| 🔴 #372 | 🛠️ Sonnet | **Seznam Postmaster sledování** | parse Seznam deliverability feedback | rozšíření §17-J `services/deliverability/reputation.ts` o Seznam adapter | 🟡 |
| ✅ #373 | ⚡ Haiku | **Email.cz / Volny.cz / Centrum.cz pravidla** | ISP detekce + `RecommendedThrottle()` defaults pro CZ poskytovatele | `apps/engine/internal/email/headers.go::ResolveIsp`/`RecommendedThrottle` | ✅ |

#### E) 🟡 Workflow export/import (OBOHACENÍ)

Sdílení workflow mezi účty / agenturami / template marketplace.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #374 | 🛠️ Sonnet | **Workflow JSON export** | serializace workflow (nodes, edges, config) do verzovaného JSON + hash | `services/workflows/export.ts`, `routes/v1/workflows/export.ts` | 🟡 |
| 🔴 #375 | 🛠️ Sonnet | **Workflow JSON import** | validace + migrace staré verze → import | `services/workflows/import.ts`, `routes/v1/workflows/import.ts` | 🟡 |
| 🔴 #376 | 🛠️ Sonnet | **Workflow template marketplace** | public katalog sdílených workflow (per-org visibility) | rozšíření `services/workflows/templates/` o `marketplace.ts`, `db/schema/workflow-templates-public.ts` | ⚪ (částečně §17-I App Studio) |

#### F) 🟡 Survey sentiment auto-tagging (OBOHACENÍ)

Ecomail má flow "hodnocení s automatickým štítkováním (spokojen/nespokojen)" — rating ≥ 4 → tag `satisfied`, ≤ 2 → tag `unsatisfied` + notify sales.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #377 | 🛠️ Sonnet | **Survey response → auto-action rules** | per-question mapping: rating/choice → action (add_tag, update_field, trigger_workflow) | rozšíření `services/surveys/index.ts` o `response-rules.ts`, schema rozšíření o `response_actions` JSONB | 🟡 |
| 🔴 #378 | ⚡ Haiku | **NPS / CSAT out-of-box** | předdefinované survey šablony + auto-tag promoters/passives/detractors | `services/surveys/nps-csat.ts` | 🟡 |

#### G) 🟡 Product XML feed auto-ingestion (OBOHACENÍ)

Mnoho českých e-shopů publikuje Heureka/Zbozi/Google Shopping XML feed. Umíme produktová doporučení, ale chybí auto-import z feedu.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #379 | 🛠️ Sonnet | **Product feed ingestion** | URL → scheduled fetch → parse (Heureka XML / Google Shopping / Zbozi.cz / custom XML+XSD) → product catalog | `db/schema/product-feeds.ts` (+ enum), `services/product-catalog/{feed-adapters.ts,feed-ingestion.ts}` (`ingestFeed`/`listDueFeeds`), `routes/v1/product-feeds.ts`, migrace `0055` | ✅ |
| ✅ #380 | ⚡ Haiku + 🛠️ Sonnet | **Heureka feed adapter** | CZ-specific Heureka XML schema | `services/product-catalog/feed-adapters.ts::parseHeurekaFeed` | ✅ |
| ✅ #381 | ⚡ Haiku + 🛠️ Sonnet | **Zbozi.cz feed adapter** | CZ-specific Zbozi XML | `services/product-catalog/feed-adapters.ts::parseZboziFeed` | ✅ |
| ✅ #382 | ⚡ Haiku + 🛠️ Sonnet | **Google Shopping feed adapter** | RSS/Atom Google Shopping format | `services/product-catalog/feed-adapters.ts::parseGoogleShoppingFeed` | ✅ |

### 18.4. Záměrně nepokryto

- **Kompletně česká UI (rozhraní + nápověda)** — 🚫 UI je odložené celkově; až přijde UI fáze, i18n framework (§A) už bude připraven.
- **Česká komunita / blog / webináře** — 🚫 marketing a content-ops, ne backend.
- **Telefonická podpora v češtině** — 🚫 business ops.
- **Live chat Ecomail podpory** — 🚫 náš helpdesk ✅ se týká našich klientů, ne podpora nám.
- **Lokální CZ konzultace / onboarding** — 🚫 business services.
- **42+ integrace specificky** — většina už pokryta v §15-H / §17-K. CZ-specific doplněny v §B/§C výše.

### 18.5. Priorita implementace

1. 🔴 **A) Český/slovenský lokalizační modul** — skloňování + jmeniny + státní svátky jako `packages/i18n-cs` / `packages/i18n-sk`. Bez toho žádný CZ/SK market fit.
2. 🔴 **B) Shoptet + Upgates integrace** — největší CZ e-shop platformy. Paralelně s (1).
3. 🔴 **C) Raynet CRM integrace** — CZ B2B segment.
4. 🟡 **D) Seznam Email deliverability headers** — low effort, high value pro CZ inbox placement.
5. 🟡 **F) Survey sentiment auto-tagging** — rozšíření existujícího survey modulu.
6. 🟡 **G) Product feed ingestion (Heureka/Zbozi)** — doplnění e-commerce stacku pro CZ.
7. 🟡 **E) Workflow export/import** — nice-to-have pro agentury a template sharing.
8. 🟡 **A.pozdní) CZ fakturace + ISDOC** — až s §17-D Commerce Hub.

### 18.6. Celkové hodnocení

Ecomail přidává k naší stack analýze **pouze CZ/SK lokalizační vrstvu** (vše ostatní už máme hlouběji z konkurence). Ale ta vrstva je kritická — český trh má 10M+ potenciálních uživatelů a MailForge bez skloňování jmen, Shoptet integrace a Seznam kompatibility tam nemá šanci proti Ecomailu. Doporučuji sekci §A + §B + §C zařadit **dříve než většinu §17 HubSpot advanced features**, pokud CZ/SK trh je strategická priorita.

---

## 19. Globální priorita implementace — CZ-first launch
> **Hotovo:** 2/30 (7%)

**Strategické rozhodnutí (2026-04-15):** MailForge se spouští nejprve na **českém trhu (ČR)**. Další země (SK → EU → global) přibývají v dalších fázích.

### 19.1. Dopad na priority
> **Hotovo:** 2/30 (7%)

Toto rozhodnutí **přeskupuje priority** předchozích sekcí. Následující pořadí nahrazuje dílčí priority uvnitř §14–§18.

#### Fáze L0 — Launch prerequisites (MUST před alfa na CZ trhu)

| ID | Model | # | Úkol | Sekce | Proč L0 |
|---|---|---|---|---|---|
| ✅ #383 | 🧠 Opus | 1 | České + slovenské skloňování (vocative + 7 pádů) | §18-A | `packages/i18n-cs/src/{vocative,cases}.ts` + `packages/i18n-sk/src/{vocative,cases}.ts` shipped; vocative bug -ek (Marek→Marku) opraven 2026-04-25 |
| ✅ #384 | ⚡ Haiku + 🛠️ Sonnet | 2 | Jmeniny kalendář + workflow trigger | §18-A | Ecomail feature, kterou CZ marketéři používají. Low effort, high marketing value |
| ✅ #385 | ⚡ Haiku | 3 | CZ/SK lokalizace system emailů (preference centre, opt-in, unsubscribe) | §18-A | GDPR compliance + uživatelská přívětivost |
| ✅ #386 | 🛠️ Sonnet | 4 | **Shoptet integrace** (OAuth + webhooks + orders + abandoned cart sync) | §18-B | Shoptet ovládá ~40% CZ e-shopů — větší dopad než Shopify |
| ✅ #387 | ⚡ Haiku | 5 | **Seznam Email deliverability headers + ISP rules** | §18-D | Seznam.cz je #2 v CZ (~20% uživatelů) |
| ✅ #388 | 🛠️ Sonnet | 6 | CZ fakturace: CZK měna, DPH 21%, ISDOC export (§17-D subset) | §18-A + §17-D | Legální povinnost pro CZ billing |
| ✅ #389 | ⚡ Haiku + 🛠️ Sonnet | 7 | CZ + SK veřejné svátky kalendář | §18-A | `packages/i18n-cs/src/public-holidays.ts` (11 fixed + Velký pátek/Velikonoční pondělí computed via Meeus/Jones/Butcher) + analog SK (13 fixed + 2 Easter), workflow trigger `n_days_before_holiday` (locale + daysAhead + holidayKeys filter + listId scope), enum hodnota přidána. 36 testů. Bonus: odstraněn HLR-zbytkový `phone_status_change` z trigger enum. |

#### Fáze L1 — CZ market fit completion (do 3 měsíců po alfa)

| ID | Model | # | Úkol | Sekce |
|---|---|---|---|---|
| ✅ #390 | 🛠️ Sonnet | 8 | **Upgates** integrace | §18-B |
| ✅ #391 | 🛠️ Sonnet | 9 | **Raynet CRM** bi-sync | §18-C |
| ✅ #392 | 🛠️ Sonnet | 10 | **FastCentrik** integrace | §18-B |
| ✅ #393 | 🛠️ Sonnet | 11 | **Heureka/Zbozi.cz XML feed** ingestion | §18-G |
| ✅ #394 | 🧠 Opus | 12 | Lifecycle stages + Associations engine | §17-E |
| ✅ #395 | 🧠 Opus + 🛠️ Sonnet | 13 | Sales CRM (Pipelines/Deals/Accounts/Tasks) | §15-A kompletní (#183-#194); nově extrahováno `services/crm/pure.ts` (computeMonthlyForecast, computeWinLoss, computeAverageCycleDays, computeStageDistribution, computeRepPerformance) + 14 unit testů; forecasting.ts refaktorován na delegaci pure.ts |
| ✅ #396 | 🧠 Opus + 🛠️ Sonnet | 14 | Loyalty Program | §16-A §16.A kompletní (#234-#245); nově `services/loyalty/pure.ts` (validateTiers, validateExpiryPolicy, resolveTier, getNextTier, applyTierMultiplier, computeExpiresAt) + 20 unit testů |
| ✅ #397 | 🛠️ Sonnet | 15 | Graymail suppression + email health score | §17-J |

#### Fáze L2 — Feature parity s konkurencí (po CZ product-market fit)

| ID | Model | # | Úkol | Sekce |
|---|---|---|---|---|
| ✅ #398 | 🧠 Opus | 16 | Sales Engagement AI (Win Probability, Sentiment) | §15-B kompletní (#195-#200); nově `services/ai-sales/pure.ts` (scoreDealRisk, sentimentLabel, weightedSentiment s decay half-life) + 11 unit testů |
| ✅ #399 | 🧠 Opus + 🛠️ Sonnet | 17 | Commerce Hub (quotes, invoicing, subscriptions) | §17-D §17.D + #310-#315 kompletní (invoicing/quotes/subscriptions/payments/e-sig/revenue-schedule); nově `services/commerce/pure.ts` (computeMrr, addInterval, computeProration, computeQuoteTotals) + 18 unit testů |
| ✅ #400 | 🧠 Opus + 🛠️ Sonnet | 18 | Meetings scheduler | §16-D §16.D + #261 kompletní (booking-pages, calendar-sync, round-robin, video-links, workflows); nově `services/meetings/pure.ts` (pickHostOrder, computeFreeSlots, intersectFreeSlots, sliceIntoSlots) + 16 unit testů |
| ✅ #401 | 🧠 Opus + 🛠️ Sonnet | 19 | Universal Inbox (IG DM, FB Messenger) | §16-B #244 kompletní; nově `services/helpdesk/pure.ts` (normalizeInboxIdentity, CHANNEL_PRIORITY, chooseReuseTicket s 4 pravidly thread/identity/contact/none) + 13 testů |
| ✅ #402 | 🧠 Opus | 20 | CDP vrstva | §16-E §16.E + #260-#270 kompletní (identity-graph, unified-profile, activation, traits, event-ingestion, source-sync); nově `services/cdp/pure.ts` (normaliseSignal, DEFAULT_SIGNAL_CONFIDENCE, shouldMergeProfiles, resolveTrait) + 14 testů |
| ✅ #403 | 🧠 Opus + 🛠️ Sonnet | 21 | Cloud Phone | §16-C §16.C + #255-#262 kompletní (voip, routing, recording, transcription, voicemail, crm-integration); nově `services/phone/pure.ts` (isWithinBusinessHours s timezone + holidays, normalizeE164, selectHuntPool 4 strategií) + 17 testů |
| ✅ #404 | 🛠️ Sonnet | 22 | Site messages + Web personalization | §15-C #202/#203 kompletní (site-messages + web-personalization services); nově `services/site-messages/pure.ts` (matchesCondition pro 8 triggerů, matchesAllConditions, canShowMessage s cooldown) + 18 testů |
| ✅ #405 | 🧠 Opus | 23 | Breeze AI agents (Prospecting, Customer, Content, Buyer Intent) | §17-G kompletní (campaign-builder, customer-support, deal-health, prospecting, seo-strategist, social, runner); nově `services/ai-agents/pure.ts` (scoreDealHealth 4-tier, scoreProspect s ICP+intent+engagement váhami, aggregateIntent s exponenciální decay) + 16 testů |
| #406 | 🧠 Opus | 24 | ✅ Autonomous AI + MCP server | §15-D |

#### Fáze L3 — Mezinárodní expanze (SK → EU)

| ID | Model | # | Úkol | Sekce |
|---|---|---|---|---|
| ✅ #407 | 🧠 Opus + 🛠️ Sonnet | 25 | **Slovenská** lokalizace + Shoptet.sk + slovenský účetní export | §18-A/B SK meniny #361 nyní, CS+SK skloňování (#358/#359 předtím), SK i18n system emails (#385 předtím), Shoptet se nasadí na .sk bez změny. ISDOC export v `isdoc-export.ts` funguje i pro SK DIČ |
| ✅ #408 | 🧠 Opus | 26 | Multi-language content framework pro editor/blog | §17-H #338 + `services/i18n/translation.ts` kompletní; nově `services/i18n/pure.ts` (parseLocale, localeFallbackChain, selectVariant s exact/language/default/any matching, collectTextNodes JSON-pointer walker, applyTranslations merge, validateMergeTags) + 21 unit testů |
| ✅ #409 | 🛠️ Sonnet | 27 | Multi-currency billing (EUR, USD, GBP) | §17-D `services/commerce/currency.ts` (SUPPORTED_CURRENCIES CZK/EUR/USD/GBP + CURRENCY_INFO, convertAmount pivot via USD, roundForCurrency, formatCurrency s Intl, sumInTargetCurrency pro portfolio totals) + 18 unit testů |
| ✅ #410 | 🧠 Opus | 28 | ✅ EU data residency modes | §16-H `dataRegionEnum` (us/eu/ap) + `organizations.dataRegion` + sandbox inheritance už existuje; nově `services/data-residency/pure.ts` (DEFAULT_ENDPOINTS per region, resolveRegionEndpoints, guardCrossRegion, suggestRegionForCountry s EU+APAC mapping) + 16 unit testů |
| ✅ #411 | 🛠️ Sonnet | 29 | SEO tooling | §17-A §17.A + #289/#290 kompletní; nově #291 sitemap + robots + canonical + `services/seo/pure.ts` (audit HTML extractors, Flesch-Kincaid, detectIssues, renderSitemap, renderRobotsTxt, canonicalize s 13 default tracking params) + 25 unit testů |
| ✅ #412 | 🛠️ Sonnet | 30 | Blog platform + CTAs | §17-H | shipped session 6: blog_posts/revisions/categories/authors + ctas/cta_variants/cta_impressions tabs, services/blog + sitemap include |

#### Fáze L4 — Scale & enterprise (global)

Social Media (§17-B), Ads Management (§17-C), Subaccounts (§16-G), Sandboxes + Teams + Field-level perms (§17-I), Data Hub (§17-K), Aura Analytics (§16-F), Autonomous AI advanced features, HIPAA mode.

### 19.2. Deferred do L2+

Záměrně odložené z L0/L1, aby alfa launch byl rychlý:
- SSO/SAML, HIPAA, SOC 2 → L3+ (enterprise buyers nejsou v CZ SMB alfa targetu)
- Mobile app → L4+
- Website builder → trvale out-of-scope (§5)
- 1000+ integrace marketplace → L3+ (v L0/L1 jen Shoptet/Upgates/Raynet/Shopify/Woo)

### 19.3. Jazykové defaults

- **Primary locale**: `cs-CZ`
- **Secondary locale** (add L3): `sk-SK`
- **Fallback**: `en-US`
- **System emails** se renderují podle `contact.locale`, fallback `org.default_locale`, pak `en-US`.
- **API** zůstává anglicky (error codes, field names), pouze user-facing content je lokalizovaný.

---

## 20. SmartEmailing gap analýza — 2026-04-15
> **Hotovo:** 7/28 (25%)

Zdroj: `C:\Users\omnia\Downloads\SmartEmailing_Kompletni_Analyza_2026.md`. SmartEmailing je česká platforma (Shoptet-focused, 99,9% deliverability, landing pages). 85% funkcí je už pokryto po §18 Ecomail analýze (skloňování, jmeniny, Shoptet, Upgates, CZ fakturace, produktové feedy, workflow export/import, multi-eshop přes subaccounts). Tato sekce pokrývá jen to, co SmartEmailing má navíc — hlavně **Viber** a **Sklik** (unikátní pro CZ trh, kritické pro §19 L0/L1).

### 20.1. Co už máme ⚪

Drag-drop editor, šablony, HTML editor, personalizace, skloňování (§18-A), jmeniny (§18-A), dynamic content, product feeds (§18-G), A/B testing (§1.2), automation scénáře, transactional emails, Shoptet + Upgates (§18-B), WooCommerce (§15-H), SMS, web tracking (§15-C), Facebook Custom Audiences + Lead Ads (§17-C), forms (popup, embedded, slide-in), WordPress plugin možný přes signup forms, double opt-in, GDPR export/smazání, webhooks, multi-eshop přes subaccounts (§16-G), workflow export/import (§18-E), welcome/birthday/abandoned-cart templates, send-time optimization (§1.4), A/B ve workflows (§1.2 + workflows), gender-agnostic merge tagy, surveys (§4.3), order status triggers (§6 + §15-A deal triggery).

### 20.2. SmartEmailing-unikátní mezery → k implementaci
> **Hotovo:** 7/28 (25%)

#### A) 🔴 Viber Business Messages (NUTNÉ pro L0/L1 CZ launch)

Viber má v CZ/SK/východní Evropě 40–60% penetraci v některých segmentech (finance, telco, retail). SmartEmailing ho má jako killer feature. WhatsApp adapter máme, Viber ne — přidat jako paralelní channel.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| #413 | 🛠️ Sonnet | ✅ **Viber Business adapter** | `IChannelAdapter` implementace: send, status, estimate_cost, handle_inbound, validate_template | `apps/api/src/channels/viber/adapter.ts` | 🔴 L0 |
| #414 | 🛠️ Sonnet | ✅ **Viber Rakuten API integrace** | provider: Rakuten Viber Business Messages API (nebo Infobip/MessageBird jako fallback) | `apps/api/src/channels/viber/providers/{rakuten,infobip,messagebird}.ts` | 🔴 L0 |
| #415 | 🛠️ Sonnet | ✅ **Viber campaign type** | campaign_type enum rozšířen o `viber` | rozšíření `db/schema/campaigns.ts`, `services/campaigns/index.ts` | 🔴 L0 |
| #416 | 🛠️ Sonnet | ✅ **Viber workflow action** | `send_viber` action ve workflows (paralelně s `send_whatsapp`) | rozšíření `services/workflows/actions.ts` | 🔴 L0 |
| #417 | 🛠️ Sonnet | ✅ **Viber templates** | template registry pro Viber (schvalované přes Rakuten), s fallback na SMS | `db/schema/viber-templates.ts`, `services/viber/templates.ts` | 🔴 L0 |
| #418 | 🛠️ Sonnet | ✅ **Viber → SMS fallback** | pokud Viber nedoručen do N minut → SMS (cascade delivery pattern) | rozšíření `services/workflows/actions.ts::executeCascade` | 🟡 L1 |
| #419 | 🧠 Opus | ✅ **Migrace 0021** | — | `drizzle/0021_viber_sklik.sql` (spojená s B) | — |

#### B) 🔴 Sklik (Seznam.cz) ads integrace (NUTNÉ pro L0/L1 CZ launch)

Sklik je český ekvivalent Google Ads — dominantní na CZ SERP (Seznam.cz drží ~20% searches). §17-C Ads má FB/Google/LinkedIn, ale ne Sklik. Pro CZ launch je to povinné.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| ✅ #420 | 🛠️ Sonnet | **Sklik OAuth connection** | OAuth s Sklik.cz Business API | `integrations/sklik/{pure,oauth}.ts` (buildAuthorizeUrl, normaliseTokenResponse, shouldRefresh s 60s skew, encodeForm, isValidRedirectUri https/localhost) + exchangeCode/ensureFreshAccessToken/disconnect, `'sklik'` přidán do `AD_PLATFORMS`. 15 pure testů. |
| ✅ #421 | 🛠️ Sonnet | **Sklik audiences sync** | push segment jako Sklik Custom Audience (hash email/phone) | `services/ads/providers/sklik/{pure,audience-sync}.ts` (hashEmailForSklik/hashPhoneForSklik SHA-256, buildAudiencePayload, chunk 50k batch, computeStats), wired do main `services/ads/audience-sync.ts` switch case `sklik` (fetches phone+email). 17 pure testů. |
| ✅ #422 | 🛠️ Sonnet | **Sklik retargeting pixel** | pixel snippet pro web → hash tracking + audience building | `services/ads/providers/sklik/pixel.ts` (generateSklikSnippet IE11+ s `forgemsg.identify`, hashEmail SHA-256, isValidSiteToken, parseTrackingEvent, resolveTrackedSite, recordPixelEvent → site_page_views + contact resolution, buildAudienceFromPixel s sinceDays okno) + 2 public endpointy `/sklik-pixel/:siteToken.js` + `/sklik-pixel/:siteToken/event.gif` (no-cache 1×1 GIF) v `routes/v1/sklik-pixel.ts`. 16 pure testů. |
| 🔴 #423 | 🛠️ Sonnet | **Sklik lookalike** | seed segment → Sklik lookalike request | `services/ads/providers/sklik/lookalike.ts` |  🟡 L1 |
| 🔴 #424 | 🛠️ Sonnet | **Sklik conversion tracking** | conversion events → Sklik API pro attribution | `services/ads/providers/sklik/conversions.ts` |  🟡 L1 |

#### C) 🟡 Gender inference z jména (OBOHACENÍ L0/L1)

České jméno většinou jednoznačně určuje pohlaví. Užitečné pro personalizaci ("Vážený pane" vs "Vážená paní") a segmentaci.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #425 | 🧠 Opus | **CZ/SK gender inference** | lookup table + regex pravidla (příjmení -ová → ženské, jména Petr/Pavel/… → mužské, Anna/Jana/… → ženské); confidence score | `packages/i18n-cs/src/gender.ts`, `packages/i18n-sk/src/gender.ts` | 🟡 L1 |
| 🔴 #426 | 🛠️ Sonnet | **Auto-fill gender při importu** | při importu kontaktu bez gender pole → infer z first_name, pokud confidence > 0.9 | rozšíření `services/import/*` o `gender-enrichment.ts` | 🟡 L1 |
| 🔴 #427 | 🛠️ Sonnet | **Salutation merge tag** | `{{contact | salutation_cs}}` → "Vážený pane Nováku" / "Vážená paní Nováková" s deklinací | rozšíření `apps/editor/src/render/merge-tags.ts` + `packages/i18n-cs/src/salutation.ts` | 🟡 L1 |
| 🔴 #428 | ⚡ Haiku | **International fallback** | pokud locale není cs/sk, zkusit genderize.io API nebo vynechat | provider adapter | ⚪ L3 |

#### D) 🟡 GDPR Processing Purposes (Účely zpracování) s expirací (OBOHACENÍ)

SmartEmailing má pokročilou GDPR vrstvu: kontakt má **N účelů zpracování** (marketing, newsletter, profilování, třetí strany…), každý s **legal basis** (consent/contract/legitimate interest) a **expiration date**. Po expiraci → automatické odhlášení z konkrétního účelu + workflow notifikace.

MailForge má `contact_status` jako single enum. Tohle je pokročilejší.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #429 | 🛠️ Sonnet | **Processing purposes schema** | per-org definice purposes: marketing_email, newsletter, profiling, 3rd_party_share, transactional | `db/schema/processing-purposes.ts` |  🟡 L1 |
| 🔴 #430 | 🛠️ Sonnet | **Contact-purpose consent tracking** | per-contact per-purpose: granted_at, legal_basis, source, expires_at, revoked_at | `db/schema/contact-consents.ts`, `services/gdpr/consents.ts` |  🟡 L1 |
| 🔴 #431 | ⚡ Haiku | **Consent expiration worker** | scheduled job: expires_at < NOW → revoke + emit event `consent_expired` | worker `apps/workers/src/jobs/consent-expiration.ts` |  🟡 L1 |
| 🔴 #432 | 🧠 Opus | **Purpose-aware sending** | send guardrail: campaign má `required_purpose`, recipient bez consent → skip + log | rozšíření `services/campaigns/send-guardrail.ts` |  🟡 L1 |
| 🔴 #433 | 🛠️ Sonnet | **Consent workflow triggers** | triggery `consent_granted`, `consent_expired`, `consent_revoked` | rozšíření `services/workflows/triggers.ts` |  🟡 L1 |
| 🔴 #434 | 🛠️ Sonnet | **Preference centre rozšíření** | preference page per-purpose toggle místo single unsubscribe | rozšíření `routes/v1/subscriptions.ts::preferences` |  🟡 L1 |
| 🔴 #435 | 🛠️ Sonnet | **Double opt-in per purpose** | separate confirmation per purpose | rozšíření `services/signup-forms` |  🟡 L1 |

#### E) 🟡 Digital product delivery automation (OBOHACENÍ)

"Expedice elektronického obsahu" — po zaplacené objednávce digitálního produktu automaticky doručit (PDF, download link, access code, license key) s expirací linku.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #436 | 🛠️ Sonnet | **Digital asset delivery** | upload digital assets per produkt, secure time-limited download URLs | `db/schema/digital-assets.ts`, `services/commerce/digital-delivery.ts`, S3 presigned URLs | 🟡 L2 |
| 🔴 #437 | 🛠️ Sonnet | **License key generator** | pool of pre-generated keys nebo algorithmic generation per SKU | `services/commerce/license-keys.ts` |  🟡 L2 |
| 🔴 #438 | ⚡ Haiku | **Workflow template "digital product delivery"** | trigger: order_paid + product.type=digital → send email s personalized link/key | `services/workflows/templates/digital-delivery.ts` |  🟡 L2 |
| 🔴 #439 | 🛠️ Sonnet | **Download tracking** | per-contact download attempts, limit N per link | rozšíření digital-assets schema |  🟡 L2 |

#### F) 🟡 VirusFree-equivalent deliverability signal (OBOHACENÍ)

SmartEmailing má VirusFree certifikaci (česká antispam org). To samo nemá technickou paritu, ale naznačuje, že warm-up + reputation signaling má být viditelné jako trust badge.

| ID | Model | Funkce | Popis | Soubory | Priorita |
|---|---|---|---|---|---|
| 🔴 #440 | 🛠️ Sonnet | **Sender reputation public badge** | veřejný score per odesílací doménu (warm-up status, bounce rate, complaint rate) pro transparentnost | rozšíření §17-J health-score o public endpoint `routes/public/reputation/:domain.ts` |  ⚪ L2 (pokryto §17-J) |

### 20.3. Záměrně nepokryto

- **Landing page builder** — stále 🚫 (§5). SmartEmailing ho má, my ne. Pokud CZ prodej potvrdí potřebu, reconsider v L3+.
- **Dotazníky** — ⚪ už máme v §4.3 + §18-F (sentiment auto-tagging).
- **Shoptet specialisté, design na míru, konzultace** — 🚫 business services, ne backend.
- **VirusFree certifikace** — 🚫 business/compliance badge, technicky pokryto §17-J.
- **Data na vlastních CZ serverech** — částečně pokryto §16-H EU data residency; dedicated CZ region lze v L3+ jako compliance variant.
- **14denní trial, veřejný vs neveřejný ceník PRO** — 🚫 business/billing decisions.

### 20.4. Aktualizovaná priorita v kontextu §19

Tato analýza **dodává do §19 L0/L1 tyto položky**:

**Fáze L0 (doplnění):**
- Viber Business adapter (§20-A)
- Sklik OAuth + audiences + retargeting pixel (§20-B)

**Fáze L1 (doplnění):**
- Gender inference + CZ/SK salutation (§20-C)
- GDPR processing purposes + consent expiration (§20-D)
- Viber → SMS cascade fallback (§20-A)
- Sklik lookalike + conversion tracking (§20-B)

**Fáze L2 (doplnění):**
- Digital product delivery automation (§20-E)

### 20.5. Celkové hodnocení

SmartEmailing přidává oproti Ecomailu **Viber + Sklik + gender inference + GDPR purposes** — první dva jsou kritické pro CZ market fit (každý CZ marketér očekává Sklik stejně jako Google Ads, Viber je regional messaging standard), zbytek je obohacení. Landing pages a website builder záměrně vynecháváme.

**Závěr:** Po §18 (Ecomail) a §20 (SmartEmailing) máme kompletní gap analýzu CZ trhu. MailForge s implementovanou §18 + §20 L0/L1 bude nad úrovní obou českých konkurentů (hlubší AI, CDP, Sales CRM z §14–§17) při zachování lokálního fit.

---

## 21. Claude model assignment — který model řeší který bod
> **Hotovo:** 0/214 (0%)

Každý úkol z §14–§20 má přiřazený Claude model podle složitosti. Cíl: využít nejschopnější model tam, kde je to potřeba, a šetřit náklady na boilerplate.

### 21.1. Kritéria výběru modelu

- **🧠 Opus 4.6** (`claude-opus-4-6`) — architektura, novel algoritmy, komplexní ML/AI, bezpečnostně-kritický kód, multi-service refactory s hlubokým pochopením domény, generic engine designs (associations, serverless runner, identity graph), NL→SQL sandboxing, sales AI modely.
- **🛠️ Sonnet 4.6** (`claude-sonnet-4-6`) — většina feature implementací: CRUD routes, services, schema, channel/integration adaptéry, workflow templates, REST klienti, CRON worker jobs, testy.
- **⚡ Haiku 4.5** (`claude-haiku-4-5-20251001`) — boilerplate: jednoduché schema fields, i18n JSON překlady, static data seeding (jmeniny, svátky), ISP header configs, prosté CRUD routes bez business logiky, refresh jobs.

Při pochybnostech: **start se Sonnetem**, eskaluj na Opus pokud úkol vyžaduje novel decision-making nebo cross-cutting refactor.

### 21.2. Mapování podle sekcí
> **Hotovo:** 0/211 (0%)

#### §14 — Klaviyo parity (většina hotovo)

| ID | Model | Úkol |
|---|---|---|
| 🔴 #441 | 🧠 Opus | RFM klasifikace (recency/frequency/monetary score → 11 segmentů) |
| 🔴 #442 | 🧠 Opus | Smart Sending frequency cap + cooldown logika |
| 🔴 #443 | 🛠️ Sonnet | Quiet Hours (timezone-aware) |
| 🔴 #444 | 🛠️ Sonnet | Back-in-stock / price-drop alerts |
| 🔴 #445 | 🛠️ Sonnet | Unique coupon batches (generator + pool) |
| 🔴 #446 | 🛠️ Sonnet | Reviews + moderation queue |
| 🔴 #447 | 🛠️ Sonnet | Scheduled reports dispatch |
| 🔴 #448 | 🧠 Opus | Holdout groups (deterministic hash-mod) |
| 🔴 #449 | 🧠 Opus | Cohort / Funnel / Timeline analytics |
| 🔴 #450 | 🛠️ Sonnet | Catalog insights |
| 🔴 #451 | 🛠️ Sonnet | Helpdesk + marketing pause on open ticket |
| 🔴 #452 | 🧠 Opus | Warehouse sync (S3/Snowflake/BigQuery/Redshift) |
| 🔴 #453 | 🛠️ Sonnet | SMS keyword routing |
| 🔴 #454 | 🛠️ Sonnet | Multi-email profily (až 5 emailů/kontakt) |
| 🔴 #455 | 🧠 Opus | Identity merge (visitor → contact backfill) |
| 🔴 #456 | 🛠️ Sonnet | RCS messaging adapter |

#### §15 — ActiveCampaign parity

| ID | Model | Úkol |
|---|---|---|
| 🔴 #457 | 🧠 Opus (architektura) + 🛠️ Sonnet (CRUD vrstvy) | **A) Sales CRM** — pipelines, deals, accounts schema + services |
| 🔴 #458 | 🛠️ Sonnet | A) Task management + notes + activity feed |
| 🔴 #459 | 🧠 Opus | A) Sales reports, win/loss, revenue forecasting |
| 🔴 #460 | 🛠️ Sonnet | A) Deal stage change triggers ve workflows |
| 🔴 #461 | 🧠 Opus | **B) Win Probability AI model** |
| 🔴 #462 | 🧠 Opus | B) Deal risk assessment |
| 🔴 #463 | 🧠 Opus | B) Sentiment Analysis (Claude analýza) |
| 🔴 #464 | 🛠️ Sonnet | B) Automated 1:1 sales emails |
| 🔴 #465 | 🛠️ Sonnet | B) Sales engagement sequences |
| 🔴 #466 | 🧠 Opus | B) Predictive Lead Scoring (ML rozšíření) |
| 🔴 #467 | 🛠️ Sonnet | **C) Site tracking JS snippet** |
| 🔴 #468 | 🛠️ Sonnet | C) Site messages (behavior-triggered) |
| 🔴 #469 | 🛠️ Sonnet | C) Web personalization (hide/show DOM) |
| 🔴 #470 | 🛠️ Sonnet | C) Connected sites (multi-domain sync) |
| 🔴 #471 | 🛠️ Sonnet | C) Progressive profiling |
| 🔴 #472 | 🛠️ Sonnet | C) Live chat WebSocket endpoint |
| 🔴 #473 | 🧠 Opus | **D) AI Campaign Builder (autonomous agent)** |
| 🔴 #474 | 🧠 Opus | D) Autonomous AI agent runner framework |
| 🔴 #475 | 🛠️ Sonnet | D) AI sidebar / recommendations API |
| 🔴 #476 | 🧠 Opus | D) **MCP Server** (Postmark-style) |
| 🔴 #477 | 🛠️ Sonnet | D) AI Calendly Block (smart scheduling) |
| 🔴 #478 | 🧠 Opus | D) Voice Agent streaming API |
| 🔴 #479 | 🛠️ Sonnet | **E) Nested automations + automation maps** |
| 🔴 #480 | ⚡ Haiku (šablony) | E) 900+ workflow recipes expansion |
| 🔴 #481 | 🛠️ Sonnet | E) Click actions (tag/update on click) |
| 🔴 #482 | 🧠 Opus | **F) Custom objects engine** |
| 🔴 #483 | 🛠️ Sonnet | F) Social enrichment adapter |
| 🔴 #484 | 🧠 Opus | F) BotSense (bot click detection) |
| 🔴 #485 | 🛠️ Sonnet | F) List warming scheduler |
| 🔴 #486 | 🧠 Opus | **G) Inbound email (MX receiver Go)** |
| 🔴 #487 | 🛠️ Sonnet | G) Message streams (broadcast vs transactional) |
| 🔴 #488 | ⚡ Haiku | G) Activity export |
| 🔴 #489 | 🛠️ Sonnet (každá) | **H) Integrace: Shopify/Woo/BigCommerce** |
| 🔴 #490 | 🧠 Opus | H) Salesforce bi-sync |
| 🔴 #491 | 🛠️ Sonnet | H) HubSpot integrace |
| 🔴 #492 | 🛠️ Sonnet | H) Calendly, Stripe (extended) |
| 🔴 #493 | 🧠 Opus | H) App Studio (low-code builder) |
| 🔴 #494 | 🧠 Opus | **I) SSO (SAML 2.0)** |
| 🔴 #495 | 🧠 Opus | I) HIPAA compliance mode |
| 🔴 #496 | 🛠️ Sonnet | I) Audit logs |
| 🔴 #497 | 🛠️ Sonnet | I) DMARC Digests parser |

#### §16 — Brevo parity

| ID | Model | Úkol |
|---|---|---|
| 🔴 #498 | 🧠 Opus (architektura) | **A) Loyalty program schema + points ledger** |
| 🔴 #499 | 🛠️ Sonnet | A) Rewards catalog + redemption flow |
| 🔴 #500 | 🛠️ Sonnet | A) Earning rules engine |
| 🔴 #501 | 🛠️ Sonnet | A) Loyalty webhooks + workflow triggers |
| 🔴 #502 | 🛠️ Sonnet | A) Loyalty analytics |
| 🔴 #503 | 🛠️ Sonnet | **B) Instagram DM adapter** |
| 🔴 #504 | 🛠️ Sonnet | B) Facebook Messenger adapter |
| 🔴 #505 | 🧠 Opus | B) Universal inbox routing logic |
| 🔴 #506 | 🛠️ Sonnet | B) Chat routing + agent assignment |
| 🔴 #507 | ⚡ Haiku | B) Canned responses |
| 🔴 #508 | 🛠️ Sonnet | B) Chat analytics |
| 🔴 #509 | 🛠️ Sonnet | B) Aura Support AI (summarize/tone/note→msg) |
| 🔴 #510 | 🧠 Opus | **C) SIP/WebRTC calling (Twilio/Telnyx adapter)** |
| 🔴 #511 | 🛠️ Sonnet | C) Phone numbers management |
| 🔴 #512 | 🧠 Opus | C) Call routing (IVR, hunt groups) |
| 🔴 #513 | 🛠️ Sonnet | C) Call recording + transcription |
| 🔴 #514 | 🛠️ Sonnet | C) CRM call integration |
| 🔴 #515 | 🛠️ Sonnet | C) Voicemail + softphone WS API |
| 🔴 #516 | 🛠️ Sonnet | **D) Meetings booking pages + event types** |
| 🔴 #517 | 🧠 Opus | D) Calendar sync (Google/Outlook OAuth+CalDAV) |
| 🔴 #518 | 🛠️ Sonnet | D) Zoom/Meet/Teams link generation |
| 🔴 #519 | 🛠️ Sonnet | D) Round-robin scheduling |
| 🔴 #520 | 🛠️ Sonnet | **E) CDP source connectors** |
| 🔴 #521 | 🧠 Opus | E) Identity graph (multi-signal resolution) |
| 🔴 #522 | 🧠 Opus | E) Unified profile view + cache |
| 🔴 #523 | 🧠 Opus | E) Data activation (reverse-ETL) |
| 🔴 #524 | 🧠 Opus | E) Event ingestion API (high-throughput) |
| 🔴 #525 | 🧠 Opus | E) Real-time trait computation |
| 🔴 #526 | 🧠 Opus | **F) NL→SQL query engine** |
| 🔴 #527 | 🧠 Opus | F) Query sandboxing + row-level isolation |
| 🔴 #528 | 🛠️ Sonnet | F) Chart suggestion |
| 🔴 #529 | ⚡ Haiku | F) Saved questions |
| 🔴 #530 | 🧠 Opus | **G) Parent-child orgs + permission inheritance** |
| 🔴 #531 | 🛠️ Sonnet | G) Cross-account user access |
| 🔴 #532 | 🛠️ Sonnet | G) Consolidated billing |
| 🔴 #533 | 🛠️ Sonnet | G) Shared assets |
| 🔴 #534 | 🛠️ Sonnet | **H) IP restrictions middleware** |
| 🔴 #535 | 🧠 Opus | H) EU data residency (multi-region routing) |
| 🔴 #536 | 🛠️ Sonnet | H) Long-term log archive (S3 parquet) |
| 🔴 #537 | 🛠️ Sonnet | H) Webhook batching |
| 🔴 #538 | 🛠️ Sonnet | **I) Per-send pricing tier** |
| 🔴 #539 | 🛠️ Sonnet | I) Pay-as-you-go credit system |
| 🔴 #540 | 🛠️ Sonnet | I) Multi-product metering |
| 🔴 #541 | 🛠️ Sonnet | **J) Batch send API (1000 per call)** |
| 🔴 #542 | 🛠️ Sonnet | J) Unified messaging API |
| 🔴 #543 | 🛠️ Sonnet | J) External feeds ingestion |

#### §17 — HubSpot parity

| ID | Model | Úkol |
|---|---|---|
| 🔴 #544 | 🛠️ Sonnet | **A) Topic clusters + pillar pages** |
| 🔴 #545 | 🛠️ Sonnet | A) Keyword research (DataForSEO/Semrush adapter) |
| 🔴 #546 | 🛠️ Sonnet | A) On-page SEO audit |
| 🔴 #547 | 🧠 Opus | A) Content strategy AI agent |
| 🔴 #548 | ⚡ Haiku | A) Sitemap + robots.txt + canonical |
| 🔴 #549 | 🛠️ Sonnet | A) Search rank tracker |
| 🔴 #550 | 🛠️ Sonnet | **B) Social accounts OAuth (FB/IG/LI/X/TikTok)** |
| 🔴 #551 | 🛠️ Sonnet | B) Social publishing + scheduler |
| 🔴 #552 | 🛠️ Sonnet | B) Social monitoring |
| 🔴 #553 | 🛠️ Sonnet | B) Social inbox (extends §16-B) |
| 🔴 #554 | 🛠️ Sonnet | B) Social analytics |
| 🔴 #555 | 🧠 Opus | B) Breeze Social Agent (AI) |
| 🔴 #556 | 🛠️ Sonnet | **C) Ad platform OAuth** |
| 🔴 #557 | 🛠️ Sonnet | C) Audience sync (CRM→Ads) |
| 🔴 #558 | 🛠️ Sonnet | C) Lookalike audience API |
| 🔴 #559 | 🛠️ Sonnet | C) Lead sync (Ads→CRM) |
| 🔴 #560 | 🛠️ Sonnet | C) Ad performance reporting + attribution |
| 🔴 #561 | 🛠️ Sonnet | C) Retargeting workflows |
| 🔴 #562 | 🛠️ Sonnet | **D) Quotes generation + e-sign** |
| 🔴 #563 | 🛠️ Sonnet | D) Products/line items catalog |
| 🔴 #564 | 🛠️ Sonnet | D) Invoicing + PDF + reminders |
| 🔴 #565 | 🛠️ Sonnet | D) Stripe payments integration |
| 🔴 #566 | 🧠 Opus | D) Subscriptions + dunning |
| 🔴 #567 | 🧠 Opus | D) Revenue schedule / MRR tracking |
| 🔴 #568 | 🛠️ Sonnet | **E) Lifecycle stages + history** |
| 🔴 #569 | 🛠️ Sonnet | E) Stage transition triggers ve workflows |
| 🔴 #570 | 🧠 Opus | E) Stage auto-advance rules engine |
| 🔴 #571 | 🧠 Opus | **E) Associations engine (generic M:N)** |
| 🔴 #572 | 🛠️ Sonnet | E) Association labels |
| 🔴 #573 | 🛠️ Sonnet | E) Company-based + ticket-based workflows |
| 🔴 #574 | 🛠️ Sonnet | **F) Playbooks (scripts + checklist + logging)** |
| 🔴 #575 | 🧠 Opus | F) 1:1 video messaging (record + HLS transcode) |
| 🔴 #576 | 🛠️ Sonnet | F) Record rotation / round-robin (generic) |
| 🔴 #577 | 🛠️ Sonnet | F) LinkedIn InMail adapter |
| 🔴 #578 | 🧠 Opus | **G) Prospecting Agent** |
| 🔴 #579 | 🧠 Opus | G) Customer Agent (autonomous support) |
| 🔴 #580 | 🛠️ Sonnet | G) Content Agent |
| 🔴 #581 | 🧠 Opus | G) Deal Health / Loss Agent |
| 🔴 #582 | 🛠️ Sonnet | G) Buyer intent signals (Bombora/6sense) |
| 🔴 #583 | 🛠️ Sonnet | G) Form autofill (identified visitor) |
| 🔴 #584 | 🧠 Opus | G) RAG vector store (pgvector) |
| 🔴 #585 | 🛠️ Sonnet | **H) Blog platform (API-first)** |
| 🔴 #586 | 🧠 Opus | H) Multi-language content framework |
| 🔴 #587 | 🛠️ Sonnet | H) Content staging/versioning |
| 🔴 #588 | 🛠️ Sonnet | H) CTAs widgets + A/B |
| 🔴 #589 | 🛠️ Sonnet | H) Smart/dependent forms |
| 🔴 #590 | 🧠 Opus | **I) Sandboxes (isolated schema copies)** |
| 🔴 #591 | 🧠 Opus | I) Teams/partitioning (row-level filter) |
| 🔴 #592 | 🧠 Opus | I) Field-level permissions |
| 🔴 #593 | 🛠️ Sonnet | I) Custom permission sets |
| 🔴 #594 | 🧠 Opus | I) **Serverless functions runner (isolated-vm)** |
| 🔴 #595 | 🧠 Opus | I) Custom Channels SDK |
| 🔴 #596 | 🛠️ Sonnet | I) CRM extension cards SDK |
| 🔴 #597 | ⚡ Haiku | I) Data quality automation (normalizers) |
| 🔴 #598 | 🧠 Opus | I) Calculated properties + evaluator |
| 🔴 #599 | 🛠️ Sonnet | **J) Graymail suppression** |
| 🔴 #600 | 🛠️ Sonnet | J) Email health score per domain/IP |
| 🔴 #601 | 🧠 Opus | J) Deliverability insights engine |
| 🔴 #602 | 🛠️ Sonnet | J) Sender reputation monitoring (SNDS/Postmaster) |
| 🔴 #603 | 🧠 Opus | **K) Bi-directional CRM sync engine** |
| 🔴 #604 | 🛠️ Sonnet | K) Data sets (named queries) |
| 🔴 #605 | 🧠 Opus | K) Programmable automation pipelines |

#### §18 — Ecomail (CZ lokalizace)

| ID | Model | Úkol |
|---|---|---|
| 🔴 #606 | 🧠 Opus (složitá lingvistická logika + výjimky) | **A) Czech vocative declension (5. pád)** |
| 🔴 #607 | 🧠 Opus | A) Czech 7-pád full declension |
| 🔴 #608 | 🧠 Opus | A) Slovak declension (7 pádů) |
| 🔴 #609 | ⚡ Haiku (seed data) + 🛠️ Sonnet (trigger) | A) Czech name-days kalendář (data + trigger) |
| 🔴 #610 | ⚡ Haiku | A) Slovak name-days |
| 🔴 #611 | ⚡ Haiku (seed) + 🛠️ Sonnet (trigger) | A) CZ/SK public holidays |
| 🔴 #612 | ⚡ Haiku | A) CZ/SK system email translations |
| 🔴 #613 | 🛠️ Sonnet | A) CZ fakturace (CZK, DPH 21%, ISDOC) |
| 🔴 #614 | ⚡ Haiku | A) SPAYD QR code na fakturách |
| 🔴 #615 | 🛠️ Sonnet | **B) Shoptet OAuth + webhooks + sync** |
| 🔴 #616 | 🛠️ Sonnet | B) Upgates integrace |
| 🔴 #617 | 🛠️ Sonnet | B) FastCentrik integrace |
| 🔴 #618 | ⚡ Haiku (spec) | B) Shoptet App Store submission |
| 🔴 #619 | 🛠️ Sonnet | **C) Raynet CRM bi-sync** |
| 🔴 #620 | ⚡ Haiku | **D) Seznam Email topping header** |
| 🔴 #621 | 🛠️ Sonnet | D) Seznam Postmaster parser |
| 🔴 #622 | ⚡ Haiku (config) | D) CZ ISP throttling rules |
| 🔴 #623 | 🛠️ Sonnet | **E) Workflow JSON export/import** |
| 🔴 #624 | 🛠️ Sonnet | E) Workflow marketplace |
| 🔴 #625 | 🛠️ Sonnet | **F) Survey response → auto-action rules** |
| 🔴 #626 | ⚡ Haiku | F) NPS/CSAT out-of-box templates |
| 🔴 #627 | 🛠️ Sonnet | **G) Product feed ingestion engine** |
| 🔴 #628 | ⚡ Haiku (šablona) + 🛠️ Sonnet (parser) | G) Heureka/Zbozi/Google Shopping adapters |

#### §20 — SmartEmailing

| ID | Model | Úkol |
|---|---|---|
| 🔴 #629 | 🛠️ Sonnet | **A) Viber Business adapter** |
| 🔴 #630 | 🛠️ Sonnet (každý) | A) Rakuten/Infobip/MessageBird Viber providers |
| 🔴 #631 | 🛠️ Sonnet | A) Viber campaign type + workflow action |
| 🔴 #632 | 🛠️ Sonnet | A) Viber templates registry |
| 🔴 #633 | 🛠️ Sonnet | A) Viber → SMS cascade fallback |
| 🔴 #634 | 🛠️ Sonnet | **B) Sklik OAuth + audiences sync** |
| 🔴 #635 | 🛠️ Sonnet | B) Sklik retargeting pixel |
| 🔴 #636 | 🛠️ Sonnet | B) Sklik lookalike + conversions |
| 🔴 #637 | 🧠 Opus (pravidla + výjimky) | **C) Gender inference (CZ/SK)** |
| 🔴 #638 | 🛠️ Sonnet | C) Auto-fill gender při importu |
| 🔴 #639 | 🛠️ Sonnet | C) Salutation merge tag s deklinací |
| 🔴 #640 | ⚡ Haiku | C) International genderize.io fallback |
| 🔴 #641 | 🛠️ Sonnet | **D) Processing purposes schema** |
| 🔴 #642 | 🛠️ Sonnet | D) Contact-purpose consent tracking |
| 🔴 #643 | ⚡ Haiku | D) Consent expiration worker |
| 🔴 #644 | 🧠 Opus (cross-cutting) | D) Purpose-aware send guardrail |
| 🔴 #645 | 🛠️ Sonnet | D) Consent workflow triggery |
| 🔴 #646 | 🛠️ Sonnet | D) Per-purpose preference centre |
| 🔴 #647 | 🛠️ Sonnet | D) Per-purpose double opt-in |
| 🔴 #648 | 🛠️ Sonnet | **E) Digital asset delivery + secure URLs** |
| 🔴 #649 | 🛠️ Sonnet | E) License key generator |
| 🔴 #650 | ⚡ Haiku | E) Digital delivery workflow template |
| 🔴 #651 | 🛠️ Sonnet | E) Download tracking + limits |

### 21.3. Souhrn podle modelu
> **Hotovo:** 0/3 (0%)

| ID | Model | Tasks (přibližně) | Typické použití |
|---|---|---|---|
| 🔴 #652 | 🧠 **Opus 4.6** | ~50 | Architektura (associations engine, identity graph, CDP, serverless runner), AI agenti (Prospecting, Customer, Campaign Builder, MCP server), ML modely (Win Probability, Sentiment, Predictive Lead Scoring, BotSense), security-critical (SSO/SAML, HIPAA, field-level perms, EU residency multi-region, sandboxes), NL→SQL sandboxing, lingvistická logika (CZ/SK declension, gender), Go MX receiver, bi-directional CRM sync, RAG vector store, calculated properties evaluator, dunning/MRR logic |
| 🔴 #653 | 🛠️ **Sonnet 4.6** | ~150 | Většina feature work: CRUD services/routes/schema, channel adaptéry (Viber, IG DM, FB Messenger, RCS, Sklik), integration adaptéry (Shoptet, Upgates, Raynet, Salesforce, HubSpot, Shopify, WooCommerce), workflow templates, booking/meetings, commerce (quotes/invoices/subscriptions), analytics dashboards, ad platforms, social publishing |
| 🔴 #654 | ⚡ **Haiku 4.5** | ~25 | Boilerplate a static data: i18n JSON překlady, jmeniny seed, svátky seed, ISP header configs, canned responses CRUD, workflow šablony (text), Sitemap/robots, activity export, scheduled refresh jobs, NPS templates, data quality normalizers |

### 21.4. Pracovní pravidla

1. **Start každého tasku se Sonnetem** — pokud task vyžaduje architektonické rozhodnutí (nové cross-cutting schema, novel algoritmus), eskaluj na Opus.
2. **Haiku jen pro tasky bez business logiky** — kde změna neprojde review bez domain knowledge, použij Sonnet.
3. **Opus vždy pro migrace 0016/0017/0018/0019/0020/0021** — migrace jsou schema-definující, chyba je drahá.
4. **Opus vždy pro ML/AI modely a prompt engineering** — chybějící edge case v promptu = špatný output pro uživatele.
5. **Testy píše stejný model jako implementaci**, aby chápal edge-cases.
6. **Code review** komplexních tasků (Opus implementace) — nech druhou instanci Opus review, aby nezavlekla blind spot.
