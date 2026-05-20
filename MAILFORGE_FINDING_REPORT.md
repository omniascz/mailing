# Mailforge — Finding Report (Gap analýza vůči 27 konkurentům)

> Datum: 2026-05-18
> Source: `data/` (60 dokumentů, 27 platforem × 2 + 6 cross-cutting analýz)
> Zpracováno: 4 paralelní agenti, ~3 800 řádků strukturovaných nálezů
> Status: Pracovní podklad pro product strategy + backlog priorities (NEimplementace)

---

## Executive Summary — TL;DR ve 200 slovech

Mailforge **technologicky není Fáze 0**, jak ROADMAP naznačuje. Repository obsahuje **~95 000 řádků kódu** s **123 Drizzle schémy, 166 API routes, Go MTA enginem (DKIM, pooling, gRPC, inbound), block editorem s Liquid templates a 9 BullMQ workers**. Architektura je v jádru srovnatelná s mid-market konkurencí (Targito, SALESmanago, Bloomreach Engagement). Nedostatek je v **produktové polish** — ne v base technologii.

Analýza 27 platforem ukazuje **7 jasných whitespace opportunities** kde žádný z konkurentů neexceluje a kde Mailforge má technologický náskok: **AI voice agent jako kampaňový kanál**, **CZ/SK hluboká lokalizace (skloňování, gender, jmeniny) s globální feature parity**, **low-code app-studio model**, **AI agents jako first-class entity v Claude price tier**, **EU-sovereign s vlastním Go MTA + multichannel**, **unified omnichannel s shared frequency cap**, a **booking + scheduling + messaging v jedné platformě**.

Současně je tu **~30 must-have features**, které Mailforge nemá oproti tier-1 konkurenci (RFM auto-cohorts, predictive metrics CLV/churn, send-time optimization, custom events API, multichannel frequency cap, conditional content blocks, pre-built automation gallery, …). Většina je achievable v 2–4 týdnech každá nad existující infrastrukturou.

**Klíčové strategické rozhodnutí**: Mailforge se musí rozhodnout, jestli je _CZ-first/EU-sovereign omnichannel platform_ (pozice unikátní) nebo _next Mailchimp_ (přesycený segment). Doporučení = první.

---

## 1. Mailforge — aktuální stav (zjištěno z kódu)

### 1.1 Datový model (123 tabulek)

**Identity & tenancy:** organizations, organization_members, users, sessions, teams, permission_sets, field_permissions, two_factor, sso, oauth, ip_restrictions, sandboxes, audit_logs, accounts, cross-account

**Contacts & identity graph:** contacts, contact_emails (multi-email), tags, lists, groups, custom_fields, custom_objects, associations (M:N), anonymous_profiles, identity_graph, lifecycle_rules, engagement, import_jobs, suppressions, frequency_rules, quiet_hours, smart_sending, holdout, lead_scoring, calculated_properties, data_sets, saved_queries

**Content & sending:** campaigns, templates, editor (saved blocks + brand kit), media_assets, multivariate_tests, rss_campaigns, signup_forms, email_events, dmarc_reports, isp_fbl, dedicated_ips, domains, abuse_detection, campaign_alerts, inbound_email

**Channel-specific:** sms, sms_keywords, whatsapp, viber_templates, rcs, push, in_app, calls, call_routing, phone_numbers, custom_channels, video_messages

**Workflow & AI:** workflows (14 trigger types), ai_agents, ai_agent_runs, ai_usage, kb_embeddings (RAG)

**CRM / sales:** pipelines, deals, crm_tasks, crm_notes, sales_sequences, salesforce, raynet, hubspot

**Helpdesk:** helpdesk, agent_availability

**Commerce & billing:** product_catalog, product_feeds, coupons, reviews, revenue, ecommerce_integrations, quotes, invoices, subscriptions, billing, credit_balances, product_meters

**Loyalty (full subsystem):** loyalty_programs, loyalty_members, loyalty_points, loyalty_rewards, loyalty_earning_rules

**CDP & data:** cdp_events, cdp_sources, warehouse_sync, data_pipelines, data_sync_mappings

**Marketing surface:** blog, seo_clusters, ctas, surveys, social_accounts, social_posts, site_tracking, site_messages, web_personalization, browse_abandonment, booking_pages, calendar, calendly

**Ads:** ad_accounts, ad_reports

**Compliance:** compliance, hipaa, scheduled_reports, alerts_subscriptions

**App-platform:** app_studio (low-code builder)

### 1.2 Email engine (Go, `apps/engine`, 1 733 řádků)

- gRPC service: `Send`, `SendBatch` (20 goroutines), `HealthCheck`
- Per-domain SMTP connection pool s idle reaper
- TLS via STARTTLS
- DKIM signing RSA-SHA256, relaxed/relaxed canonicalization, signs `from, to, subject, date, message-id, mime-version, content-type, list-unsubscribe, list-unsubscribe-post`
- RFC 5322 message builder s custom headers
- **ISP-aware header enrichment pro CZ market** — Seznam, Volny, Centrum, Google, Microsoft, Apple, Yahoo
- Inbound MX receiver (RFC 5322 + multipart, base64 attachments, POSTs do API webhook)

### 1.3 Editor capabilities

- 10 block types: text, image, button, divider, spacer, columns, hero, social, footer, dynamic + calendly-smart
- Container blocks (columns, hero, dynamic) recursive nesting
- DynamicBlock condition: AND/OR/NOT s 14 operátory
- Email schema s globalStyles (bg, content bg, fontFamily, linkColor, contentWidth)
- Zod-validated, recursive schema přes `z.lazy`
- Render: responsive HTML table-in-table (Outlook-safe), inline CSS, dark-mode meta, mobile column stack
- Merge tags `{{field|filter:"x"|default:"y"}}` s pluggable filter registry
- Liquid templating (94 řádků, partial)

### 1.4 Channel adapters

- 9 channels v types: email, sms, whatsapp, push, voice, in_app, viber, instagram, messenger
- `IChannelAdapter` interface: send, sendBulk, getStatus, estimateCost, handleInbound, validateTemplate, getChannelLimits
- BaseChannelAdapter (default fallback), EmailAdapter implemented, ChannelRegistry
- shared-sms (Bulkgate adapter, phone parser, GSM-7/UCS-2 segmenter)
- shared-webhooks (delivery, retry, HMAC signing)
- shared-ai (Claude client + rate limiter)

