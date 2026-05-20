# ForgeMsg — Kompletní vývojový plán

> Unified omnichannel messaging platforma
> 10 fází · 52 týdnů · od nuly po dominanci trhu
> Vývoj s Claude Code + Claude API + Claude Chat

---

## Obsah

1. [Fáze 0 — Foundations](#fáze-0--foundations-týden-12)
2. [Fáze 1 — Contact engine + number intel základ](#fáze-1--contact-engine--number-intel-základ-týden-36)
3. [Fáze 2 — Email editor + šablony](#fáze-2--email-editor--šablony-týden-711)
4. [Fáze 3 — Email sending engine](#fáze-3--email-sending-engine-týden-1216)
5. [Fáze 4 — Analytika + AI vrstva](#fáze-4--analytika--ai-vrstva-týden-1720)
6. [Fáze 5 — Workflow builder (omnichannel-ready)](#fáze-5--workflow-builder-týden-2125)
7. [Fáze 6 — API, billing, integrace](#fáze-6--api-billing-integrace-týden-2629)
8. [Fáze 7 — SMS + WhatsApp + Push (Twilio/Bulkgate)](#fáze-7--sms--whatsapp--push-týden-3033)
9. [Fáze 8 — Number intelligence + AI voice robot](#fáze-8--number-intelligence--ai-voice-robot-týden-3439)
10. [Fáze 9 — Vlastní SMPP + beta + launch](#fáze-9--vlastní-smpp--beta--launch-týden-4048)
11. [Fáze 10 — Public launch + scale](#fáze-10--public-launch--scale-týden-4952)
12. [Tech stack reference](#tech-stack-reference)
13. [Cenový model](#cenový-model)
14. [Technický rozpočet](#technický-rozpočet)
15. [Fáze UI — Frontend a grafický design](#fáze-ui--frontend-a-grafický-design) ← **implementuje se jako poslední**

---

## Jak používat tento dokument

- Každý úkol má checkbox `[ ]` — odškrtávej jak postupuješ
- U každého úkolu je doporučený **Claude model** a **prompt hint**
- `CC` = Claude Code (terminál, agentic coding)
- `API` = Claude API (Sonnet 4.6 nebo Haiku 4.5 v produktu)
- `Chat` = Claude Chat (analýza, architektura, review)
- Killer features jsou označeny 🔥
- AI features jsou označeny 🤖
- Telco/HLR features jsou označeny 📡

---

## Fáze 0 — Foundations (Týden 1–2)

### Týden 1 — Architektura a tooling

- [ ] **Monorepo setup** — Turborepo + pnpm workspaces
  - Balíčky: `api`, `web`, `editor`, `engine`, `workers`, `sms-gateway`, `voice-bot`, `shared`
  - `CC` → "Vytvoř Turborepo monorepo s pnpm workspaces, TypeScript strict, ESLint, Prettier. Balíčky: api (Fastify), web (Next.js 15 App Router), editor (React), engine (Go — email sending), workers (BullMQ), sms-gateway (Go — SMPP), voice-bot (Node), number-intel (Node), shared (typy, utils). Přidej docker-compose.yml s PostgreSQL 16, Redis 7, ClickHouse, Kafka dev, MinIO."

- [ ] **CLAUDE.md vytvořit** — projektový kontext pro Claude Code
  - `CC` → Manuálně vytvoř CLAUDE.md s: názvem projektu, architekturou, konvencemi (naming, file structure, error handling), DB schema pravidly (Drizzle ORM, snake_case), API patterns (Fastify, Zod validation), testing pravidly (Vitest, Playwright), channel adapter pattern popisem

- [ ] **Docker Compose dev stack**
  - PostgreSQL 16, Redis 7, ClickHouse, Kafka (kraft mode), MinIO (S3 compatible)
  - `CC` → "Vytvoř docker-compose.yml pro dev prostředí: PostgreSQL 16 (port 5432, db: forgemsg), Redis 7 (port 6379), ClickHouse (port 8123/9000), Kafka KRaft mode (port 9092), MinIO (port 9000/9001). Přidej healthchecks a volumes pro perzistenci."

- [ ] **CI/CD pipeline** — GitHub Actions
  - Workflow: lint → type-check → test → build → deploy staging
  - `CC` → "Vytvoř GitHub Actions workflow: trigger na push do main a PR. Jobs: lint (ESLint + Prettier check), typecheck (tsc --noEmit pro každý package), test (Vitest parallel), build (Turborepo build), deploy-staging (Docker build + push to ECR + kubectl apply). Přidej caching pro node_modules a Turborepo."

- [ ] **Tech stack finalizace**
  - API: Fastify + TypeScript + Drizzle ORM
  - Sending engine: Go
  - Frontend: Next.js 15 App Router + Tailwind
  - Queue: BullMQ (Redis) → Kafka (later)
  - `Chat` → "Zvaliduj tento tech stack pro omnichannel messaging platformu: [stack]. Identifikuj potenciální problémy a navrhni alternativy."

### Týden 2 — Databáze a auth

- [ ] **DB schema v1** — PostgreSQL
  - Tabulky: organizations, users, contacts, lists, tags, contact_tags, campaigns, templates, email_events
  - Kontakty MUSÍ mít phone_data sloupce od dne 1 (phone_status, phone_operator, phone_region, phone_district, phone_ported, phone_roaming, phone_lookup_at)
  - `CC` → "Vytvoř Drizzle ORM schema pro: organizations (id, name, plan, stripe_customer_id), users (id, org_id, email, password_hash, role ENUM owner/admin/editor/viewer), contacts (id, org_id, email, phone, first_name, last_name, status, custom_fields JSONB, phone_status, phone_operator, phone_ported BOOLEAN, phone_region, phone_district, phone_roaming BOOLEAN, phone_lookup_at TIMESTAMPTZ, created_at, updated_at), lists (id, org_id, name), tags (id, org_id, name, color), contact_tags (contact_id, tag_id), campaigns (id, org_id, name, type, status, subject, content JSONB, scheduled_at, sent_at). Přidej indexy a foreign keys."

- [ ] **Auth systém**
  - Email/password login, Google OAuth, session management (Redis), RBAC
  - `CC` → "Implementuj auth pro Fastify: email/password registrace (bcrypt), login (JWT + Redis session), Google OAuth (passport), RBAC middleware (owner/admin/editor/viewer). Přidej routes: POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me, POST /auth/google. Session do Redis s 7d expiry."

- [ ] **API framework** — route structure, middleware
  - `CC` → "Nastav Fastify API framework: route autoloading z /routes adresáře, Zod request/response validation plugin, error handling (custom AppError class), rate limiting (Redis-based), request ID logging, OpenAPI auto-gen (fastify-swagger). Příklad route: GET /api/v1/contacts s paginací."

- [ ] **Design system bootstrap** — _viz Fáze UI_

- [ ] **Auth pages** — _viz Fáze UI_

- [ ] **Channel adapter interface** — od dne 1
  - TypeScript interface pro všechny budoucí kanály
  - `CC` → "Vytvoř TypeScript interface IChannelAdapter v shared balíčku: send(message: UnifiedMessage, recipient: Recipient): Promise<DeliveryResult>, getStatus(messageId: string): Promise<DeliveryStatus>, estimateCost(message: UnifiedMessage, recipients: Recipient[]): Promise<CostEstimate>, handleInbound(payload: unknown): Promise<InboundMessage>, validateTemplate(template: ChannelTemplate): Promise<ValidationResult>, getChannelLimits(): RateLimits. Typy: UnifiedMessage {channel, content: EmailContent | SmsContent | WhatsAppContent | PushContent | VoiceContent, metadata}, DeliveryResult {messageId, status, cost, provider}, DeliveryStatus enum QUEUED|SENT|DELIVERED|READ|FAILED|BOUNCED. Přidej EmailAdapter skeleton jako první implementaci."

---

## Fáze 1 — Contact engine + number intel základ (Týden 3–6)

### Týden 3–4 — CRUD, import, segmentace

- [x] **Contact CRUD API**
  - GET/POST/PUT/DELETE /api/v1/contacts, pagination, filtering, sorting, full-text search
  - `CC` → "Implementuj Contact CRUD API ve Fastify: GET /contacts (cursor pagination, filtering by list/tag/segment/status/phone_operator/phone_district, sorting, full-text search přes pg_trgm), POST /contacts (single + batch), PUT /contacts/:id, DELETE /contacts/:id (soft delete). Zod validation, org-scoped (middleware)."

- [ ] **CSV/XLSX import pipeline**
  - Upload → parse → column mapping → validation → batch insert
  - `CC` → "Implementuj contact import pipeline: POST /contacts/import/upload (multer, max 50MB), GET /contacts/import/:id/columns (vrať detected columns + sample data), POST /contacts/import/:id/mapping (user mapuje columns na contact fields), POST /contacts/import/:id/execute (BullMQ job: validate each row → batch insert 1000/chunk → progress webhook). Podpora CSV (papaparse) a XLSX (xlsx package). Deduplikace na email. Při importu automaticky spusť prefix parser na phone čísla."

- [x] **Email validation engine**
  - Syntax check, MX lookup, disposable domain detection, role-based detection
  - `CC` → "Vytvoř email validation service: syntaxCheck (regex), mxLookup (dns.resolveMx), disposableCheck (seznam 30k+ disposable domén — stáhni z github.com/disposable-email-domains), roleBasedCheck (admin@, info@, support@...). Validuj při importu i při API create. Vrať score 0-100 a reason array."

- [ ] **Contact list UI** — _viz Fáze UI_

- [ ] **Import wizard UI** — _viz Fáze UI_

- [x] **Tag systém**
  - CRUD, barevné tagy, bulk tag/untag, auto-tagging rules
  - `CC` → "Implementuj tag systém: CRUD API pro tagy (name, color hex, org_id), contact_tags junction table, bulk tag/untag endpoint (POST /contacts/bulk-tag {contact_ids, tag_ids, action: add|remove}), auto-tag rules (JSONB v tags tabulce: conditions → auto-apply při importu)."

- [x] **Custom fields engine**
  - Definice (text/number/date/select/boolean), storage, validation
  - `CC` → "Implementuj custom fields: tabulka custom_field_definitions (id, org_id, name, field_type ENUM text/number/date/select/boolean, options JSONB pro select, required BOOLEAN). Hodnoty v contacts.custom_fields JSONB. API: GET/POST/PUT/DELETE /custom-fields, validace hodnot při contact create/update podle definice."

- [ ] **Segment query engine**
  - Dynamic SQL builder, AND/OR/NOT groups, nested conditions, event-based
  - `CC` → "Vytvoř segment query engine: tabulka segments (id, org_id, name, conditions JSONB). Conditions schema: {operator: 'AND'|'OR', rules: [{field, op: 'eq'|'neq'|'gt'|'lt'|'contains'|'not_contains'|'in'|'not_in'|'is_set'|'is_not_set', value}], groups: [nested conditions]}. buildSegmentQuery(conditions) → Drizzle SQL query. Podpora: contact fields, custom fields, tags (has_tag/not_has_tag), phone_district, phone_operator, event-based (opened_campaign, clicked_link v posledních N dnech). API: GET /segments/:id/count (preview), GET /segments/:id/contacts."

- [ ] **Segment builder UI** — _viz Fáze UI_

- [x] 🤖 **AI segment z popisu**
  - Claude API přeloží "zákazníci co nekoupili 30 dní" na segment conditions
  - `API` model: `claude-sonnet-4-20250514` → "System prompt: Jsi expert na segmentaci kontaktů. Uživatel popíše segment v přirozeném jazyce. Vrať JSON conditions objekt kompatibilní s naším schema: {operator, rules: [{field, op, value}]}. Dostupná pole: email, first_name, last_name, phone_status, phone_operator, phone_district, tags, custom fields, last_opened_at, last_clicked_at, created_at. User: [popis segmentu]"

### Týden 5–6 — Phone prefix + subscription management

- [ ] 📡 **CZ/SK prefix databáze**
  - Kompletní mapování CZ/SK mobilních a pevných prefixů
  - `CC` → "Vytvoř phone prefix service v number-intel balíčku. Seed data (TypeScript const objekt): CZ mobilní: 601-608 → O2, 702-705 → O2, 720-729 → T-Mobile, 730-739 → T-Mobile, 770-779 → Vodafone, 790-799 → Vodafone. CZ pevné linky: 2 → Praha, 311-318 → Středočeský kraj, 35 → Karlovarský, 37 → Plzeňský, 38 → Jihočeský, 39 → Vysočina, 41 → Ústecký, 46 → Pardubický, 47-48 → Liberecký, 49 → Královéhradecký, 5 → Jihomoravský, 55 → Moravskoslezský, 56 → Vysočina/Jihomoravský, 57 → Zlínský, 58 → Olomoucký, 59 → Moravskoslezský. SK mobilní: 0900-0905 → Orange, 0906-0908 → O2, 0910-0915 → T-Mobile, 0940-0949 → O2, 0950-0951 → T-Mobile. Funkce parsePhoneNumber(phone: string): {country, type: mobile|landline|voip, originalOperator, region?, district?}."

- [x] 📡 **Phone parser service**
  - Input číslo → země, typ, operátor, oblast
  - `CC` → "Rozšiř phone parser: normalizace čísla (libphonenumber-js), validace formátu, lookup v prefix DB, vrať PhoneInfo {country, countryCode, type, originalOperator, region (pro pevné linky), isValid}. Exponuj jako interní service (volatelný z contact API) a jako API endpoint GET /number-intel/parse?phone=+420601123456."

- [x] 📡 **Auto-enrichment při importu**
  - Každé číslo při importu projde prefix parserem
  - `CC` → "Uprav contact import pipeline: po validaci emailu spusť parsePhoneNumber na phone field. Výsledek zapiš do phone\_\* sloupců kontaktu. Pro pevné linky nastav phone_district z prefixu (okamžité, zdarma). Pro mobilní nastav phone_operator z prefixu. phone_district pro mobily zůstane NULL — doplní se v Fázi 8 přes HLR lookup."

- [x] **Double opt-in flow**
  - Konfigurovatelný potvrzovací email, custom landing page, token expiry
  - `CC` → "Implementuj double opt-in: POST /lists/:id/subscribe → generuj token (crypto.randomUUID, 48h expiry, Redis), odešli confirmation email (šablona v DB, merge tagy), GET /confirm/:token → aktivuj kontakt, redirect na thank-you page (konfigurovatelná URL per list)."

- [x] **Unsubscribe engine**
  - One-click (RFC 8058), preference center, reason tracking
  - `CC` → "Implementuj unsubscribe: List-Unsubscribe a List-Unsubscribe-Post headers v každém emailu (RFC 8058), GET /unsubscribe/:token (one-click), preference center stránka (kontakt si vybere které listy/topics chce), reason tracking (při unsubscribe volitelný důvod: too frequent, not relevant, never signed up, other). Global suppression list per org."

- [x] **Suppression lists**
  - Global + per-org, auto-add hard bounces a complaints
  - `CC` → "Vytvoř suppression list systém: tabulka suppressions (id, org_id, email, phone, reason ENUM hard_bounce/complaint/manual/unsubscribe, created_at). Auto-add z bounce processoru a FBL. Pre-send check: před odesláním kampaně filtruj kontakty přes suppression list. API: GET/POST/DELETE /suppressions. Import/export CSV."

- [ ] 🔥 **Frequency capping**
  - Max N emailů per kontakt per období, across all channels
  - `CC` → "Implementuj frequency capping: tabulka org_frequency_rules (org_id, channel ENUM email/sms/push/whatsapp/voice/all, max_count, period_hours). Redis sorted set per kontakt: 'freq:{org_id}:{contact_id}:{channel}' s timestampy odeslání. Před odesláním check: ZCOUNT key (now - period) now >= max_count → skip. Respektuj across all kampaní a workflow."

- [x] **Testy Fáze 1**
  - `CC` → "Napiš testy pro Fázi 1: unit testy pro segment query builder (10+ scénářů: AND/OR, nested, event-based, phone_district filter), integration testy pro import pipeline (CSV upload → parse → mapping → insert → verify phone enrichment), unit testy pro phone prefix parser (CZ mobilní, CZ pevné, SK, neplatná čísla, zahraniční), e2e testy pro contact CRUD (Playwright). Coverage target: 80%+."

---

## Fáze 2 — Email editor + šablony (Týden 7–11)

### Týden 7–8 — Block editor engine

- [ ] **Block JSON schema**
  - Definice všech bloků: text, image, button, divider, spacer, columns, hero, social, footer
  - `CC` → "Navrhni a implementuj email block JSON schema (TypeScript types + Zod validation): BaseBlock {id, type, styles: {padding, margin, backgroundColor, borderRadius}}, TextBlock extends BaseBlock {content: string (HTML), fontSize, fontFamily, color, lineHeight, textAlign}, ImageBlock {src, alt, width, height, link?}, ButtonBlock {text, url, backgroundColor, textColor, borderRadius, align, size}, DividerBlock {color, thickness, width%}, SpacerBlock {height}, ColumnsBlock {columns: Block[][], columnRatios: number[]}, HeroBlock {backgroundImage, backgroundColor, overlay, content: Block[]}, SocialBlock {networks: {type: facebook|twitter|instagram|linkedin|youtube, url}[]}, FooterBlock {content, unsubscribeLink: auto}. Email schema: {subject, preheader, globalStyles: {backgroundColor, fontFamily, linkColor}, blocks: Block[]}."

- [ ] **Email render engine** — JSON → responsive HTML
  - `CC` → "Vytvoř email render engine: renderEmail(schema: EmailSchema): string. Výstup: responsive HTML s inline CSS, table-based layout (pro Outlook), dark mode meta tag, max-width 600px container, responsive columns (media query stack na mobilu), automatic CSS inlining (juice), img alt texty, preheader text (hidden span trick). Testuj output přes Litmus/Email on Acid snapshot. Podporuj merge tagy {{first_name}} — renderuj s contact data nebo fallback."

- [ ] **Drag-and-drop canvas** — _viz Fáze UI_

- [ ] **Undo/Redo** — _viz Fáze UI_

### Týden 9 — Pokročilé bloky

- [ ] 🔥 **Countdown timer block** — backend (GIF generátor) + _editor UI viz Fáze UI_
  - `CC` → "Implementuj server-side countdown GIF generátor: POST /editor/countdown-gif {target_date, style}. Generuj animovaný GIF (sharp/canvas, 10fps, 5s loop). Fallback na statický text. AMP for Email živý countdown jako alternativa."

- [ ] 🔥 **Product card block** — backend scraper + _editor UI viz Fáze UI_
  - `API` → "Extrahuj z URL produktu: name, price, description, image URL, currency."
  - `CC` → "Implementuj POST /editor/scrape-product: fetch URL → Claude API extrahuje data → vrať {name, price, image, description}."

- [ ] 🔥 **Dynamic content block** — render engine + _editor UI viz Fáze UI_
  - `CC` → "Implementuj evaluateCondition(condition: SegmentCondition, contact): boolean v render engine. DynamicBlock v renderEmail: evaluuj podmínku per kontakt → renderuj if nebo else větev."

- [ ] 🔥 **Saved blocks API** — _editor UI viz Fáze UI_
  - `CC` → "Implementuj saved blocks API: tabulka saved_blocks (id, org_id, name, category, block_data JSONB). GET/POST /editor/saved-blocks."

- [ ] 🔥 **Brand kit API** — _settings UI viz Fáze UI_
  - `CC` → "Implementuj brand kit API: tabulka brand_kits (org_id, logo_url, primary_color, secondary_color, accent_color, font_heading, font_body, footer_text). GET/PUT /brand-kit."

### Týden 10 — Personalizace + HTML editor

- [ ] **Merge tag engine**
  - {{first_name}}, {{company}}, custom fields, fallback values
  - `CC` → "Implementuj merge tag engine: parseMergeTags(html, contact): string. Syntax: {{field_name}} nebo {{field_name|default:\"fallback\"}}. Podporované tagy: všechna contact pole + custom fields + system (unsubscribe_url, view_in_browser_url, current_date). V editoru: merge tag picker (dropdown s hledáním, klik vloží tag). Preview: vyber kontakt z DB a zobraz personalizovanou verzi."

- [ ] **Liquid templating**
  - Podmínky, loops, filtry v obsahu
  - `CC` → "Přidej Liquid templating support (liquidjs knihovna): podmínky {% if contact.tags contains 'VIP' %}...{% endif %}, loops {% for product in products %}...{% endfor %}, filtry {{ name | upcase }}, {{ date | date: '%d.%m.%Y' }}. Sandboxed execution (timeout 5s, no filesystem access). V editoru: syntax highlighting pro Liquid v text blocích."

- [ ] **HTML editor** — _viz Fáze UI_

- [ ] 🔥 **HTML → blocks konverze**
  - Claude API analyzuje HTML → editovatelné bloky
  - `API` model: `claude-sonnet-4-20250514` → "System: Jsi expert na konverzi HTML emailů na strukturovaný JSON. Analyzuj tento HTML email a rozlož ho na bloky podle tohoto schema: [block schema]. Zachovej styling, texty, obrázky, linky. User: [HTML]"

### Týden 11 — Preview, šablony, QA

- [ ] **Preview panel** — _viz Fáze UI_

- [ ] **Spam score checker** — backend API + _UI widget viz Fáze UI_
  - `CC` → "Implementuj POST /editor/spam-check: kontroly subject line (ALL CAPS, exclamation, spam keywords), HTML (link:text ratio, image:text ratio, broken links, missing alt texty), technické (List-Unsubscribe, From/Reply-To). Vrať score 0-10 a array doporučení."

- [ ] **Link checker** — backend API + _UI viz Fáze UI_
  - `CC` → "Implementuj POST /editor/link-check: extrahuj URLs z HTML, HEAD request parallel (timeout 5s), report: working/redirect/broken/suspicious. Vrať JSON array."

- [ ] 🤖 **Accessibility checker** — API endpoint + _UI viz Fáze UI_
  - `API` → "Analyzuj HTML email: alt texty, kontrast (WCAG AA), heading hierarchy, lang atribut. Vrať [{issue, severity, element, suggestion}]."

- [ ] **Template library** — 100+ šablon — API + _UI viz Fáze UI_
  - `CC` → "Vytvoř 100 email šablon jako JSON soubory (block schema). Kategorie: newsletter (20), promo/sales (20), transactional (15), event (10), onboarding (10), seasonal (10), e-commerce (15). API: GET /templates?category=..., POST /templates/:id/use (klonuj do kampaně)."

- [ ] **Testy Fáze 2**
  - `CC` → "Napiš testy: editor e2e (Playwright — create email, add blocks, drag reorder, edit text, preview, save), render engine snapshot testy (renderuj 20 různých kombinací bloků, porovnej s expected HTML — golden file testing), block CRUD unit testy, merge tag parser unit testy, spam score unit testy."

---

## Fáze 3 — Email sending engine (Týden 12–16)

### Týden 12–13 — MTA + queue

- [ ] **MTA service (Go)**
  - SMTP client, connection pooling, TLS, custom headers
  - `CC` → "Vytvoř Go SMTP sending service (engine balíček): SMTP client s connection pooling (per-domain pool, max 10 connections), TLS (STARTTLS + implicit TLS), custom headers (List-Unsubscribe, List-Unsubscribe-Post, X-Mailer, Message-ID), DKIM signing. gRPC API pro příjem z queue workeru. Konfig: YAML soubor s IP pool, domain settings, TLS certs."

- [ ] **DKIM signing**
  - 2048-bit RSA, per-domain keys, rotation
  - `CC` → "Implementuj DKIM signing v Go MTA: generuj 2048-bit RSA keypair per customer domain, uložen v DB. Sign každý odchozí email (relaxed/relaxed canonicalization, sha256). API endpoint pro DNS record generování: POST /domains/:id/dkim → vrať TXT record který zákazník přidá do DNS. Verifikace: po přidání DNS záznamu zkontroluj (dns.LookupTXT) a označ doménu jako verified."

- [ ] **SPF/DMARC wizard** — backend DNS verifikace + _wizard UI viz Fáze UI_
  - `CC` → "Implementuj doménový setup backend: generuj DNS záznamy (SPF include:, DKIM TXT, DMARC policy, Return-Path CNAME). GET /domains/:id/dns-records (vrať required records), POST /domains/:id/verify (DNS lookup → vrať per-record status). Aktualizuj domain.verified po úspěchu."

- [ ] **Queue architecture** — BullMQ
  - `CC` → "Navrhni email sending queue architecture: Campaign.send() → CampaignSplitter job (rozdělí audience na batche po 1000) → BatchSender job (per batch: resolve merge tagy, render HTML, check suppression list, check frequency cap) → per-ISP throttled queues (gmail, outlook, yahoo, other) → MTASender job (odešli přes Go MTA gRPC). Priority queues: transactional (highest) > triggered > campaign. BullMQ dashboard (bull-board) pro monitoring."

- [ ] **Bounce processor**
  - Parse NDR, classify hard/soft/block, auto-suppress
  - `CC` → "Implementuj bounce processor: příjem bounce emailů na Return-Path adrese (inbound email parsing), klasifikace: hard bounce (550 user unknown → suppress), soft bounce (452 mailbox full → retry 3x pak suppress), block (554 policy → log, alert), auto-add hard bounces do suppression listu, update contact.phone_status pro SMS bounces. Metriky: bounce rate per doména, per ISP."

### Týden 14 — Throttling + deliverability

- [ ] **ISP throttling engine**
  - `CC` → "Implementuj per-ISP throttling: Redis token bucket per ISP per sending IP. Výchozí limity: Gmail 500/h (ramp up over weeks), Microsoft 1000/h, Yahoo 500/h, Other 2000/h. Adaptive: pokud ISP vrátí 421/451 (throttle) → sniž rate o 50% na 30min. Konfigurovatelné per org (enterprise může mít vyšší limity)."

- [ ] **IP warmup scheduler**
  - `CC` → "Implementuj IP warmup engine: nová IP začíná na 50 emails/day, graduální navyšování: den 1-3: 50/d, den 4-7: 200/d, den 8-14: 1000/d, den 15-21: 5000/d, den 22-30: 20000/d, den 30+: full capacity. Automatic scheduling — systém rozdělí traffic mezi warm a cold IPs. Dashboard: warmup progress per IP, daily volume graf."

- [ ] **Retry logic**
  - Exponential backoff per ISP
  - `CC` → "Implementuj retry: soft bounce nebo temp failure → retry s exponential backoff (1min, 5min, 30min, 2h, 8h, 24h). Per-ISP strategie: Gmail soft bounce → čekej déle (Gmail je citlivý na retries). Max 6 retries → mark as failed. Dead letter queue pro manuální review."

- [ ] **FBL processing**
  - Feedback loop, auto-unsubscribe
  - `CC` → "Implementuj FBL (Feedback Loop) processing: registruj se u ISP (Gmail Postmaster, Microsoft SNDS, Yahoo CFL). Příjem ARF (Abuse Reporting Format) reportů → parse → auto-unsubscribe stěžovatele → update complaint_count na kontaktu → alerting pokud complaint rate > 0.1%."

### Týden 15–16 — Kampaně + tracking

- [ ] **Campaign API + state machine**
  - `CC` → "Implementuj campaign API: status state machine: DRAFT → SCHEDULED → SENDING → SENT → PAUSED (manual). API: POST /campaigns (create draft), PUT /campaigns/:id (update), POST /campaigns/:id/schedule (schedule), POST /campaigns/:id/send (send immediately), POST /campaigns/:id/pause, POST /campaigns/:id/resume, POST /campaigns/:id/cancel. Audience: list_id + segment_id (optional), exclude segment_id (optional)."

- [ ] **Open tracking** — pixel
  - `CC` → "Implementuj open tracking: při renderování emailu vlož 1px tracking pixel <img src='https://track.forgemsg.com/o/{unique_id}.gif'/>. Endpoint vrátí 1px GIF a loguj event: {campaign_id, contact_id, timestamp, user_agent, ip} → Kafka topic 'email_events'. CDN (CloudFront) před tracking endpoint pro nízkou latenci. Respektuj Apple MPP (Mail Privacy Protection) — flag suspected bot opens."

- [ ] **Click tracking** — link wrapping
  - `CC` → "Implementuj click tracking: při renderování nahraď všechny URLs za tracked verze: https://track.forgemsg.com/c/{unique_id}. Endpoint: loguj click event → Kafka → redirect 302 na original URL. UTM parametry: auto-append utm_source=forgemsg, utm_medium=email, utm_campaign={campaign_name}. Dashboard: per-link click counts."

- [ ] **Event pipeline** — Kafka → ClickHouse
  - `CC` → "Implementuj event pipeline: Kafka topics: email_sends, email_deliveries, email_opens, email_clicks, email_bounces, email_unsubscribes, email_complaints. Kafka consumer → batch insert do ClickHouse (email_events table: event_type, campaign_id, contact_id, timestamp, metadata JSONB). Retention: 2 roky. Materialized views pro aggregace (per campaign, per day, per ISP)."

- [ ] **Campaign wizard UI** — _viz Fáze UI_

- [ ] **Live campaign dashboard** — _viz Fáze UI_

- [ ] **A/B testing engine**
  - `CC` → "Implementuj A/B testing: campaign.ab_config JSONB: {variants: [{name, subject?, content?, sender?, percentage}], winner_metric: open_rate|click_rate, winner_after_hours: 4, auto_send_winner: true}. Při odeslání: rozděl audience podle percentage, odešli varianty, po winner_after_hours vyhodnoť winner (statistická signifikance — chi-square test, min p<0.05), auto-send winner na zbytek audience."

- [ ] **Testy Fáze 3**
  - `CC` → "Napiš testy: MTA integration testy (send real email to Mailtrap, verify DKIM signature, headers), bounce processing unit testy (parse 10 různých NDR formátů), throttling simulation (mock ISP responses, verify rate adjustment), tracking e2e (send email → open pixel → verify event in ClickHouse), A/B testing unit (verify split, winner calculation)."

---

## Fáze 4 — Analytika + AI vrstva (Týden 17–20)

### Týden 17–18 — Analytics engine

- [ ] **ClickHouse schema**
  - `CC` → "Vytvoř ClickHouse schema: CREATE TABLE email_events (event_id UUID, event_type Enum8('send'=1,'deliver'=2,'open'=3,'click'=4,'bounce'=5,'unsub'=6,'complaint'=7), org_id UInt32, campaign_id UInt32, contact_id UInt64, timestamp DateTime64(3), metadata String DEFAULT '{}', user_agent String DEFAULT '', ip_address IPv4 DEFAULT toIPv4('0.0.0.0'), link_url String DEFAULT '', bounce_type Enum8('none'=0,'hard'=1,'soft'=2,'block'=3) DEFAULT 'none', device_type Enum8('unknown'=0,'desktop'=1,'mobile'=2,'tablet'=3) DEFAULT 'unknown', email_client String DEFAULT '') ENGINE = MergeTree() PARTITION BY toYYYYMM(timestamp) ORDER BY (org_id, campaign_id, timestamp) TTL timestamp + INTERVAL 2 YEAR. Materialized views: campaign_daily_stats, campaign_hourly_stats (first 48h), org_monthly_stats."

- [x] **Campaign analytics API**
  - `CC` → "Implementuj campaign analytics API: GET /campaigns/:id/stats → {sent, delivered, delivery_rate, opens, unique_opens, open_rate, clicks, unique_clicks, click_rate, ctor, bounces, bounce_rate, hard_bounces, soft_bounces, unsubs, unsub_rate, complaints, complaint_rate}. GET /campaigns/:id/stats/timeline?interval=hour|day → time-series array. GET /campaigns/:id/stats/links → per-link clicks. GET /campaigns/:id/stats/devices → device breakdown. GET /campaigns/:id/stats/geo → open geo (IP → country/city via MaxMind GeoLite2)."

- [ ] **Campaign report page** — _viz Fáze UI_

- [x] 🔥 **Click heatmapa** — backend (Puppeteer screenshot, ClickHouse data) + _overlay UI viz Fáze UI_
  - `CC` → "Implementuj GET /campaigns/:id/heatmap-data: per-link click counts z ClickHouse. POST /campaigns/:id/screenshot: Puppeteer render emailu → PNG → S3. API vrací screenshot URL + link click data pro overlay."

- [ ] **Account dashboard** — _viz Fáze UI_

- [x] 🔥 **Anomaly detection**
  - `CC` → "Implementuj anomaly detection: cron job (hourly) porovnává aktuální metriky s 30-day rolling average. Alerty: bounce rate > 2x average, complaint rate > 0.1%, open rate drop > 50%, sudden spike in unsubscribes. Notifikace: in-app notification + email na admina. Dashboard widget s alert timeline."

### Týden 19–20 — AI features (Claude API)

- [x] 🤖 **AI copywriting engine**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj AI email generator: POST /ai/generate-email {goal, tone: formal|casual|urgent|friendly, audience_description, key_points[], cta_text, word_count_target}. System prompt: 'Jsi expert email copywriter. Generuj email v HTML (naše block schema JSON). Dodržuj best practices: jasný subject line, personalizace, jeden CTA, skenování-friendly formátování, mobile-first.' Vrať: {subject, preheader, blocks: Block[]}. Frontend: modal s input fields → streaming response → preview → 'Use this' tlačítko (vloží do editoru). Caching: hash(prompt) → Redis 24h."

- [x] 🤖 **AI subject line generator**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj subject line generator: POST /ai/subject-lines {email_content_summary, tone, audience}. Generuj 5 variant + pro každou predikce (CTR score 1-10, důvod). System prompt: 'Generuj 5 email subject lines. Pro každou uveď predikovaný engagement score 1-10 a proč. Dodržuj: max 50 chars, no spam triggers, personalizace kde relevantní, A/B test-ready variety.' UI: card per varianta, score badge, 'Use' tlačítko, 'A/B test these' tlačítko."

- [x] 🤖 **Brand voice learning**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj brand voice analysis: POST /ai/analyze-brand-voice {campaign_ids[]} → Claude analyzuje posledních 10-20 kampaní zákazníka → extrahuje: tone (formální/casual/...), vocabulary (často používaná slova), sentence structure (krátké/dlouhé), CTA patterns, emoji usage, personalization level. Uloží jako brand_voice JSONB na org. Při generování emailů přidej brand voice do system promptu."

- [x] 🤖 **AI campaign report**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj AI campaign summary: POST /ai/campaign-summary {campaign_stats}. Claude vygeneruje natural language report: 'Tato kampaň měla open rate 24.3%, což je o 5% nad vaším průměrem. Nejvíc kliků (340) získal link na produkt X. Doporučení: zkrátit subject line, přidat personalizaci.' UI: 'AI insights' karta na campaign report stránce."

- [x] 🤖 **AI překlad**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj AI překlad kampaní: POST /ai/translate {blocks: Block[], source_lang, target_lang, brand_voice?}. Claude přeloží texty v blocích, zachová merge tagy ({{first_name}} zůstane), HTML formátování, a adaptuje pro cílovou kulturu. UI: 'Translate' tlačítko v editoru → select language → preview přeložené verze → 'Create translated campaign'."

- [ ] 🤖 **Content moderation**
  - `API` model: `claude-haiku-4-5-20251001` (levný, rychlý pre-send check)
  - `CC` → "Implementuj pre-send content moderation: před odesláním kampaně pošli obsah na Haiku → check: phishing indicators, misleading claims, regulatory issues (nezmiňuje potřebný disclaimer?), excessive urgency/pressure tactics. Vrať: {safe: boolean, issues: [{type, severity, description, suggestion}]}. Blokuj odeslání pokud severity=critical. UI: warning dialog před send."

- [x] **AI infra** — usage tracking, caching, costs
  - `CC` → "Implementuj AI usage tracking: tabulka ai_usage (org_id, model, input_tokens, output_tokens, cost_usd, feature, timestamp). Redis cache: hash(system_prompt + user_prompt) → response, TTL 24h. Rate limiting: per org per feature (free: 10 AI calls/day, pro: 100, business: 500). Cost calculation: Sonnet 4.6 $3/$15 per MTok, Haiku 4.5 $1/$5 per MTok. Dashboard: AI usage graph, cost per feature."

- [x] **Testy Fáze 4**
  - `CC` → "Napiš testy: ClickHouse query performance (1M row test dataset, verify aggregation < 500ms), AI output quality eval set (10 test prompts pro copywriting, subject lines — verify output format, no hallucination, brand voice adherence), anomaly detection unit (mock data s anomáliemi, verify detection)."

---

## Fáze 5 — Workflow builder (Týden 21–25)

### Týden 21–23 — Engine + canvas

- [ ] 🔥 **Visual workflow builder** — _viz Fáze UI_

- [x] **Workflow execution engine**
  - `CC` → "Implementuj workflow execution engine: tabulka workflow_runs (workflow_id, contact_id, current_node_id, status, data JSONB, next_execution_at). BullMQ scheduler: every minute check workflow_runs where next_execution_at <= now. Per node execution: TriggerNode (check condition → start), SendEmailNode (queue email), SendSMSNode (queue SMS), WaitNode (set next_execution_at), ConditionNode (evaluate → follow true/false edge), WebhookNode (HTTP POST). State machine per contact per workflow. Concurrency: max 10k simultaneous workflow runs."

- [x] **Trigger types**
  - `CC` → "Implementuj workflow triggers: ListSubscribe (contact přidán do listu), TagAdded (tag přiřazen), DateField (custom date field match — narozeniny, výročí), APIEvent (custom event přes API: POST /events {contact_id, event_name, properties}), FormSubmit (signup form), PurchaseEvent (e-commerce webhook), PhoneStatusChange (HLR zjistil změnu). Každý trigger: tabulka workflow_triggers (workflow_id, trigger_type, config JSONB). Evaluace: event-driven (Kafka consumer) nebo scheduled (cron pro date-based)."

- [x] **Action types**
  - `CC` → "Implementuj workflow actions: SendEmail (campaign_id nebo inline template), SendSMS (message text, merge tagy), SendWhatsApp (template_id), SendPush (title, body, url), ShowInApp (widget config), MakeVoiceCall (scenario_id), Wait (duration: hours/days nebo until: specific time/day of week), AddTag, RemoveTag, UpdateField, MoveToList, RemoveFromList, SendWebhook (URL, method, headers, body template), InternalNotification (email na team). Každá akce: execute(contact, config) → result."

- [ ] 🔥 **Cascade delivery node**
  - `CC` → "Implementuj CascadeNode: config {steps: [{channel, delay_hours, condition: 'not_opened'|'not_clicked'|'not_delivered'}]}. Příklad: email → pokud neotvřeno za 4h → push → pokud neotvřeno za 24h → SMS. Execution: odešli první kanál, schedule check za delay_hours, evaluuj condition, pokud true → next step. Cost-aware: preferuj levné kanály first (email → push → SMS)."

- [x] 🔥 **Smart channel selector node**
  - `API` model: `claude-haiku-4-5-20251001`
  - `CC` → "Implementuj SmartChannelNode: vezme kontakt's channel history (open rates per channel, preferred times, last interactions) → rozhodne nejlepší kanál. Jednoduchá verze: rules-based (if email_open_rate > 30% → email, else if sms_open_rate > 80% → sms, else push). Pokročilá: Claude Haiku analyzuje historii a doporučí kanál + timing."

- [x] 🔥 **A/B split node + Goal node**
  - `CC` → "Implementuj SplitNode: config {branches: [{name, percentage}]}. Random split per kontakt (deterministic: hash(contact_id + node_id) → consistent branch). Track performance per branch. GoalNode: config {event_type, within_hours}. Pokud kontakt provede event (purchase, signup, click) → exit workflow, mark as converted. Conversion tracking per workflow."

### Týden 24–25 — Templates + scoring

- [x] **Pre-built flows**
  - `CC` → "Vytvoř pre-built workflow templates (JSON): Welcome series (trigger: subscribe → email day 0 → wait 2d → email day 2 → wait 3d → email day 5, if not opened day 5 → SMS), Abandoned cart (trigger: cart_abandoned → wait 1h → email → wait 4h if not purchased → push → wait 24h → SMS to VIP only), Onboarding (trigger: signup → email welcome → wait 1d → email getting started → wait 3d → condition: completed setup? → if no: email reminder + push), Re-engagement (trigger: 30d no open → email → wait 7d → push → wait 7d → SMS → wait 14d if still no engagement → tag: inactive). API: GET /workflows/templates, POST /workflows/templates/:id/use (klonuj)."

- [ ] **Flow analytics UI** — _viz Fáze UI_

- [x] 🔥 **Lead scoring engine**
  - `CC` → "Implementuj lead scoring: tabulka lead_score_rules (org_id, event_type, points, decay_days). Výchozí pravidla: email open +1, email click +3, link click +5, page visit +2, form submit +10, purchase +20. Decay: -1 bod/den bez aktivity. Score uložen na kontaktu (contact.lead_score). Threshold akce: score > 50 → tag 'Hot lead' + webhook (notify sales). Score widget v kontaktním profilu. Segmentace: lead_score > X."

- [ ] 🤖 **AI flow builder**
  - `API` model: `claude-sonnet-4-20250514` → "Uživatel popíše co chce: 'chci onboarding sérii pro SaaS'. Vygeneruj kompletní workflow jako JSON (nodes + edges) s email obsahem pro každý krok. Použij best practices: timing, obsah, podmínky."

- [ ] **Testy Fáze 5**
  - `CC` → "Napiš testy: workflow execution e2e (create workflow → trigger → verify emails sent at correct times → verify conditions evaluate correctly), timing accuracy test (wait nodes respektují timing s <1min tolerance), cascade delivery test (verify channel escalation), concurrent contacts stress test (1000 contacts entering workflow simultaneously), lead scoring calculation test."

---

## Fáze 6 — API, billing, integrace (Týden 26–29)

### Týden 26–27 — Public API

- [ ] **REST API v1**
  - `CC` → "Vytvoř public REST API v1: /api/v1/contacts (CRUD, list, search, bulk), /api/v1/lists (CRUD, subscribe/unsubscribe), /api/v1/tags (CRUD), /api/v1/segments (CRUD, count, contacts), /api/v1/campaigns (CRUD, send, schedule, stats), /api/v1/templates (CRUD, render), /api/v1/workflows (CRUD, start, stop, stats), /api/v1/number-intel/lookup (HLR lookup), /api/v1/number-intel/parse (prefix parse), /api/v1/events (custom events pro triggers). Auth: API key v header (X-API-Key). Rate limiting: per plan tier (free: 100/min, pro: 1000/min, business: 5000/min). Pagination: cursor-based. Filtering: query params. Versioning: URL path (/v1/)."

- [x] **Webhook systém** — backend + _management UI viz Fáze UI_
  - `CC` → "Implementuj webhook systém: tabulka webhooks (org_id, url, events[], secret, active), webhook_deliveries. Events: contact.created/updated/deleted, campaign.sent, email.delivered/opened/clicked/bounced/unsubscribed/complained, sms.delivered/failed, workflow.completed, phone.validated, hlr.completed. Delivery: BullMQ job, retry (exponential backoff, max 5), HMAC-SHA256 signing. API: GET/POST/PUT/DELETE /webhooks, POST /webhooks/:id/test."

- [ ] **API docs** — _viz Fáze UI_

- [x] **SDKs** — Python + Node.js
  - `CC` → "Generuj SDK pro Python a Node.js z OpenAPI spec: Python (requests-based, typed s dataclasses, published na PyPI jako forgemsg), Node.js (fetch-based, TypeScript, published na npm jako @forgemsg/sdk). Oba: auto-retry, rate limit handling, pagination helpers, webhook signature verification helper."

### Týden 28–29 — Billing + integrace

- [ ] **Stripe billing**
  - `CC` → "Implementuj Stripe billing: plans table (name, stripe_price_id, contact_limit, email_limit, sms_rate, features JSONB). Stripe integration: createCustomer on org create, createSubscription on plan select, usage-based reporting (monthly email/sms count → Stripe usage records), invoice webhooks (payment_succeeded, payment_failed → update org.plan_status), proration on plan change. Overage: per email $0.001, per SMS pass-through + markup, per HLR lookup $0.005."

- [ ] **Billing UI** — _viz Fáze UI_

- [x] **Signup forms** — backend + _form builder UI viz Fáze UI_
  - `CC` → "Implementuj signup form backend: tabulka signup_forms (org_id, list_id, fields JSONB, embed_type, config JSONB, active). API: GET/POST/PUT/DELETE /signup-forms, GET /signup-forms/:id/script (vrať JS snippet). Public endpoint: POST /public/forms/:id/submit → contact create + add to list + trigger workflow. Analytics: views/submissions tracking."

- [x] **Zapier konektor**
  - `CC` → "Vytvoř Zapier app: Triggers (New Subscriber, Campaign Sent, Email Opened, Email Clicked, Contact Tag Added), Actions (Create Contact, Update Contact, Send Campaign, Add Tag, Remove Tag, Trigger Workflow). Authentication: API key. Zapier CLI app s testy."

- [x] 🔥 **Mailchimp migration tool**
  - `CC` → "Implementuj Mailchimp import: POST /migrations/mailchimp {api_key}. Steps: 1) Validate API key, 2) Fetch lists (GET /3.0/lists), 3) Fetch contacts per list (GET /3.0/lists/{id}/members, pagination), 4) Fetch templates, 5) Fetch automations (basic), 6) Map data → ForgeMsg format, 7) Batch import. UI: wizard s progress per step, field mapping review, conflict resolution (duplicate contacts). Cíl: one-click migration."

- [ ] **Testy Fáze 6**
  - `CC` → "Napiš testy: API rate limiting (verify 429 after limit), webhook delivery (mock endpoint, verify signature, retry on failure), billing (Stripe mock: create subscription, report usage, handle payment failure, plan change proration), Mailchimp migration (mock Mailchimp API, verify data mapping accuracy)."

---

## Fáze 7 — SMS + WhatsApp + Push (Týden 30–33)

### Týden 30–31 — SMS přes Twilio/Bulkgate

- [ ] 📡 **Bulkgate SMS adapter**
  - `CC` → "Implementuj BulkgateSmsAdapter implements IChannelAdapter: REST API integrace (https://portal.bulkgate.com/developer/api), send() → POST /http/send-sms, status polling, DLR webhook handling, error code mapping na unified DeliveryStatus. Config: application_id, application_token. Sender ID: alfanumerický nebo číslo."

- [ ] 📡 **Twilio SMS adapter**
  - `CC` → "Implementuj TwilioSmsAdapter implements IChannelAdapter: twilio SDK, send() → client.messages.create(), status callback webhook (MessageStatus), error code mapping, inbound SMS webhook (/sms/inbound → parse From, Body, MessageSid). Config: account_sid, auth_token, from_number."

- [ ] **Provider routing engine**
  - `CC` → "Implementuj SMS routing engine: tabulka sms_routes (country_code, provider ENUM bulkgate|twilio, priority, active). Routing logic: lookup country_code z recipient čísla → select provider s highest priority kde active=true. Failover: pokud primary provider vrátí error → automatic switch na next priority. Cost tracking: log provider, cost per SMS, delivery success. Dashboard: provider performance comparison (delivery rate, latency, cost per country)."

- [ ] **SMS campaign builder UI** — _viz Fáze UI_

- [ ] **Two-way SMS**
  - `CC` → "Implementuj inbound SMS: webhook endpoint pro Twilio a Bulkgate, parse inbound SMS → match na contact (phone number lookup), keyword handling (STOP → auto-unsubscribe, HELP → send help message, custom keywords → trigger workflow), conversation view v unified inbox. Auto-response konfigurace per keyword."

- [ ] **SMS compliance**
  - `CC` → "Implementuj SMS compliance: opt-in tracking (tabulka sms_consents: contact_id, consent_type: single|double, consent_source, consented_at, ip_address), TCPA compliance checks (US), GDPR consent verification, quiet hours per timezone, auto-append opt-out text ('Reply STOP to unsubscribe'), DND registry check (India). Pre-send compliance gate: block send pokud consent chybí."

### Týden 32 — WhatsApp

- [ ] **Meta Cloud API integrace**
  - `CC` → "Implementuj WhatsAppAdapter implements IChannelAdapter: Meta Cloud API (graph.facebook.com/v21.0), WABA (WhatsApp Business Account) provisioning flow, phone number registration. send() → POST /{phone_number_id}/messages. Webhook: příjem delivery receipts, read receipts, inbound messages. Config: access_token, phone_number_id, waba_id."

- [ ] **Template management** — backend API + _template editor UI viz Fáze UI_
  - `CC` → "Implementuj WhatsApp template management API: CRUD pro templates, submit for Meta approval (POST /{waba_id}/message_templates), status tracking (APPROVED/REJECTED/PENDING), template kategorie (marketing, utility, authentication). API: GET/POST/PUT/DELETE /whatsapp/templates, POST /whatsapp/templates/:id/submit."

- [ ] **Rich media + interactive**
  - `CC` → "Implementuj WhatsApp rich messaging: image messages (upload to Meta → media_id), video, document (PDF), location. Interactive: button messages (max 3 buttons), list messages (sections s items), quick reply buttons. Reply tracking: button clicks a list selections → event pipeline."

- [ ] **WhatsApp compliance**
  - `CC` → "Implementuj WhatsApp compliance: explicit opt-in requirement (separate od email opt-in), quality rating monitoring (Meta Webhook quality_update), messaging limit tier management (Tier 1: 1k/day → Tier 4: unlimited, auto-upgrade based on quality), conversation category tracking (marketing/utility/auth → different pricing)."

### Týden 33 — Web push + in-app

- [ ] **Web push** — FCM
  - `CC` → "Implementuj WebPushAdapter: VAPID key pair generation, Service Worker registration script (generuj JS snippet pro zákazníka), permission prompt customizace (timing: po 30s / po scroll / po page views), FCM backend (POST https://fcm.googleapis.com/v1/), rich notifications (title, body, icon, image, action buttons, badge, click URL). Device token management: tabulka push_subscriptions (contact_id, endpoint, keys, created_at). Unsubscribe: token cleanup on 410 response."

- [ ] **In-app messaging SDK**
  - `CC` → "Vytvoř in-app messaging JS SDK (<5KB gzipped): ForgeMsg.init({apiKey, contactId}), widget types: banner (top/bottom), modal (center), slideout (side panel). Targeting: page URL rules, segment membership, event triggers. API: GET /in-app/messages?contact_id=X&page_url=Y → return matching messages. Impression + click tracking. Frequency capping (max 1 per session per message). NPM package: @forgemsg/web-sdk."

- [ ] **Unified inbox v1** — _viz Fáze UI_

- [ ] **Testy Fáze 7**
  - `CC` → "Napiš testy: SMS delivery e2e (Twilio test credentials, send → verify delivery callback), SMS routing failover (mock Bulkgate failure → verify Twilio fallback), WhatsApp template approval flow (mock Meta API), push notification e2e (mock FCM, verify delivery + click tracking), unified inbox (create conversations across channels, verify timeline ordering)."

---

## Fáze 8 — AI voice robot (Týden 34–39)

> **Pozn. 2026-04-25:** HLR lookup engine (původní obsah Fáze 8) byl zrušen. Phone intelligence se omezuje na offline prefix parser v `apps/api/src/services/import/phone-prefix.ts` (CZ/SK prefix DB, žádné externí HLR API).

### Týden 34–35 — ~~HLR lookup engine~~ (zrušeno)

- [ ] 📡 **HLR lookup service**
  - `CC` → "Vytvoř HLR lookup service v number-intel balíčku: primary provider Telnyx (GET https://api.telnyx.com/v2/number_lookup/{phone}), backup provider hlr-lookups.com (POST /api/hlr-lookup). Provider adapter pattern (IHlrProvider: lookup(phone): HlrResult). HlrResult: {msisdn, status: active|absent|unknown|invalid, mcc, mnc, originalNetwork, currentNetwork, ported: boolean, imsi, msc, roaming: boolean, numberType: mobile|landline|voip}. Error handling: timeout 10s, retry 1x, fallback na backup provider. Cost tracking per lookup."

- [ ] 📡 **HLR response parser**
  - `CC` → "Implementuj HLR response normalizaci: každý provider vrací jiný formát → normalizuj na unified HlrResult. Telnyx: data.carrier.name → currentNetwork, data.portability.ported → ported. hlr-lookups.com: result.current_carrier → currentNetwork, result.msc → msc. Extrahuj MCC/MNC z IMSI (první 3 znaky = MCC, další 2-3 = MNC). Parse MSC adresa pro geolokaci."

- [ ] 📡 **MSC → okres mapovací tabulka**
  - `CC` → "Vytvoř MSC geolocation service: tabulka msc_regions (msc_prefix VARCHAR(15) PRIMARY KEY, operator VARCHAR(50), region VARCHAR(50), district VARCHAR(50), city VARCHAR(50), latitude DECIMAL(8,5), longitude DECIMAL(8,5), confidence DECIMAL(3,2)). Seed data pro CZ hlavní MSC: Praha (O2, T-Mobile, Vodafone), Brno, Ostrava, Plzeň, České Budějovice, Liberec, Olomouc, Hradec Králové, Pardubice, Zlín, Karlovy Vary, Jihlava, Ústí nad Labem. Lookup funkce: getMscLocation(mscAddress): {region, district, city, confidence}. Fallback: pokud MSC nenalezeno v tabulce → vrať jen country z MCC."

- [ ] 📡 **MSC tabulka budování**
  - `Chat` → "Navrhni strategii pro budování MSC→okres mapovací tabulky pro CZ: 1) OpenCelliD data export (BTS stanice s GPS → mapuj na MSC), 2) ČTÚ data o pokrytí sítí, 3) Crowdsourcing: při HLR lookup kontaktů kde známe adresu → loguj MSC + adresa → buduj mapování, 4) Komerční DB (Roaming Networks). Navrhni scoring systém pro confidence level."

- [ ] 📡 **Enrichment pipeline**
  - `CC` → "Implementuj contact enrichment pipeline: enrichContact(contactId): 1) Load contact, 2) Parse phone prefix (free, instant), 3) HLR lookup (if phone_lookup_at is NULL or older than 30 days), 4) Parse HLR response, 5) MSC → geolocation lookup, 6) Update contact: phone_status, phone_operator (current, z HLR), phone_ported, phone_region, phone_district (z MSC nebo prefix), phone_roaming, phone_lookup_at = now(). BullMQ job pro async processing. API: POST /number-intel/enrich {contact_id} nebo POST /number-intel/enrich-batch {contact_ids[]}."

- [ ] 📡 **Result caching**
  - `CC` → "Implementuj HLR cache: Redis hash 'hlr:{phone_normalized}' → HlrResult JSON, TTL 30 dní. Před HLR API call: check cache → if hit and age < 30d → return cached. Cache stats endpoint: GET /number-intel/cache-stats → {total_cached, hit_rate, money_saved}."

### Týden 36 — Batch processing + vizualizace

- [ ] 📡 **Batch HLR processing**
  - `CC` → "Implementuj batch HLR: POST /number-intel/batch-enrich {filter: segment_id | list_id | all}. BullMQ job: query contacts matching filter where phone IS NOT NULL → queue individual enrichment jobs (rate limited: 50/sec across all providers, parallelizace přes 2 providery). Tabulka batch_jobs (id, org_id, type, total, processed, succeeded, failed, status, started_at, completed_at). WebSocket progress updates."

- [ ] 📡 **Progress tracking UI** — _viz Fáze UI_

- [ ] 📡 **Number intel dashboard** — _viz Fáze UI_

- [ ] 📡 **Mapa ČR** — interaktivní — _viz Fáze UI_

- [ ] 📡 **Auto re-validace**
  - `CC` → "Implementuj scheduled re-validace: cron job (monthly): SELECT contacts WHERE phone_lookup_at < now() - interval '30 days' AND phone IS NOT NULL. Queue batch enrichment. Po dokončení: porovnej old vs new status, loguj změny (tabulka phone_status_changes: contact_id, old_status, new_status, old_operator, new_operator, changed_at). Alert pokud > 5% kontaktů změnilo status."

- [ ] 📡 **Pre-send HLR check**
  - `CC` → "Implementuj pre-send validation: před SMS/voice kampaní: check phone_status pro všechny recipients, filtruj inactive/invalid, zobraz warning: 'X kontaktů má neaktivní číslo — budou přeskočeny'. Volitelný: trigger fresh HLR lookup pro kontakty s lookup starším 7 dní. Cost savings tracking: 'Ušetřili jste $X neposíláním na Y neaktivních čísel'."

- [ ] 📡 **Cost savings dashboard**
  - `CC` → "Přidej cost savings widget na number intel dashboard: kalkulace: (inactive_contacts_in_campaigns × avg_sms_cost) - hlr_lookup_cost = net_savings. Zobraz: 'Tento měsíc jste ušetřili $X díky number intelligence'. Monthly trend chart. ROI kalkulace: HLR cost vs SMS savings."

### Týden 37–38 — AI voice robot

- [ ] 🔥 **Voice pipeline**
  - `CC` → "Vytvoř AI voice call pipeline: 1) Twilio Voice REST API → initiate outbound call, 2) Twilio webhook (call answered) → respond s TwiML <Stream> (WebSocket audio stream), 3) Audio stream → Deepgram STT (real-time transcription, WebSocket), 4) Transcript → Claude API (Sonnet 4.6, streaming response), 5) Claude response → ElevenLabs TTS (text-to-speech, streaming audio), 6) TTS audio → zpět do Twilio WebSocket → volaný slyší. Latence target: < 1.5s end-to-end (user speaks → AI responds). Node.js WebSocket server pro audio orchestraci."

- [ ] 🤖 **Claude konverzační engine**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj voice conversation engine: system prompt s instrukcemi pro telefonní hovor (buď stručný, jasný, přátelský, max 2 věty per response), scenario context (purpose: appointment reminder / NPS survey / verification), contact data (jméno, objednávka, termín...), conversation history (přidávej každou repliku). Branching: Claude rozhoduje na základě odpovědi (uživatel potvrdí → branch A, odmítne → branch B, požádá o přepojení → transfer to human). Sentiment detection: Claude vrátí sentiment tag (positive/neutral/negative) s každou odpovědí."

- [ ] 🔥 **Voice scénář builder UI** — _viz Fáze UI_

- [ ] **Call management**
  - `CC` → "Implementuj call management: outbound dialer (queue contacts → rate limited calling: max 5 concurrent calls), voicemail detection (Twilio AMD — Answering Machine Detection, pokud voicemail → leave message nebo hangup), DTMF handling ('stiskněte 1 pro potvrzení'), call recording (Twilio recording, s úvodním upozorněním 'Tento hovor je nahráván'), recording storage (S3, encrypted). Call log: tabulka calls (id, campaign_id, contact_id, scenario_id, status: completed|no_answer|busy|voicemail|failed, duration_seconds, recording_url, transcript, ai_summary, outcome JSONB, cost, created_at)."

- [ ] 🤖 **Call analytics**
  - `API` model: `claude-sonnet-4-20250514`
  - `CC` → "Implementuj call analytics: 1) AI transcription (Deepgram → full transcript uložen v call.transcript), 2) AI summary per call (Claude: 'Zákazník potvrdil termín na 15.4. ve 14:00. Byl spokojený.' → call.ai_summary), 3) Outcome extraction (Claude: extract structured data z transcriptu — appointment_confirmed: true, preferred_time: '14:00', sentiment: 'positive' → call.outcome JSONB), 4) Dashboard: calls made, answer rate, avg duration, outcome distribution pie chart, sentiment distribution, cost per call. Batch AI processing: po kampani spusť summarizaci na všechny hovory (Batch API — 50% sleva)."

### Týden 39 — Pre-built scénáře + integrace

- [ ] **Pre-built voice scénáře**
  - `CC` → "Vytvoř pre-built voice scenarios: 1) Appointment reminder ('Dobrý den {{first_name}}, volám ohledně vašeho termínu {{appointment_date}} v {{appointment_time}}. Můžete potvrdit? Stiskněte 1 pro potvrzení, 2 pro přeložení.'), 2) NPS survey ('Na stupnici 1-10, jak byste doporučili naši službu? ... Můžete nám říct proč?'), 3) Order confirmation ('Vaše objednávka č. {{order_id}} byla odeslána. Doručení očekáváme {{delivery_date}}.'), 4) Verification ('Váš ověřovací kód je {{code}}. Opakuji: {{code}}.'), 5) Welcome call ('Vítejte u {{company}}! Jsem virtuální asistent a chtěl bych vás provést prvními kroky...'). Každý: scenario JSON + email šablona pro follow-up."

- [ ] **Voice node ve workflow builderu**
  - `CC` → "Přidej MakeVoiceCallNode do workflow builderu: config {scenario_id, fallback_action: skip|send_sms|send_email, retry_on_no_answer: boolean, max_retries: 2, retry_delay_hours: 4}. Execution: initiate call → wait for completion → read outcome → route based on outcome (answered_positive → next, answered_negative → branch B, no_answer → fallback). Podmínka v ConditionNode: call_outcome == 'confirmed'."

- [ ] 📡 **HLR pre-call check**
  - `CC` → "Před voice kampaní: automaticky spusť HLR check na recipients (pokud lookup starší 7 dní). Filtruj: inactive → skip, roaming → warning (international call rates!), landline → skip (nelze TTS voice call na pevnou linku standardně). Cost estimation: 'Tato kampaň bude stát přibližně $X za Y hovorů'."

- [ ] **Testy Fáze 8**
  - `CC` → "Napiš testy: HLR batch processing (mock HLR API, 1000 čísel, verify správný zápis do DB, cache hit rate), MSC mapování přesnost (10 known locations, verify district match), voice pipeline e2e (Twilio test credentials, mock TTS/STT, verify conversation flow), scenario execution (mock call, verify branching na keyword detection), pre-call HLR check (verify filtering inactive numbers)."

---

## Fáze 9 — Vlastní SMPP + beta + launch (Týden 40–48)

### Týden 40–42 — Vlastní SMPP gateway

- [ ] 📡 **Go SMPP gateway**
  - `CC` → "Vytvoř Go SMPP gateway (sms-gateway balíček): SMPP v3.4 client (fiorix/go-smpp nebo linxGnu/gosmpp). Connection pool: persistent TCP connections per provider, bind_transceiver mode, enquire_link keep-alive (30s). submit_sm: encoding (GSM-7 default, auto-switch na UCS-2 pro Unicode/emoji), multipart segmentace (UDH concat headers pro zprávy > 160/70 chars), message_id tracking. deliver_sm handler: DLR parsing (extract message_id, delivery status), MO (inbound) SMS routing. TLS/SSL. Config: YAML s provider definitions (host, port, system_id, password, system_type, TPS limit). Health check endpoint. Prometheus metriky (submit rate, deliver rate, error rate, latency per provider)."

- [ ] 📡 **Multi-provider SMPP routing**
  - `CC` → "Implementuj smart routing v Go gateway: routing table (JSON config nebo DB): country_code + MNC → provider + priority + cost_per_sms. Routing strategies: cost_optimized (nejlevnější route), quality_optimized (nejvyšší delivery rate), balanced (weighted: 70% levný + 30% quality backup). Auto-failover: pokud provider vrátí ESME_RTHROTTLED nebo connection lost → switch na next priority za < 1s. A/B route testing: pošli 5% trafficu přes novou route, porovnej delivery rate. Per-provider TPS throttling (token bucket)."

- [ ] 📡 **Wholesale providers napojení**
  - `CC` → "Nakonfiguruj SMPP connections: Telnyx (smpp.telnyx.com:2775, TLS), Plivo (smpp.plivo.com:2775), Bulkgate SMPP (pokud nabízí). Pro každého: test connection, verify submit_sm + deliver_sm, measure latency, log delivery rate. Fallback: pokud všechny SMPP selžou → fallback na Twilio REST API (existující adapter)."

- [ ] 📡 **Provider switch** — zero-downtime
  - `CC` → "Implementuj provider switch z Twilio REST na vlastní SMPP: feature flag (LaunchDarkly nebo custom). Postup: 1) Deploy SMPP gateway, 2) Route 5% traffic přes SMPP (A/B), 3) Monitor delivery rate 48h, 4) Pokud OK → 25% → 50% → 100%, 5) Decommission Twilio adapter (ale zachovej jako fallback). Zero-downtime, rollback za 1 minutu."

### Týden 43–44 — Hardening + security

- [ ] **Kubernetes production**
  - `CC` → "Vytvoř K8s production deployment: Helm charts pro: api (3 replicas, HPA min 3 max 10), web (2 replicas), workers (3 replicas, HPA on queue depth), sms-gateway (2 replicas), voice-bot (2 replicas), number-intel (2 replicas). Namespace isolation: forgemsg-prod, forgemsg-staging. Resource limits + requests. PodDisruptionBudget. Multi-AZ placement (topologySpreadConstraints). Ingress (nginx nebo AWS ALB). Secrets (AWS Secrets Manager nebo Vault). ConfigMaps pro env vars."

- [ ] **Terraform** — IaC
  - `CC` → "Vytvoř Terraform pro AWS: VPC (3 AZ, public + private subnets), EKS cluster (managed node groups, Graviton4 instances), RDS PostgreSQL 16 (multi-AZ, r7g.large), ElastiCache Redis 7 (cluster mode), S3 buckets (uploads, backups, recordings), CloudFront (tracking pixel, assets), Route53 (DNS), ACM (SSL certs), SES (fallback), IAM roles + policies. Environments: staging, production. State: S3 backend + DynamoDB lock."

- [ ] **Observability stack**
  - `CC` → "Nasaď observability: Grafana Cloud (nebo self-hosted on K8s): Prometheus (metrics — scrape all services), Loki (logs — fluent-bit DaemonSet), custom dashboards: API latency p50/p95/p99, email sending throughput, SMS delivery rate, queue depth, error rate, HLR lookup latency. PagerDuty integration: alert rules (error rate > 5%, queue depth > 10k, API p95 > 2s, SMS delivery rate < 90%). Runbooks v wiki per alert."

- [ ] **Security hardening**
  - `CC` → "Security audit a hardening: OWASP Top 10 check (SQL injection → parameterized queries ✓, XSS → CSP headers + sanitize output, CSRF → SameSite cookies, rate limiting na auth endpoints: 5 attempts/15min), dependency audit (npm audit, snyk test), secrets rotation (90-day schedule), audit logging (tabulka audit_logs: user_id, action, resource, ip, timestamp — log všechny writes), pen test prep (document attack surface, prepare test accounts)."

- [ ] **Onboarding flow** — backend progress tracking + _wizard UI viz Fáze UI_
  - `CC` → "Implementuj onboarding backend: onboarding_steps JSONB na org (krok 1-5, každý s completed: bool). API: GET /onboarding/status, POST /onboarding/step/:step/complete. Kroky: domain_verified, contacts_imported, campaign_created, test_email_sent, live."

- [ ] 🔥 **Cmd+K command palette** — _viz Fáze UI_

### Týden 45–46 — Closed beta (50 uživatelů)

- [ ] **Beta invite systém** — backend + _waitlist stránka viz Fáze UI_
  - `CC` → "Implementuj beta backend: tabulky waitlist (email, joined_at), invite_codes (code, max_uses, used_count, active). API: POST /waitlist (join), POST /invites (generuj kód), POST /invites/:code/validate. Feedback: POST /feedback {category: bug|feature|ux, text} → ukládej do DB + forward do Linear API."

- [ ] **Bug fixing sprint**
  - `CC` + `Chat` → Denně: review feedback → prioritize → fix. Focus 100% na stabilitu a UX. Žádné nové features.

- [ ] **Load testing**
  - `CC` → "Vytvoř k6 load test scripty: scenario 1: 100k emails/hour (campaign send simulation), scenario 2: 10k SMS/hour (SMS campaign), scenario 3: 50 concurrent API users (CRUD operations), scenario 4: 1000 contacts entering workflow simultaneously, scenario 5: 100 concurrent HLR lookups, scenario 6: 10 concurrent voice calls. Targets: API p95 < 200ms, email throughput > 30/sec, zero message loss. Výsledky → Grafana dashboard."

### Týden 47–48 — Open beta (500 uživatelů)

- [ ] **Open beta launch**
  - `Chat` → "Navrhni open beta launch plán: Product Hunt 'Upcoming' listing, Discord/Slack community setup, beta feedback programme (monthly call s top users), changelog stránka (public), status page (Instatus)."

- [ ] **Deliverability tuning**
  - `CC` → "Deliverability sprint: IP warmup execution (follow warmup schedule), Google Postmaster Tools integration (domain reputation monitoring), Microsoft SNDS registration, per-ISP performance dashboard, complaint rate monitoring (<0.1% target), blacklist monitoring (cron: check Spamhaus, Barracuda, SORBS daily → alert on listing)."

- [ ] **E-commerce integrace**
  - `CC` → "Implementuj Shopify integrace: Shopify App (Node.js, Shopify API), customer sync (bidirectional: Shopify customer → ForgeMsg contact), order events (webhooks: order/create → trigger workflow, order/cancelled), product data sync (pro product card blocks), abandoned cart tracking (checkout/create without order/create within 1h → trigger), revenue attribution (UTM tracking → match ForgeMsg campaign → revenue per campaign)."

- [ ] **WordPress plugin**
  - `CC` → "Vytvoř WordPress plugin: PHP, signup form shortcode [forgemsg_form id='abc123'], contact sync (WP user → ForgeMsg contact), WooCommerce integration (order events → triggers), campaign stats widget v WP admin dashboard. Published na WordPress.org plugin directory."

- [ ] 🔥 **Revenue attribution**
  - `CC` → "Implementuj revenue attribution: JavaScript tracking snippet (forgemsg.track('purchase', {value: 99.99, currency: 'USD', order_id: '123'})), conversion window (30 days default, konfigurovatelné), attribution model: last-touch (which campaign/channel drove the purchase), per-campaign revenue dashboard, per-channel ROI comparison."

---

## Fáze 10 — Public launch + scale (Týden 49–52+)

### Týden 49–52+ — Launch a beyond

- [ ] **Product Hunt launch**
  - `Chat` → "Navrhni Product Hunt launch strategii: timing (Tuesday-Thursday), prepare: 1-min video, 6 screenshots, compelling tagline, maker comment, first-day engagement plan."

- [ ] **Developer docs site** — _viz Fáze UI_

- [ ] **Content marketing**
  - `Chat` → "Vygeneruj 10 blog postů pro launch: 1) Why we built ForgeMsg, 2) ForgeMsg vs Mailchimp (comparison), 3) How AI is changing email marketing, 4) Complete guide to email deliverability, 5) SMS marketing in 2026, 6) WhatsApp Business API tutorial, 7) Building omnichannel workflows, 8) Phone number intelligence explained, 9) AI voice bots for business, 10) Migration guide from Mailchimp."

- [ ] 📡 **SIP trunking** — Twilio Voice → Telnyx SIP
  - `CC` → "Migrace voice z Twilio na Telnyx SIP: Telnyx SIP trunking ($0.005/min vs Twilio $0.014/min = 64% úspora). FreeSWITCH nebo Asterisk PBX (Docker container). SIP registration, SRTP, WebRTC bridge pro browser-to-phone. Postupná migrace: feature flag, 10% → 50% → 100%."

- [ ] **Social channel adaptéry**
  - `CC` → "Implementuj adaptéry: MessengerAdapter (Meta Send API), TelegramAdapter (Bot API), SlackAdapter (Incoming Webhooks + Block Kit). Každý: implements IChannelAdapter, send/receive/status. Přidej do workflow builderu jako action nodes."

- [ ] 🤖🔥 **AI autopilot**
  - `API` model: `claude-sonnet-4-20250514` → "Zákazník nastaví cíl. AI autonomně vytváří, testuje a optimalizuje kampaně. Auto-segmentace, auto-content, auto-A/B testing, auto-winner deployment. Lidský zásah jen pro schválení."

- [ ] 🔥 **App + template marketplace**
  - `CC` → "Plugin architektura: SDK pro třetí strany (custom blocks, integrace, analytics widgets). Review process. Revenue share 70/30. Template marketplace: designéři prodávají premium šablony."

- [ ] **White-label + agency portal**
  - `CC` → "White-label: custom domain, branding (logo, barvy, favicon), custom email domain. Agency portal: multi-client management, client switching, bulk operations, white-label reporting."

---

## Tech stack reference

| Vrstva           | Technologie                 | Poznámka                                  |
| ---------------- | --------------------------- | ----------------------------------------- |
| API              | Fastify + TypeScript        | Zod validation, OpenAPI auto-gen          |
| Frontend         | Next.js 15 App Router       | Tailwind, Zustand, React Query            |
| Email editor     | React + DnD Kit             | Block-based, JSON schema                  |
| Email engine     | Go                          | SMTP client, DKIM, MTA                    |
| SMS gateway      | Go (SMPP v3.4)              | Multi-provider routing                    |
| Voice bot        | Node.js + WebSocket         | Twilio Voice + STT/TTS                    |
| Number intel     | Node.js                     | HLR lookup, prefix DB                     |
| DB (main)        | PostgreSQL 16               | Drizzle ORM                               |
| DB (analytics)   | ClickHouse                  | Event pipeline, materialized views        |
| Cache            | Redis 7                     | Sessions, queue, rate limiting, HLR cache |
| Queue            | BullMQ → Kafka (later)      | Priority queues, scheduled jobs           |
| Storage          | S3 / MinIO                  | Images, attachments, recordings           |
| Search           | Elasticsearch (later)       | Full-text contact search                  |
| Infra            | Kubernetes (EKS)            | Terraform, Helm, Graviton4                |
| CI/CD            | GitHub Actions → ArgoCD     | Trunk-based development                   |
| Monitoring       | Grafana + Prometheus + Loki | PagerDuty alerts                          |
| AI (product)     | Claude API (Sonnet 4.6)     | Copywriting, analysis, voice              |
| AI (moderation)  | Claude API (Haiku 4.5)      | Content check, spam detection             |
| AI (development) | Claude Code (Max plan)      | Code generation, tests, docs              |

---

## Cenový model

| Plan       | Cena   | Kontakty  | Emaily/m  | SMS          | AI calls  |
| ---------- | ------ | --------- | --------- | ------------ | --------- |
| Free       | $0     | 1 000     | 5 000     | 0            | 10/day    |
| Starter    | $19/m  | 10 000    | 50 000    | pay-per-use  | 50/day    |
| Pro        | $79/m  | 50 000    | 250 000   | pay-per-use  | 200/day   |
| Business   | $199/m | 200 000   | 1 000 000 | pay-per-use  | 500/day   |
| Enterprise | custom | unlimited | unlimited | volume rates | unlimited |

SMS/Voice/WhatsApp: pass-through cost + 2× markup.
HLR lookups: $0.005 per lookup (cost: $0.003).
Dedicated IP: $20/m add-on.

---

## Technický rozpočet (měsíčně, bez mezd)

| Kategorie               | MVP (0–1k users) | Growth (1–10k) | Scale (10–50k) |
| ----------------------- | ---------------- | -------------- | -------------- |
| Compute (K8s)           | $350             | $1,430         | $5,420         |
| Databáze                | $140             | $820           | $3,000         |
| Storage + CDN           | $45              | $170           | $700           |
| Email infra             | $280             | $800           | $2,350         |
| Message queue           | $0               | $200           | $800           |
| Claude API (product)    | $100             | $950           | $5,300         |
| Dev tools + Claude Code | $296             | $400           | $820           |
| Monitoring              | $95              | $230           | $660           |
| Bezpečnost              | $30              | $120           | $450           |
| Third-party SaaS        | $50              | $510           | $2,790         |
| Doména + DNS            | $15              | $35            | $215           |
| SMS/Voice pass-through  | $0               | $500           | $4,500         |
| HLR lookups             | $0               | $150           | $500           |
| **Celkem**              | **~$1,400**      | **~$6,300**    | **~$27,500**   |

---

## Jednorázové náklady

| Položka            | Odhad    | Poznámka                          |
| ------------------ | -------- | --------------------------------- |
| SOC 2 Type II      | $15k–40k | Odlož za launch                   |
| Právní dokumenty   | $3k–8k   | Claude Chat draft → lawyer review |
| Penetration test   | $5k–15k  | Roční                             |
| Trademark (EU+US)  | $2k–5k   | —                                 |
| IP blok purchase   | $5k–20k  | Volitelný                         |
| IP warmup (3 měs.) | $300–1k  | SES costs                         |
| 100 email šablon   | $0       | Claude Code                       |
| API docs + SDK     | $0       | Claude Code                       |
| Marketing web      | $0       | Claude Code                       |

**MVP start: ~$5k–15k jednorázově**
**Full compliance (po launch): ~$25k–90k**

---

_Dokument vytvořen: 10. dubna 2026_
_Aktualizuj průběžně s každým sprintem._
_Používej Claude Code Max ($100–200/m per dev) pro maximální produktivitu._

---

## Fáze UI — Frontend a grafický design

> **Tato fáze se implementuje AŽ PO DOKONČENÍ celého backend systému.**
> Grafický design, UI komponenty a frontend stránky jsou záměrně odloženy.
> Všechny úkoly označené _viz Fáze UI_ v předchozích fázích patří sem.

---

### UI 0 — Design system a auth

- [ ] **Design system bootstrap** — Tailwind + komponenty
  - `CC` → "Vytvoř design system pro Next.js 15: Tailwind config s custom color tokens (primary, secondary, accent, success, warning, danger), typography (Inter + JetBrains Mono), spacing scale. Komponenty (React, TypeScript): Button (variants: primary/secondary/ghost/danger, sizes: sm/md/lg), Input (label, error, helper text), Card, Modal (portal-based), Toast (notification stack), Badge, Avatar, Dropdown. Všechno s Storybook stories."

- [ ] **Auth pages** — login, register, forgot-password, verify-email, onboarding
  - `CC` → "Vytvoř auth stránky v Next.js App Router: /login, /register, /forgot-password, /verify-email/[token], /onboarding (3-step wizard: org name → invite team → verify domain). Responsive, dark mode support, form validation (react-hook-form + zod)."

---

### UI 1 — Contact engine

- [ ] **Contact list UI** — filtrovatelná tabulka, bulk select, search
  - `CC` → "Vytvoř contact list stránku v Next.js: tabulka s virtuálním scrollingem (tanstack-table), sloupce: jméno, email, telefon, operátor, okres, tagy, status, poslední aktivita. Filtry: sidebar s tag checkboxy, status dropdown, segment selector, search bar. Bulk akce: tag, untag, delete, export. Responsive — na mobilu card layout místo tabulky."

- [ ] **Import wizard UI** — 5-step modal
  - `CC` → "Vytvoř import wizard jako 5-step modal: 1) File upload (drag-and-drop zone, CSV/XLSX), 2) Column mapping (drag source columns to target fields, auto-detect common names), 3) Preview (prvních 10 řádků s highlight chyb), 4) Progress (real-time progress bar, WebSocket), 5) Result (X imported, Y skipped, Z errors — download error report). Stepper navigation."

- [ ] **Segment builder UI** — vizuální query builder s real-time preview
  - `CC` → "Vytvoř segment builder React komponentu: add condition button → select field → select operator → input value. Group conditions (AND/OR toggle). Nested groups (indent). Real-time count preview (debounced API call). Uložit jako segment. Použít v campaign audience selection."

---

### UI 2 — Email editor canvas

- [ ] **Drag-and-drop canvas** — hlavní editor, block palette, property panel
  - `CC` → "Vytvoř email editor canvas v React: @dnd-kit/core pro drag-and-drop. Levý panel: block palette (přetáhni blok na canvas). Střed: canvas (600px wide preview, bloky s drag handles, click to select, blue outline on selected). Pravý panel: property editor pro vybraný blok (dynamický form podle block type). Globální styles panel (background, font, link color). Toolbar: undo/redo, preview, save, send test."

- [ ] **Undo/Redo** — command pattern, Cmd+Z / Cmd+Shift+Z
  - `CC` → "Implementuj undo/redo pro editor: command pattern — každá akce (add block, move block, edit property, delete block) vytvoří Command {execute(), undo()}. History stack s max 100 entries. Keyboard shortcuts Cmd+Z (undo), Cmd+Shift+Z (redo). UI: undo/redo tlačítka v toolbaru s disabled state."

- [ ] **HTML editor** — CodeMirror 6, split-screen, live preview
  - `CC` → "Vytvoř HTML editor view v email editoru: CodeMirror 6 s HTML syntax highlighting, auto-complete pro merge tagy, split-screen (code vlevo, preview vpravo, live update s 300ms debounce). Tlačítko 'Import HTML' (upload .html soubor). Automatická CSS inlinace při přepnutí zpět na visual editor."

- [ ] **Preview panel** — desktop/mobil/tablet/dark mode toggle, "view as contact"
  - `CC` → "Vytvoř preview panel: iframe s emailem, toggle desktop (600px) / mobil (375px) / tablet (768px), dark mode toggle (injektuj prefers-color-scheme: dark), 'View as' dropdown — vyber kontakt z DB → renderuj s jeho merge tagy. Tlačítko 'Send test email' → odešli na zadaný email."

- [ ] **Spam score widget** — sidebar v editoru, live výsledky
  - `CC` → "Zobraz spam score (z /editor/spam-check API) jako sidebar widget v editoru: score badge, color-coded (zelená/žlutá/červená), list doporučení s ikonami. Live update při změně subject nebo obsahu (debounced)."

- [ ] **Link checker UI** — list linků s status ikonami
  - `CC` → "Zobraz výsledky /editor/link-check jako panel v editoru: list linků, status ikonas (✓ working, → redirect, ✗ broken, ⚠ suspicious), kliknutelné URL. Refresh button."

- [ ] **Accessibility checker UI** — issue list se severitou
  - `CC` → "Zobraz accessibility issues (z /ai/accessibility-check) jako sidebar panel: grouped by severity (error/warning/info), každý issue s elementem a suggestion. Fix counter v toolbaru."

- [ ] **Template library UI** — browsování, kategorie, náhled, použití
  - `CC` → "Vytvoř template library UI: modal s kategoriemi (newsletter, promo, transactional...), thumbnail grid (render preview), hover: 'Use this template' button, search, tag filter. Po výběru: klonuj do nové kampaně."

- [ ] **Editor bloky — UI** (countdown timer, product card, dynamic content, saved blocks, brand kit settings)
  - `CC` → "Vytvoř UI pro pokročilé bloky: Countdown timer block editor (date picker, style config, live JS preview). Product card block editor (URL input, auto-fetch preview, editovatelná pole). Dynamic content block editor (segment picker pro podmínku, toggle if/else view). Saved blocks panel v palette (list 'Moje bloky', thumbnail). Brand kit settings page (color picker, font select, logo upload)."

---

### UI 3 — Kampaně a odesílání

- [ ] **SPF/DMARC wizard UI** — DNS záznamy ke zkopírování, verify button
  - `CC` → "Vytvoř domain setup wizard UI: 1) Zákazník zadá doménu, 2) Zobraz potřebné DNS záznamy (SPF, DKIM TXT, DMARC, Return-Path CNAME) ke zkopírování (copy button), 3) Tlačítko 'Verify' → zelená/červená per záznam, 4) Po verifikaci všech → doména označena jako aktivní."

- [ ] **Campaign wizard UI** — 4 kroky: Audience → Design → Review → Send
  - `CC` → "Vytvoř campaign wizard: step 1 Audience (vyber list, optional segment filter, exclude segment, show estimated reach count), step 2 Design (embedded email editor nebo vyber template), step 3 Review (checklist: subject ✓, from address ✓, list ✓, spam score ✓, test email sent?, preview links), step 4 Schedule/Send (send now / schedule date-time picker s timezone selector). Stepper navigation, draft auto-save."

- [ ] **Live campaign dashboard** — real-time KPI, WebSocket, charts
  - `CC` → "Vytvoř live campaign dashboard (po odeslání): KPI cards (sent, delivered, opens, clicks, bounces, unsubs — real-time update via WebSocket), time-series chart (opens/clicks over time, per minute first 2h, per hour after), device breakdown pie, email client breakdown, top clicked links table. Auto-refresh every 10s."

---

### UI 4 — Analytika

- [ ] **Campaign report page** — KPI, charts, geo map, per-link tabulka
  - `CC` → "Vytvoř campaign report stránku: KPI cards row (opens, clicks, bounces, unsubs — každý s rate % a trend arrow vs org average), time-series Recharts chart (opens + clicks overlay), device pie chart, email client bar chart, geo map (world map s bubble overlay — d3 nebo react-simple-maps), per-link click table (URL, clicks, unique clicks, %). Export: PDF report button, CSV data export."

- [ ] **Click heatmapa UI** — canvas overlay na screenshot emailu
  - `CC` → "Zobraz click heatmap: iframe/img s email screenshotem (z /campaigns/:id/screenshot API), canvas overlay s heatmap z /campaigns/:id/heatmap-data (barva: zelená=málo, červená=hodně). Tooltip na hover: link URL, click count, unique clicks, CTR."

- [ ] **Account dashboard** — hlavní stránka po přihlášení
  - `CC` → "Vytvoř hlavní dashboard: KPI metric cards (total contacts, list growth this month, avg open rate, avg click rate), recent campaigns table (název, sent, opens, clicks, datum — link na report), engagement trend chart (opens+clicks weekly, 3 měsíce), list growth chart (new subscribers - unsubscribes, weekly). Quick actions: create campaign, import contacts, view reports."

---

### UI 5 — Workflow builder

- [ ] 🔥 **Visual workflow builder canvas** — React Flow, node palette, config panel
  - `CC` → "Vytvoř visual workflow builder: @xyflow/react (React Flow) canvas. Node types: TriggerNode (zelený, start), ActionNode (modrý), ConditionNode (žlutý, diamond shape), DelayNode (šedý), SplitNode (růžový). Edge: animated, deletable. Node palette (sidebar): drag-to-add. Každý node má config panel (klik na node → pravý panel s formulářem). Canvas controls: zoom, pan, minimap, auto-layout (dagre). Uložení: POST /workflows s nodes + edges JSON."

- [ ] **Flow analytics UI** — per-node metriky, barevné performance indikátory
  - `CC` → "Vytvoř flow analytics view: na každém node zobraz: entered count, completed count, conversion rate. Vizualizace: barva node dle performance (zelená=dobrý, červená=drop-off). Side panel: per-step detail (sent, delivered, opened, clicked, converted). A/B split: side-by-side comparison per branch. Revenue per flow (pokud connected e-commerce). Active contacts count."

---

### UI 6 — API, billing, integrace

- [ ] **Webhook management UI** — CRUD, test endpoint, delivery log viewer
  - `CC` → "Vytvoř webhook management stránku: list webhooks (URL, events, status, last delivery), create/edit modal (URL, events multiselect, secret), 'Test' button → odešli test event → zobraz response. Delivery log: tabulka posledních 50 delivery (timestamp, status, response code, retry count)."

- [ ] **API docs site** — Mintlify/Docusaurus, interactive playground
  - `CC` → "Vytvoř API docs site (Mintlify): Getting started (5 min quickstart), Authentication, Rate limits, Pagination, Error codes, per-endpoint docs s code examples (curl, Python, Node.js, PHP). Interactive playground (Swagger UI embed). Changelog page. Status page link."

- [ ] **Billing UI** — plan comparison, Stripe Elements, invoice history
  - `CC` → "Vytvoř billing stránku: current plan card (name, usage bars: contacts X/Y, emails X/Y), plan comparison grid (Free/Starter/Pro/Business/Enterprise s feature matrix), upgrade/downgrade flow, payment method management (Stripe Elements), invoice history table (datum, amount, status, PDF download link), usage breakdown chart (emails, SMS, HLR lookups, AI calls per měsíc)."

- [ ] **Signup form builder UI** — drag-and-drop builder, embed options
  - `CC` → "Vytvoř signup form builder UI: drag-and-drop field builder (email, name, phone, custom fields), 3 embed types (popup, inline, full-page), style editor (colors, fonts, border), embed snippet s copy button, preview. Analytics: views/submissions/conversion rate."

---

### UI 7 — SMS + WhatsApp + Push

- [ ] **SMS campaign builder UI** — character counter, merge tags, scheduling
  - `CC` → "Vytvoř SMS campaign builder: textarea s character counter (160 GSM-7 / 70 Unicode, segment count), merge tag picker, link shortener (auto-shorten URLs, track clicks), preview per contact (vyber kontakt → zobraz personalizovanou verzi), audience selector, scheduling s timezone-aware sending, quiet hours indicator."

- [ ] **WhatsApp template editor UI** — placeholder variables, preview, submit
  - `CC` → "Vytvoř WhatsApp template editor: form s template name, kategorie (marketing/utility/authentication), header (text/media), body s placeholder {{1}} {{2}} variables, footer, buttons. Preview: render jako WhatsApp message bubble. Submit button → POST to Meta, status badge (PENDING/APPROVED/REJECTED), rejection reason + edit + resubmit flow."

- [ ] **Unified inbox UI** — multi-channel konverzace, reply composer
  - `CC` → "Vytvoř unified inbox stránku: levý panel: konverzace list (sortable by recent, filterable by channel: all/email/sms/whatsapp), každá konverzace: contact avatar, name, last message preview, channel icon, timestamp. Pravý panel: konverzace detail (chat-like timeline: all messages across channels, chronological, channel badge per message), reply composer (select channel for reply, text input, send button). Contact sidebar: contact profile, tags, notes."

---

### UI 8 — Number intelligence

- [ ] 📡 **Batch HLR progress UI** — real-time WebSocket progress, výsledky
  - `CC` → "Vytvoř batch processing UI: progress page s real-time updates (WebSocket): progress bar s %, 'Zpracováno 45 230 / 100 000', estimated time remaining, speed (lookups/sec). Result summary po dokončení: pie chart (active/inactive/unknown/invalid), error log (downloadable CSV)."

- [ ] 📡 **Number intel dashboard** — operátor donut, status breakdown, region tabulka
  - `CC` → "Vytvoř number intelligence dashboard stránku: metric cards (total phone contacts, % active, % ported, last batch date), operator distribution donut chart (O2, T-Mobile, Vodafone, other), status breakdown bar (active, inactive, unknown), region/district breakdown table (sortable by count), monthly validation trend chart."

- [ ] 📡 **Interaktivní mapa ČR** — hustota kontaktů per kraj/okres
  - `CC` → "Vytvoř interaktivní mapu ČR s kontakty per kraj/okres: react-simple-maps nebo d3 s TopoJSON ČR (kraje). Barva = hustota kontaktů (gradient). Hover: tooltip s počtem a top metrics. Klik na kraj: filtruj contact list. Přepínač: zobraz per kraj / per okres. Export: screenshot mapy jako PNG."

---

### UI 9 — Voice robot a onboarding

- [ ] 🔥 **Voice scénář builder UI** — React Flow canvas, SayNode/ListenNode/BranchNode
  - `CC` → "Vytvoř voice scenario builder (podobný workflow builderu): node types: SayNode (TTS text, voice selection, speed), ListenNode (timeout, max duration, keywords to detect), BranchNode (condition na transcript: contains keyword? sentiment?), TransferNode (SIP URI / phone number), RecordNode (s GDPR upozorněním), HangupNode. Canvas: React Flow, drag-and-drop. Preview: 'Test call' button → zavolej na zadané číslo a projdi scénář."

- [ ] **Onboarding wizard UI** — 5-step průvodce pro nové uživatele
  - `CC` → "Vytvoř onboarding wizard UI pro nové uživatele: 5 kroků: 1) Welcome + org name, 2) Verify sending domain (SPF/DKIM/DMARC wizard), 3) Import contacts (CSV upload nebo manual), 4) Create first campaign (guided, s AI suggestions), 5) Send test email + go live checklist. Empty states na všech stránkách s CTA na relevant onboarding step."

- [ ] 🔥 **Cmd+K command palette** — navigace, akce, federated search
  - `CC` → "Implementuj command palette (Cmd+K / Ctrl+K): cmdk React library. Commands: navigace (Go to Campaigns, Go to Contacts, Go to Workflows...), akce (Create Campaign, Import Contacts, Send Test Email...), search (contacts, campaigns, templates — federated search). Recent commands. Keyboard navigation. Fuzzy matching."

- [ ] **Beta waitlist stránka** — email capture, invite codes, feedback widget
  - `CC` → "Vytvoř beta stránky: /waitlist (email capture form), /join?code=XYZ (invite code redemption → registrace). In-app feedback widget (button na každé stránce → modal s textarea + category: bug/feature/ux). Onboarding call scheduler (Calendly embed)."

---

### UI 10 — Developer docs a marketing

- [ ] **Developer docs site** — Mintlify, Getting Started, API Reference, guides
  - `CC` → "Vytvoř docs site (Mintlify): Getting Started (5 min quickstart), API Reference (auto-gen z OpenAPI), SDKs (Python, Node.js), Webhooks guide, SMS guide, WhatsApp guide, Voice guide, Number Intelligence guide, Workflow guide, Migration from Mailchimp guide. Changelog. Status page link."