### 1.5 i18n

- cs (default), sk, en
- resolveLocale: org → contact → Accept-Language → cs fallback

### 1.6 Workers (9 BullMQ jobs)

campaign-splitter, batch-sender, mta-sender, archive-email-events, seo-rank-poll, social-scheduler, subscription-billing, invoice-reminder, video-transcode

### 1.7 AI capabilities (implementované)

- Claude client (shared-ai) s rate limiter + Redis cache 24h TTL
- ai_usage tracking per-org
- ai_agents framework (campaign_builder, contact_cleanup, segment_optimizer, re_engagement, custom)
- Routes: `/ai/segment-from-description`, `/ai/generate-email`, `/ai/subject-lines`, `/ai/analyze-brand-voice`, `/ai/campaign-summary`, `/ai/translate`, `/ai/usage`
- Voice bot streaming API (WebSocket, target <200ms latency, stub adapters)
- MCP server (stdio): send_email, send_sms, create_contact, query_segments, get_campaign, create_campaign

### 1.8 Notable issues v současném stavu

- **`apps/sms-gateway/main.go`** je 7-řádkový stub
- **`apps/voice-bot`** běží s stub adapters (žádné reálné STT/LLM/TTS providery)
- **`apps/mcp-server`** jen `src/index.ts` (1 soubor)
- **MTA sender worker** fallback na HTTP bridge, gRPC client incomplete
- **Liquid templating** jen 94 řádků (partial)
- **Render engine** chybí plain-text alternative auto-derivation
- **Bounce processor worker** chybí (logic asi v API)
- **Kafka producer worker** chybí (events direct do ClickHouse přes API)
- **Working tree messy** — desítky necommitovaných změn, `apps/number-intel/` smazáno ale tracked
- **5 obřích commitů** s ~20k řádků každý = AI burst generation, ne organic dev

---

## 2. Gap analýza — co nám chybí oproti tier-1 konkurenci

### 2.1 P0 — Must-have do MVP / Vlna 1 (CZ/SK SMB launch)

| #   | Feature                                                                                                                                                                                             | Zdroj                                                           | Implementační odhad                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **RFM auto-cohorts** (Champions / At Risk / Lost / Hibernating + customizable)                                                                                                                      | Klaviyo, Ecomail CDP, Targito, SAP Emarsys, Leadhub             | 2 týdny (ClickHouse materialized view + UI segment template) |
| 2   | **Predictive metrics native**: CLV (365d forecast), Churn Risk (L/M/H), Predicted Next Order Date                                                                                                   | Klaviyo, Mailchimp, Brevo                                       | 4 týdny (Claude API pro initial, ML model pro Phase 5+)      |
| 3   | **Pre-built automation recipes gallery** (50+ scenarios: welcome / cart abandon / browse abandon / post-purchase / birthday / replenishment / win-back / lead nurture / event reg / quiz follow-up) | ActiveCampaign 900+, Ecomail 8+, SAP Emarsys Tactics, Mailchimp | 3 týdny (JSON templates + UI gallery)                        |
| 4   | **Custom events API** s arbitrary properties `POST /api/v1/track` + jako automation trigger + segment filter                                                                                        | Klaviyo, SmartEmailing PRO, Boldem Profi, Bloomreach            | 1 týden (events table v ClickHouse)                          |
| 5   | **Send Time Optimization** ML model per kontakt                                                                                                                                                     | Mailchimp STO, Brevo Aura, Klaviyo Smart Send                   | 2 týdny (simple historical-open model, ne ML zatím)          |
| 6   | **Frequency cap / Contact Policy** napříč kanály per kontakt                                                                                                                                        | Targito, Brevo, Klaviyo Smart Sending, HubSpot                  | 1 týden (Redis counter per contact_id)                       |
| 7   | **Conditional Content blocks** v editoru (block-level visibility per segment)                                                                                                                       | ActiveCampaign Pro, Brevo, MailerLite                           | 1 týden (UI nad Liquid)                                      |
| 8   | **Auto-resend to non-openers** native                                                                                                                                                               | MailerLite, Ecomail                                             | 3 dny (campaign clone + audience filter)                     |
| 9   | **Lead scoring engine** s custom rules + AI threshold-based enrollment                                                                                                                              | ActiveCampaign, Brevo Pro, Evalanche, HubSpot                   | 1 týden (calculated_properties už máme)                      |
| 10  | **Subscription Types** model (multiple subscription preferences per kontakt, granular preference center)                                                                                            | HubSpot                                                         | 1 týden (GDPR best practice)                                 |
| 11  | **Marketing vs Transactional IP pool separation**                                                                                                                                                   | EmailLabs, Braze                                                | 3 dny (Go MTA config + routing)                              |
| 12  | **Time-zone-aware send / Delivery by Time Zone**                                                                                                                                                    | Mailchimp Time-Warp, Brevo, MailerLite                          | 3 dny (campaign-splitter úprava)                             |
| 13  | **Customer Preference Center / Zero-party data** (frequency + topic + channel preferences self-service)                                                                                             | SALESmanago, HubSpot                                            | 1 týden (per-locale public form)                             |
| 14  | **CZ/SK skloňování + gender inference + jmeniny + svátky** triggers — finalizovat                                                                                                                   | Leadhub, Ecomail, SmartEmailing                                 | 1 týden (lookup table + Liquid filter + cron triggers)       |
| 15  | **Per-recipient unique discount codes** generated dynamically z Shoptetu                                                                                                                            | Leadhub, SmartEmailing                                          | 1 týden (Liquid block s API fetch)                           |
| 16  | **Shoptet + Upgates native OAuth integrace** s real-time product/order/customer sync                                                                                                                | Leadhub (deepest CZ), Ecomail, SmartEmailing                    | 2 týdny (CZ market table-stakes)                             |
| 17  | **One-click unsubscribe (RFC 8058)** + List-Unsubscribe-Post                                                                                                                                        | Gmail/Yahoo 2024+ requirement                                   | 1 den (header je už ready)                                   |
| 18  | **Public pricing transparency** (CZK + EUR tiers visible)                                                                                                                                           | Inxmail, Mailchimp, MailerLite                                  | 0 dnů (marketing decision)                                   |
| 19  | **Multi-account / Agency mode** (přepínání mezi e-shopy bez logout)                                                                                                                                 | Leadhub, Ecomail, Mailkit, Boldem                               | 1 týden (UI work)                                            |
| 20  | **Browse abandonment ≠ Cart abandonment** oddělené pre-built flows                                                                                                                                  | ExpertSender                                                    | 3 dny (taxonomy v gallery)                                   |

**Cumulative odhad P0:** ~14–18 týdnů jeden dev + Claude

### 2.2 P1 — Should-have (Vlna 2, V4+ expansion)

| #   | Feature                                                                                                                 | Zdroj                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 21  | **Channel Scoring per recipient** (ML best-channel) — předpovídá který kanál preferovat                                 | SARE Channel Scoring, Braze Intelligent Channel                 |
| 22  | **A/B/X multivariate testing** (3+ variants, auto-winner)                                                               | SARE, Mailchimp Premium 8 variants, HubSpot Adaptive            |
| 23  | **AMP for Email** support v editoru                                                                                     | Mailkit, Salesforce MC                                          |
| 24  | **Audience sync to Meta / Google / TikTok / Pinterest / Sklik Ads**                                                     | Klaviyo, Ecomail, SmartEmailing Sklik, Leadhub                  |
| 25  | **Web personalization module** (real-time dynamic content per visitor)                                                  | Targito, Bloomreach Weblayers                                   |
| 26  | **Identity resolution L2–L3** (cookie → email → SMS → external ID stitching)                                            | Klaviyo KDP, Targito, Bloomreach                                |
| 27  | **Reviews collection module** (post-delivery → star rating → social share / support)                                    | Klaviyo Reviews                                                 |
| 28  | **Digital Products + Paid Newsletters** native (Stripe Connect)                                                         | MailerLite, GetResponse Content Monetization                    |
| 29  | **Customer Hub** — customer-facing portal s order history a preferences                                                 | Klaviyo Customer Hub, ActiveCampaign                            |
| 30  | **Surveys & Quizzes builder** native                                                                                    | MailerLite, Mailchimp                                           |
| 31  | **RSS campaigns** auto-generated z blog/podcast                                                                         | MailerLite, Mailchimp                                           |
| 32  | **GDPR evidence audit log** per kontakt (source + purpose + validity timestamp)                                         | SmartEmailing                                                   |
| 33  | **Automatická pre-send check** (spam-words, dead links, alt-text, plain-text)                                           | Boldem                                                          |
| 34  | **Engagement Score** proprietary per-kontakt + IP pool routing                                                          | Mailkit                                                         |
| 35  | **Sub-account hierarchy / White-label agency mode** s per-sub-account brand + sender domains                            | Mailkit, Boldem, Brevo Enterprise                               |
| 36  | **Replenishment / next-order ML prediction** (consumables vertical)                                                     | ExpertSender, Klaviyo                                           |
| 37  | **Slovak localization complete** (UI + skloňování + jmeniny + svátky kalendář + Mergado SK + Shoptet.sk)                | Ecomail, Leadhub                                                |
| 38  | **DACH-grade compliance kit** (CSA membership, double opt-in enforced, German DPA template, ISO 27001 startup pre-cert) | Inxmail, rapidmail, CleverReach                                 |
| 39  | **Pay-per-send / prepaid credits tier** vedle subscription                                                              | rapidmail Pay-per-Mail, Inxmail per-emails, Newsletter2Go-Brevo |
| 40  | **B2B vs B2C product positioning split** s two default playbooks                                                        | Mapp (B2C) vs Evalanche (B2B)                                   |
| 41  | **Connected Content / Liquid s HTTP fetch při render**                                                                  | Braze Connected Content                                         |
| 42  | **Visual workflow canvas (React Flow)** s heatmap/funnel debugger                                                       | Ecomail heatmap v automation, ActiveCampaign                    |
| 43  | **Sentiment Analysis** 1:1 email replies přes Claude                                                                    | ActiveCampaign Sales Engagement                                 |
| 44  | **Bulk coupon zásobník** s per-recipient unique code                                                                    | SmartEmailing, Ecomail                                          |
| 45  | **Relational Custom Data Structures** (loyalty points history, multi-order schema)                                      | SmartEmailing PRO, ActiveCampaign Custom Objects                |
| 46  | **Site Messages** (in-app on-site message channel) přes channel adapter                                                 | ActiveCampaign                                                  |
| 47  | **Reverse ETL** export profiles + events do BigQuery/Snowflake                                                          | Klaviyo Advanced Data Platform                                  |
| 48  | **Webinars** via integrace (Twilio/Daily.co)                                                                            | GetResponse                                                     |
| 49  | **Polish ISP pool + lokalizace UI/help**                                                                                | GetResponse, EmailLabs, SARE                                    |
| 50  | **Funnel builder** = multi-step landing page → email sequence                                                           | GetResponse, ClickFunnels                                       |

### 2.3 P2 — Nice-to-have / Phase 6–7

| Feature                                                                          | Zdroj                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| Reinforcement learning A/B (multi-armed bandit) místo statického A/B             | Braze Decisioning Studio                       |
| Conversational natural-language campaign builder                                 | Braze Operator, Salesforce Agentforce          |
| Cross-journey orchestration + frequency caps cross-workflow                      | Salesforce Cross-Journey                       |
| Custom Objects / Data Extensions (schemaless flexible data)                      | HubSpot Enterprise, Salesforce MC              |
| Multi-touch revenue attribution s linear / position / time-decay / custom modely | HubSpot Enterprise, Bloomreach                 |
| Adaptive testing s AI multivariate selection                                     | HubSpot Enterprise, Salesforce                 |
| Hierarchical teams / partitioning per asset                                      | HubSpot Enterprise                             |
| Field-level / property-level security                                            | HubSpot Enterprise, Salesforce                 |
| Sandbox environments                                                             | HubSpot Enterprise, Salesforce                 |
| Mobile SDK (iOS + Android + React Native)                                        | Braze, Mapp, Salesforce                        |
| Loyalty Cloud engine (tiers, points, rewards) — buy vs build                     | SAP Emarsys, Salesforce Loyalty                |
| Predictive Lead Scoring s trained model (closed-won/lost)                        | HubSpot Pro+, Bloomreach Loomi                 |
| Zero-copy DWH triggers (Snowflake / BigQuery direct)                             | Braze, Salesforce Data Cloud                   |
| AI Agent Console / Custom AI agents v workflow steps                             | Braze, Salesforce Agentforce                   |
| WhatsApp Commerce / 2-way conversations / catalogs / payments                    | Braze, Salesforce                              |
| Industry-specific playbooks (retail / fashion / B2B SaaS / nonprofit / events)   | SAP Emarsys Tactics, Evalanche B2B             |
| AI Content QA / brand voice consistency checker                                  | Braze AI Content QA                            |
| SQL Query Builder s AI assistant nad event store                                 | Braze, Bloomreach Premium                      |
| Mobile push provisioning (FCM/APNs/VAPID)                                        | Klaviyo, Braze, MailerLite                     |
| BIMI configurable                                                                | All majors 2024+                               |
| Webinars native engine                                                           | GetResponse                                    |
| Event registration + ticketing                                                   | Constant Contact                               |
| HIPAA mode (US healthcare)                                                       | Salesforce MC Health Cloud, HubSpot Enterprise |
| FedRAMP certifikace (US gov)                                                     | Salesforce MC only                             |

### 2.4 Co je v Mailforge kódu ALE konkurence (často) nemá

| Mailforge má                                                                                                                                | Konkurenti                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **125 Drizzle schemas vč. CDP-grade** (anonymous_profiles, identity_graph, calculated_properties, custom_objects, data_sets, saved_queries) | Jen Bloomreach + Targito + SALESmanago mají srovnatelné. Mailchimp / Brevo / MailerLite to nemají.                  |
| **app_studio low-code builder**                                                                                                             | NIKDO z 27 nemá user-buildable modules. Targito má 40+ aktivovatelných, ale ne user-buildable.                      |
| **ai_agents + ai_agent_runs framework**                                                                                                     | Klaviyo Marketing/Customer Agent jsou $140-200/mo add-on. Salesforce Agentforce premium. Mailforge to má vestavěné. |
| **MCP server**                                                                                                                              | Žádný z 27 nemá nativní MCP/Claude integration.                                                                     |
| **Voice bot streaming API (WebSocket, STT/LLM/TTS adaptér)**                                                                                | NIKDO z 27 nemá outbound voice campaigns. Jen Brevo Phone (VoIP PBX) a ActiveCampaign jako import.                  |
| **i18n cs/sk/en s skloňováním + gender inference**                                                                                          | Globální (Mailchimp/Klaviyo/Brevo) nemají CZ vůbec. Lokální (Ecomail) má, ale shallower features.                   |
| **kb_embeddings** (RAG vector store)                                                                                                        | Jen Bloomreach Loomi a Salesforce Einstein mají.                                                                    |
| **9 channel adapters incl. viber, instagram, messenger**                                                                                    | Bloomreach + Braze + Salesforce mají srovnatelně. Mailchimp/MailerLite chybí.                                       |
| **calculated_properties + data_sets + saved_queries**                                                                                       | Jen ClickHouse-backed enterprise (Braze, Bloomreach).                                                               |
| **app-platform schema**                                                                                                                     | Žádný z 27. Mailforge unikum.                                                                                       |
| **CZ ISP-aware MTA headers** (Seznam, Volny, Centrum)                                                                                       | Jen Mailkit a SmartEmailing mají direct relationships. Mailforge má kód, ale ne contracts.                          |
| **Loyalty subsystem (5 tabulek)**                                                                                                           | Jen SAP Emarsys + Salesforce Loyalty. Bloomreach to nemá native.                                                    |
| **Booking pages + Calendar + Calendly**                                                                                                     | Žádný marketing platform to nemá nativní. Mailforge unique.                                                         |
| **Surveys + Quizzes**                                                                                                                       | MailerLite a Mailchimp mají.                                                                                        |
| **Blog + SEO modul**                                                                                                                        | GetResponse, HubSpot mají. MailerLite částečně.                                                                     |

**Klíčové uvědomění:** Mailforge má **schéma a scaffolding pro ~70 % features**, které tier-1 enterprise konkurence (Bloomreach, Braze, SAP Emarsys, Salesforce) má. Implementační dluh je obrovský, ale architektonický plán je správný a ambiciózní.

---

## 3. Strategic positioning insights (z cross-cutting analyses)

### 3.1 Tržní pozice — kde jsme realisticky

Per master srovnávací matrix (`55_Master_Srovnavaci_Matrix.md`) Mailforge **podle scope** patří do **"Mid-market omnichannel"** tieru (SALESmanago, Targito, Leadhub, ExpertSender, SARE). Tento tier má:

- Cena $1.5K–7K/měs (~30k–140k Kč/měs)
- Sales-driven onboarding
- Custom pricing (opacní)
- 5K–50K kontaktů sweet spot

**Ale Mailforge má technologickou základnu pro Enterprise CDXP tier** (Bloomreach, SAP Emarsys, Salesforce MC, Braze):

- Postgres + ClickHouse + Kafka event pipeline = potenciálně < 1s real-time (Tier B z `57_CDP_Capabilities`)
- 125 entity schemas = srovnatelné s Bloomreach Customer Data Engine
- 9 channel adapters = srovnatelné s Braze 13 channels
- Vlastní MTA + DKIM + pooling = vlastní infrastruktura

Tj. **Mailforge má potenciál nabízet enterprise architekturu za mid-market cenu** = **white space**.

### 3.2 AI tier classification (per `56_AI_Capabilities_Comparison.md`)

Mailforge má technicky **Tier 2 (AI-enabled)** kapacitu:

- Claude Sonnet 4.6 + Haiku 4.5 integrace s caching
- ai_agents framework + ai_agent_runs
- 7 implementovaných AI routes
- MCP server
- Voice AI streaming

Konkurence v Tier 2: Klaviyo, HubSpot, Mailchimp, GetResponse, ActiveCampaign, Targito.
Tier 1 (AI-native): Bloomreach Loomi, Salesforce Einstein/Agentforce, Braze Sage, SAP Emarsys AI Suite, SALESmanago.

**Klíčové:** AI bez kvalitních dat = limited value. Mailforge pro SMB segment má méně dat než enterprise CDP. Strategie:

- **Foundation modely (Claude) + per-org context caching**, NE training from scratch
- AI included ve všech tieres (jako Klaviyo, Bloomreach), NE separate "Agentforce-style" trap
- Voice AI = jediný unique tier 1 angle, kde nikdo jiný nemá

### 3.3 CDP capabilities reality check (per `57_CDP_Capabilities_DeepDive.md`)

74 % platforem v sektoru se prezentuje jako CDP, ale **jen 7/27 je skutečný CDP**:

1. Bloomreach Engagement (CDE in-memory)
2. SAP Emarsys
3. Salesforce Data Cloud + MC
4. Mapp / Evalanche
5. SALESmanago
6. Targito
7. Braze (CDP-like CEP)

Mailforge **má architekturu pro 8. místo v seznamu**, pokud postavíme:

- Identity resolution L2 (deterministic: email + cookie + phone matching) — `identity_graph` schema už máme
- Real-time event ingest přes Kafka → ClickHouse — část naplánovaná
- Reverse ETL — naplánováno (`warehouse_sync`)
- Activation napříč 9 kanály — channel adapter pattern hotový

**Tension:** Skutečný CDP = $3K+/mo + 6–12 měsíců implementace. Mailforge "CDP-lite at SMB pricing" za $300–1500/mo = white space.

### 3.4 Deliverability standards 2026 (per `58_Deliverability_Compliance_Analysis.md`)

Gmail/Yahoo 2024+ requirements (must-have v0):

- ✅ SPF + DKIM + DMARC — Mailforge Go engine má DKIM, SPF/DMARC wizard plánovaný
- ❌ One-click unsubscribe RFC 8058 — Header je v Mailforge engine, ale workflow nedopilovaný
- ⚠️ Spam rate < 0.3% — abuse_detection schema máme, monitor v deliverability_insights TODO
- ✅ Authenticated subdomain support — domains schema podporuje

**BIMI je rising signal** — Gmail/Yahoo/Apple support, Mailforge by měl BIMI configurable v Phase 4+ (potřeba DMARC `p=quarantine` minimum).

**Compliance certifikace roadmap:**

- ISO 27001 (Year 1–2) — enterprise gate
- SOC 2 Type II (Year 2) — US/global enterprise
- ISO 27017/27018 (Year 3+) — cloud-specific
- HIPAA / FedRAMP — defer

### 3.5 Pricing strategy insights (per `59_Pricing_TCO_Analysis.md`)

Klíčová pozorování pro Mailforge pricing:

1. **Brevo "unlimited contacts + per-send" model** je pro 50K+ databázi game-changer ($52 vs Mailchimp $230)
2. **Event-based pricing (Bloomreach)** je opakovaně kritizováno — avoid
3. **Salesforce Premier Success 30% hidden cost** — Mailforge "support included" jako positioning
4. **CZ pricing floor**: Boldem 290 Kč / Ecomail 350 Kč / SmartEmailing 690 Kč — Mailforge entry pod 290 Kč (Free + 99–290 Kč entry) je white space
5. **CDP entry $3K+/mo** = bariéra pro SMB — Mailforge CDP-lite at $300–1500/mo je pozice
6. **Multi-year prepay slevy 20–30%** = enterprise standard
7. **AI included, no separate tier** jako Klaviyo/Bloomreach (vs Salesforce Agentforce trap)
8. **Public pricing až do $30K+/mo** = competitive advantage vs sales-only enterprise

**Doporučená Mailforge pricing tier struktura:**

- **Free**: 1 000 kontaktů, 5 000 emailů/měs, no SMS/voice — akviziční
- **Starter** 290 Kč / €15 / $19: 5 000 kontaktů, 25 000 emailů, SMS pay-per-use — pod Ecomail
- **Growth** 990 Kč / €49 / $59: 25 000 kontaktů, 150 000 emailů, omnichannel — Brevo Business teritory
- **Pro** 2 990 Kč / €149 / $179: 100 000 kontaktů, unlimited emails (fair-use), AI agents, voice — Klaviyo Email teritory
- **Business** 9 990 Kč / €499 / $599: 500 000 kontaktů, full CDP modules, web personalization, white-label — Targito teritory
- **Enterprise** custom: unlimited, SSO, ISO 27001, dedicated CSM, partner support — Bloomreach lite

Hybrid: per-contact + per-send + unlimited modules cap.
SMS / voice: pass-through cost + 2× markup.

### 3.6 Migration jako akviziční nástroj (per `60_Migration_Scenarios.md`)

**P0 migration importers pro Mailforge:**

1. **Mailchimp** — nejčastější source, API + CSV
2. **Klaviyo** — DTC standard, API + segments + flows
3. **Ecomail** — primární CZ switching, API/CSV + Mergado
4. **SmartEmailing** — historický CZ, CSV + Mergado
5. **Brevo** — common upgrader source
6. **Boldem** — CZ SMB downgrade

**P1 importers:** HubSpot, ActiveCampaign, MailerLite, Constant Contact.

**P2 (enterprise):** Salesforce MC, Bloomreach, Mailkit / Targito / Leadhub (partner-led).

**Akviziční hooks:**

- **"Migrate from Mailchimp v 1 dni"** — free guided wizard pro CZ/SK/EU SMB
- **"Switch from Ecomail/SmartEmailing"** — native CZ migration s lokální PR
- **"Escape Constant Contact"** — post-2025 free plan elimination
- **AI history preservation** — Claude API re-train rychle vs vendor-specific AI lock
- **GDPR consent timestamp preservation** = critical, často podceňované

---

## 4. White space — kde žádný z 27 konkurentů neexceluje

### 4.1 TOP 10 unique opportunities (kde Mailforge má skutečný moat)

| #   | White space                                                                                                                                                                | Proč Mailforge                                                                                                                                                                                                                | Implementační status                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **AI voice agent jako kampaňový kanál** (outbound voice s Claude + ElevenLabs)                                                                                             | Twilio + Deepgram + ElevenLabs + Claude stack je v `apps/voice-bot`. Žádný z 27 to nemá.                                                                                                                                      | Streaming API hotový, stub adapters — Phase 4–5 production wire             |
| 2   | **CZ/SK hluboká lokalizace + skloňování + gender + jmeniny + svátky + ISDOC + SPAYD QR + Sklik** s **globální feature parity** (predictive AI, omnichannel, sub-orgs, AMP) | Globální (Mailchimp/Klaviyo/Brevo) nemají CZ; lokální (Ecomail) má, ale shallower features. Mailforge má i18n cs/sk/en + skloňování plánované + 125 schemas.                                                                  | i18n + i18n-sk packages existují; gender + skloňování v TODO Opus tier      |
| 3   | **Low-code app-studio user-extensible moduly**                                                                                                                             | Targito má 40+ aktivovatelných modulů ale ne user-buildable. Žádný z 27 nemá user-defined moduly. Mailforge `app_studio` schema unique.                                                                                       | Schema existuje, runtime engine TODO Opus #594                              |
| 4   | **AI agents jako first-class platform entity v Claude pricing tier** (Sonnet 4.6 + Haiku 4.5)                                                                              | Klaviyo Marketing Agent $140-200/mo add-on, Salesforce Agentforce premium. Mailforge má `ai_agents` framework + MCP server + 7 routes — included v core.                                                                      | Framework + MCP hotový; Voice/Campaign/Customer agents production wire TODO |
| 5   | **EU-sovereign omnichannel s vlastním Go MTA + 9 channel adapters**                                                                                                        | Mailkit má EU sovereignty ale shallow AI; US tools mají depth ale GDPR-suspect; Brevo je FR ale ne CZ. Mailforge = EU + CZ + AI + own MTA.                                                                                    | MTA engine 1 733 řádků Go, čeká na produkční wire-up                        |
| 6   | **Unified omnichannel s shared frequency cap + Contact Policy napříč voice/SMS/email/WhatsApp/push**                                                                       | Brevo má 6 oddělených produktů, Klaviyo nemá voice, Targito offline channel je integrace. Mailforge `IChannelAdapter` + frequency_rules schema = jediná architektura, která může nabídnout všechny 4+ kanály jako rovnocenné. | Schema + adapter pattern hotové; orchestrace logic TODO                     |
| 7   | **Booking pages + Calendar + Calendly + Scheduling + Meetings** v messaging platform                                                                                       | Žádná z 27 nemá schedule-as-trigger nebo booking-page jako lead capture nativně. ActiveCampaign má Calendly jen jako data import. Mailforge schemas hotové.                                                                   | Schema hotové, UI + workflow integration TODO                               |
| 8   | **Calculated properties + Data sets + Saved queries user-defined**                                                                                                         | Klaviyo má pre-defined predictive (CLV, churn) ale ne user-defined. ActiveCampaign Custom Objects jen Enterprise. Mailforge `calculated_properties` + `data_sets` + `saved_queries` = killer pro power-users + agencies.      | Schema hotové, evaluator engine TODO Opus #598                              |
| 9   | **Open-source-ready vlastní Go MTA jako moat**                                                                                                                             | Žádná z 10 platforem nemá open-sourceable mail engine. Mailkit closed proprietary. Mailforge `apps/engine` mohl by být open-sourced pro enterprise self-host / on-prem demands → trust signal.                                | Existuje, license decision pending                                          |
| 10  | **Pricing transparency CZK/EUR + multi-region** + unlimited contacts + AI included + ISO 27001 (Year 2) — anti-enterprise-trap positioning                                 | Targito/Leadhub/SALESmanago/Bloomreach jsou opaque custom pricing. Inxmail má public pricing ale EUR-only. Salesforce Premier 30% surprise.                                                                                   | Marketing/strategic decision, no dev needed                                 |

### 4.2 Sekundární whitespace

- **Reseller / partner network pro CZ/SK agencies** — žádný major CZ tool to nemá structurally (SALESmanago dobrý PL model)
- **B2B vs B2C dual product playbooks** — Mapp/Evalanche split, ale ne v jednom produktu
- **Marketing vs Transactional IP pool separation** — EmailLabs to dělá, ale jako standalone product. Mailforge to může mít vestavěné.
- **Czech regulated industries** (banking, government, healthcare) přes vlastní compliance package + S/MIME signing — EmailLabs to nabízí pro PL, Mailforge může pro CZ/SK
- **Free first send 2 000 recipients** — rapidmail to dělá, snadný akviziční hook

---

## 5. Anti-patterns to avoid (z TCO + migration analýz)

| Anti-pattern                                                                      | Trap                                              | Mailforge alternativa                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **Event-based pricing** (Bloomreach)                                              | Customers underestimate event count → upsell trap | Per-contact + per-send hybrid s capped overage                |
| **Auto-upgrade na vyšší tier po 2× překročení limitu** (Constant Contact)         | Customer-hostile, často citováno v G2 reviews     | Soft cap → email warning → manual upgrade prompt              |
| **Premier Success 30% add-on** (Salesforce)                                       | Hidden Year 2+ cost                               | Support included v base price                                 |
| **Cancellation phone-only** (Constant Contact)                                    | Customer-hostile retention                        | Self-service cancel button visible                            |
| **AI jako separate tier** (Salesforce Agentforce, Klaviyo AI add-on)              | Customer feels nickel-and-dimed                   | AI included napříč tiers s usage cap                          |
| **All contacts incl. unsubscribed v billing** (Klaviyo Feb 2025)                  | Pricing trap pro velké databáze                   | Marketing Contact vs Non-Marketing flag (HubSpot model)       |
| **Per-seat pricing** (HubSpot Pro+)                                               | Discourages collaboration                         | Unlimited seats v paid tieres                                 |
| **Mandatory $3K onboarding fee** (HubSpot Pro+ Pro Enterprise)                    | Akviziční bariéra                                 | Self-service onboarding + optional paid concierge             |
| **Sales-only pricing** (Targito/Leadhub/SALESmanago/Bloomreach)                   | Friction pro mid-market self-serve                | Public pricing až do Enterprise tier                          |
| **Vendor-specific AI lock-in** (Klaviyo predictive, Bloomreach Loomi)             | Migration = lose AI training                      | Foundation models (Claude) + portable per-org context         |
| **AMPscript-like proprietary language** (Salesforce)                              | Non-portable skills                               | Liquid (industry standard) + optional SSJS-style escape hatch |
| **5 oddělených produktů** (Brevo Marketing + Sales + Conversations + Phone + CDP) | Confusing pricing, UX overhead                    | Unified product s modular toggles                             |
| **Per-message SMS markup** (Mailchimp/HubSpot/Klaviyo separate SMS)               | Surprise costs                                    | Transparent pass-through + 2× markup, no monthly SMS fee      |
| **EU "data center selection" jako paid feature**                                  | GDPR is not a feature                             | EU data residency default na všech tieres                     |

---

## 6. Klíčové flow patterns v sektoru (standard, který musíme matchovat)

### 6.1 Onboarding (5–8 kroků standard)

1. Signup (no credit card pro SMB, consultation request pro Enterprise)
2. Email verification
3. Wizard: use case + industry + size + e-com platform + migration source
4. Sender setup (from name + email) + DKIM/SPF/DMARC nudge (auto-DNS přes Entri)
5. Brand kit (colors + fonts + logo, AI-detected z URL)
6. First integration (Shopify/WooCommerce/Shoptet/Upgates pro CZ)
7. First contact import nebo first form
8. First campaign / first automation z gallery

### 6.2 Campaign Wizard (5–7 kroků)

1. Type (Regular / A/B / Re-send / RSS / Automated)
2. Setup (subject, preheader, sender, jazyk)
3. Recipients (lists + segments, exclusion)
4. Design (drag-drop + template + brand kit + personalization tokens + product feed bloky)
5. Test (preview multi-device, send test, spam check, link check)
6. Schedule (now / specific time / time-zone / AI optimal / throttled / Limiter)
7. Confirm

### 6.3 Automation Builder UX

- Visual drag-drop canvas (React Flow standard)
- Triggers: behavior + e-commerce + date/time + custom event + API + form + webhook (14+ standardní)
- Logic nodes: wait, condition (if/else), percentage split, wait-for-trigger, goal
- Actions: send email/SMS/WhatsApp/push/voice/notification, tag/list/field update, webhook, sub-automation enroll
- Frequency control: jednou per kontakt / opakovaně s minimální mezerou / global frequency cap
- Testing: preview as kontakt + walk-through + activity log + heatmap/funnel debugger
- Library: 8–900+ pre-built recipes/scenarios

### 6.4 Segmentation builder UX

- Filter criteria: profile + email engagement + e-commerce + custom events + web behavior + predictive metrics + geo + date + tag/list + custom fields + relational data (PRO)
- Operators: AND / OR / NOT, nested conditions s parentheses
- Output: dynamic (auto-update) vs. static snapshot, saved/reusable
- Use: campaign targeting + automation trigger + reporting cohort + ad audience sync

### 6.5 Deliverability flow

- Domain auth (DKIM + SPF + DMARC; **DMARC p=reject = 2026 gold standard**)
- **One-click unsubscribe (RFC 8058) povinné**
- IP warm-up split / Limiter pro novou doménu
- Engagement-based routing (high engagement → main IP pool, low → secondary)
- Real-time monitoring bounce/complaint rates s alerty
- ISP feedback loops (Seznam, Centrum, Gmail, Outlook)
- Suppression auto-management

### 6.6 Reporting flow

- Real-time dashboard (sends, opens, clicks, conversions, revenue)
- Per-kampaň reports + heatmap clicks
- Comparative reporting (Premium tiers)
- E-commerce attribution (revenue per email/audience/product)
- Predictive cohorts (CLV, churn, RFM)
- Custom dashboards / export do Power BI / Looker Studio / Reverse ETL

---

## 7. Doporučená pozicovaní pro Mailforge

### 7.1 Primary positioning

**"EU-sovereign omnichannel platform s CZ/SK lokalizací a AI agents. Voice + SMS + Email + WhatsApp + Push s shared contact policy. Postaveno pro mid-market za SMB cenu."**

### 7.2 Sub-positioning per persona

**E-commerce manager (CZ/SK SMB):**

> "Skončete s pěti samostatnými nástroji. Email kampaně, SMS reminders, voice survey hovor — všechno z jednoho dashboardu, lokalizované do češtiny i s 7 pády."

**Mid-market retail (V4+):**

> "Targito/Leadhub features za zlomek ceny. Transparent pricing, public tiers, žádný custom sales cycle."

**B2B SaaS (CZ/SK/PL):**

> "Marketing automation + sales sequences + AI voice screening. Pro firmy, které potřebují HubSpot, ale nemůžou si dovolit $5K/mo."

**Agency (CZ/SK):**

> "Multi-account přepínání, white-label režim, per-client billing, partner revenue share. Postaveno pro agentury obsluhující 10+ klientů."

### 7.3 Anti-positioning (čím Mailforge NE je)

- ❌ NE "next Mailchimp" — Mailchimp je email-only, my omnichannel
- ❌ NE "AI marketing tool" — AI je doplněk, ne core
- ❌ NE "B2B sales platform" — to je Apollo / Outreach / HubSpot
- ❌ NE "transactional email API" — to je Mailgun / Postmark (transactional je side feature)
- ❌ NE "DTC e-commerce specialist" — to je Klaviyo (nesnažme se konkurovat head-on)

---

## 8. Risky tensions a open questions

### 8.1 Strategic tensions

1. **Mailforge SMB cíl vs Bloomreach-class tech stack** — postavili jsme architecture pro $3K+/mo enterprise, ale chceme prodávat za 290–9 990 Kč/mo SMB. Risk: under-utilized infra, customer support overhead.
2. **Omnichannel feature scope vs solo dev kapacita** — 50+ must-have features při solo developer + Claude = realisticky 18+ měsíců do production launch. Real launch je 2027–2028.
3. **CZ lokální focus vs V4+ expansion timing** — pokud strávíme rok dolepováním CZ specifik (Shoptet, Sklik, ISDOC), expanze do PL/DE se odsune. Naopak pokud Polskem začneme rychle, ztratíme defensible CZ moat.
4. **Open source vlastního MTA vs proprietary defensive moat** — open-source MTA = trust signal pro enterprise self-host, ale možný copycat. Postal precedent ukazuje, že open source je net positive.
5. **AI included vs upsell tier** — Klaviyo Marketing/Customer Agent jsou $140-200/mo add-ony. Mailforge included strategy je customer-friendly, ale ztrácíme high-margin upsell. Kompromis: AI rate-limited tiers.

### 8.2 Open questions

- [ ] **Jméno**: Mailforge vs ForgeMsg vs nové — public brand final volba před launch
- [ ] **Voice robot v MVP nebo Vlna 2?** — Stack hotov, ale production wire-up = ~4 týdny
- [ ] **HLR lookup** — Phase 8 v ROADMAP ZRUŠENO, ale TODO Sonnet má. Reaktivovat?
- [ ] **App-studio (low-code) priorita** — schema máme, runtime engine = 6+ týdnů, killer feature ale risky
- [ ] **Kdy z Coolify na k3s?** — Phase 5 nebo Phase 7?
- [ ] **CSA membership (DE deliverability)** — €1500-3000/rok, ROI viable jen po DACH launch
- [ ] **Open-source Go MTA** — license decision (BUSL? AGPL? MIT?)
- [ ] **Reseller program** — kdy spustit, jaký rev-share (Mailgun 30% Y1 / 10% on, Klaviyo 15% lifetime)
- [ ] **ISO 27001 timeline** — Year 1 nebo Year 2? €20-50k jednorázově + €15k/yr audit
- [ ] **Postmark-class transactional sub-product** — Mailforge MTA může být standalone "Mailforge Send" za $35-99/mo, attack Mailgun/Sendgrid. Dělat nebo focus?
- [ ] **B2B vs B2C playbook split** — dva default templaty (B2B SaaS lead nurture vs B2C e-shop). Kdy postavit?
- [ ] **Working tree cleanup** — desítky necommitovaných změn, jak to uvést na zdravý git stav?
- [ ] **TODO/ROADMAP reality update** — todonow.md 316 open je nesmysl, kdy přepsat?

---

## 9. Klíčové akce — kde začít

### Krok 1 (P0, before any new feature work)

1. **Diagnostický audit kódu** — `pnpm install && pnpm typecheck && pnpm test && pnpm build` na clean state. Zjistit kolik z 95k řádků reálně prochází tests + build.
2. **Cleanup git working tree** — projít desítky modifikací, commitnout nebo zrušit, smazat orphaned `apps/number-intel/`.
3. **Aktualizovat ROADMAP + TODO** — propsat realitu kódu (Mailforge JE Phase 5-6 ne Phase 0). todonow.md 316 položek redukovat na realistické TODO.
4. **Infrastructure pivot implementace** — Hetzner + Vercel Terraform moduly (viz `infra/PIVOT_AWS_TO_HETZNER.md`).

### Krok 2 (P0 features pro MVP launch)

5. **Subscription Types model** + Customer Preference Center (GDPR best practice + EU mid-market requirement)
6. **RFM auto-cohorts** + **Lead scoring engine** (calculated_properties + ClickHouse materialized views — base hotov)
7. **Frequency cap / Contact Policy** napříč kanály (frequency_rules schema + Redis counter)
8. **Custom events API** `POST /api/v1/track` + jako automation trigger
9. **Send Time Optimization** (simple historical-open model, ne ML zatím)
10. **CZ/SK skloňování + gender inference + jmeniny + svátky** — finalizovat (Opus TODO #383, #425, #606-637)
11. **Shoptet + Upgates native OAuth** — CZ market table-stakes
12. **Per-recipient discount codes** z Shoptet API (Liquid block s fetch)
13. **Pre-built automation gallery** — 20 templates v JSON (welcome, cart abandon, browse abandon, post-purchase, birthday, jmeniny, win-back, ...)
14. **Sklik audience sync** vedle Meta/Google
15. **Multi-account / Agency mode** UI

### Krok 3 (P0 strategický)

16. **Pricing tier finalizace** — public CZK/EUR/USD tiers
17. **Brand name lock-in** — Mailforge vs ForgeMsg vs nové
18. **Beta klient identification** — z PulseUp + Ticketarium network
19. **First migration importer**: Ecomail (CZ primary target)
20. **CZ blog content** — 10 článků o deliverability/GDPR pro EU mid-market SEO

---

## 10. Tension notes / biases v source documents

- Documents `data/` byly vytvořeny v jednom čase (May 18, 2026), pravděpodobně z `Claude` výstupu — bias toward marketing materials od vendorů + G2 reviews (US-biased).
- "Nejpoužívanější CDP v ČR" claim u Targita pochází z Sherpas Tech research, sample 313 e-shopů — ne reprezentativní pro celý CZ trh.
- Deliverability % claims (97%, 98%+, 99%) jsou self-reported v ~90 % případů.
- Bloomreach event-based pricing kritika je z G2 reviews, ne hard data.
- Dokument 60 hodně preferuje partner-led implementaci ($50K–500K Year 1) — partner ecosystem bias.
- Tier classification v dok. 56 a 57 si lehce protiřečí v HubSpot positioning (B2B AI Tier 2 vs B2C CDP-lite Tier 2).
- Constant Contact "free plan zrušen Jun 2025" je důležitý fact, ale dokument bias proti CC je silný.

---

## 11. Související dokumenty

- `FORGEMSG_ROADMAP.md` — kompletní 52-týdenní plán (potřebuje update post-pivot + post-finding)
- `TECH_STACK.md` — technologické volby (Infrastructure pivot 2026-05-18 already updated)
- `POZICOVANI.md` — competitive positioning (created 2026-05-18, doplnit finding)
- `infra/PIVOT_AWS_TO_HETZNER.md` — AWS → Hetzner pivot detail
- `infra/HOSTING_DETAIL.md` — Hetzner produkty
- `infra/DELIVERABILITY.md` — IP warming, FBL, multi-tenant izolace
- `data/55_Master_Srovnavaci_Matrix.md` — 27 platforem srovnání
- `data/56_AI_Capabilities_Comparison.md` — AI tier classification
- `data/57_CDP_Capabilities_DeepDive.md` — CDP pillars
- `data/58_Deliverability_Compliance_Analysis.md` — deliverability + GDPR
- `data/59_Pricing_TCO_Analysis.md` — pricing modely
- `data/60_Migration_Scenarios.md` — migration scénáře
- `data/01–54_*` — 27 platforem deep dives

---

_Dokument vytvořen: 2026-05-18_
_Status: pracovní podklad pro product strategy + backlog priorities_
_Vlastník: omniascz@gmail.com_
_Příští revize: po implementaci P0 (Krok 2) sekce 9_
