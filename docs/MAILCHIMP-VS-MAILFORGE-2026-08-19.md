# Mailchimp vs MailForge — kompletní srovnání (2026-08-19)

> Nahrazuje `MAILCHIMP-VS-MAILFORGE-2026-07-01.md`. Od minulého auditu se posunuly **obě strany**:
> Mailchimp vydal únorový e-commerce release a květnovou vlnu AI (Analytics AI, AI Segment Builder,
> Claude/ChatGPT app), MailForge zavřel většinu „built-but-unwired" děr z minulého auditu.

## Metodika — jak přesně bylo co ověřeno

**Strana Mailchimpu** — výhradně z primárních zdrojů Mailchimpu (ne z recenzních blogů):
`mailchimp.com/features`, `mailchimp.com/pricing/marketing`, kompletní výpis článků nápovědy ze 14 kategorií
(`/help/audiences`, `/automation`, `/emails`, `/reports`, `/edit-and-design`, `/delivery`, `/websites`,
`/landing-pages`, `/transactional`, `/data-privacy`, `/integrations`, `/mobile`, `/accounts`, `/merge-tags`),
navigace referenční příručky Marketing API, a tiskové zprávy k release 2/2026 a 5/2026.

**Strana MailForge** — výhradně čtením kódu v tomto repu na `feat/smtp-submission-hardening` (b8c056b).
Každé tvrzení níže má za sebou konkrétní soubor a řádek. **Kde něco nefunguje, je to napsané, i když to
minulý audit hlásil jako hotové, a naopak.** Co jsem neověřil živým během (např. geo-lookup proti reálné
GeoIP službě), je explicitně označeno.

Legenda: ✅ plné · 🟡 částečné / podmíněné · 🔴 chybí

---

## Scoreboard

| Doména                    | Vítěz                                      | Jednou větou                                                                                                  |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Audience & kontakty       | **MailForge**                              | + identity merge, lifecycle, HLR, per-purpose GDPR; MC má navíc predicted age a 11 typů merge polí            |
| Segmentace                | **MailForge**                              | nested AND/OR depth 8 + NL→segment v GA; MC má AI Segment Builder teprve v betě                               |
| Signup formuláře          | **remíza**                                 | MF: A/B, progressive, prefill, QR; MC: překlady polí, mini-kvíz v popupu, SMS age-gating                      |
| Landing pages / weby      | **Mailchimp**                              | MF nemá landing pages ani website builder vůbec                                                               |
| Editor & typy kampaní     | **MailForge (engine)** / Mailchimp (bloky) | MF: AMP, countdown GIF, 14 operátorů dynamic, CZ/SK skloňování; MC: 260+ šablon, photo editor, ~30 typů bloků |
| Automatizace              | **remíza (jiné silné stránky)**            | MF: víc typů akcí + nested flows; MC: per-krok reporting, zralejší UI. **MF má potvrzený bug v `cascade`.**   |
| Odesílání & doručitelnost | **MailForge**                              | vlastní MTA, VERP, adaptivní ISP throttle, SMTP submission — vše nově zapojené                                |
| Reporting                 | **MailForge**                              | atribuce 5 modelů, kohorty, funnely, NL analytika, custom builder, CSV+PDF                                    |
| E-commerce                | **MailForge**                              | + back-in-stock/price-drop, ISDOC, CZ storefronty, feedy; MC dohnal back-in-stock a Site Pixel                |
| Multichannel              | **MailForge**                              | WhatsApp, Viber, Push, Voice, RCS — MC nic z toho nemá                                                        |
| Recipient-facing stránky  | **Mailchimp**                              | MF dodělal view-in-browser + CAN-SPAM, ale chybí archiv, forward-to-friend, permission reminder               |
| Platforma / API / admin   | **MailForge**                              | SAML/OIDC SSO, audit log, MCP server, scopes; MC: 300+ integrací, mobilní apky, Batch API                     |
| Ekosystém & polish        | **Mailchimp**                              | 300+ integrací vs 29, 260+ šablon vs ~70, plnohodnotné mobilní apky                                           |

---

## 1. Co se změnilo od auditu 2026-07-01

### 1.1 MailForge zavřel 20 z 24 tehdejších děr (ověřeno v kódu)

| Tehdejší díra                                               | Stav dnes             | Důkaz                                                                                                                                                                         |
| ----------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naplánované kampaně se nikdy neodešlou                      | ✅ opraveno           | `workflow-scheduler.ts:306-317` repeatable každou minutu → `/internal/campaigns/dispatch-scheduled` → `campaigns/dispatch.ts:207` (`status='scheduled' AND scheduledAt<=now`) |
| Adaptivní ISP throttle = mrtvý kód                          | ✅ opraveno           | `mta-sender.ts:201` gate `checkThrottle` + requeue s delayem; `:281` `recordThrottleSignal` na 421/451                                                                        |
| Engine nemá VERP / Return-Path                              | ✅ opraveno           | proto pole 17 `return_path`; `smtp/sender.go:167-171` použije jako MAIL FROM; `server/grpc.go:143`                                                                            |
| `bounce-processor.ts` nikdo neimportuje                     | ✅ opraveno           | `services/inbound-email/index.ts:23`                                                                                                                                          |
| `{{view_in_browser_url}}` se nikdy nenaplní                 | ✅ opraveno           | `batch-sender.ts:287` staví URL, `routes/v1/browser.ts:15` obsluhuje, `campaigns/browser-view.ts` renderuje                                                                   |
| Chybí CAN-SPAM poštovní adresa                              | ✅ opraveno           | `organizations.postalAddress`, auto-append v `dispatch.ts:115-129` i `browser-view.ts:80`                                                                                     |
| Žádná geolokace otevření                                    | 🟡 opraveno podmíněně | `lib/geo.ts` + `services/analytics/geo.ts`, volá se z `tracking.ts:16`. **Bez `GEOIP_API_URL` je to no-op** — živě jsem to běžet neviděl                                      |
| Device / email-client stats vždy „unknown"                  | ✅ opraveno           | `tracking.ts:69` `parseUserAgent` → zapisuje `deviceType`, `emailClient`                                                                                                      |
| Žádný CSV / PDF export                                      | ✅ opraveno           | `analytics.ts:98` CSV, `:187` PDF (`lib/pdf.ts`)                                                                                                                              |
| Žádný custom report builder                                 | ✅ opraveno           | `services/report-builder/` → `routes/v1/reports.ts`                                                                                                                           |
| Scheduled reports neposílají e-mail                         | ✅ opraveno           | `scheduled-reports/index.ts:138` `sendTransactionalEmail`; hodinový cron v `:05`                                                                                              |
| API-key scopes se nevynucují                                | ✅ opraveno           | `plugins/auth.ts:99-102` globální onRequest gate přes `scopeAllows`                                                                                                           |
| Žádná reCAPTCHA / anti-bot                                  | ✅ opraveno           | `lib/captcha.ts` (turnstile / recaptcha / hcaptcha) + honeypot v `schema/signup-forms.ts:103-113`                                                                             |
| Hostovaná stránka formuláře + `loader.js` neobsloužené      | ✅ opraveno           | `signup-forms.ts:162` `/public/forms/loader.js`, `:174` `/hosted`, `:202` `/view`                                                                                             |
| `onListSubscribe` / `onTagAdded` se nikdy nevolají          | ✅ opraveno           | `services/lists/index.ts:146`, `routes/v1/tags.ts:220`, `integrations/zapier.ts:110`                                                                                          |
| 56-recipe galerie má vadné configy                          | ✅ opraveno           | `workflow-templates/registry.ts:71-78` — helper `wait()` emituje `{duration,unit}`; `send_sms` emituje `message`; `condition` se normalizuje v `actions.ts:312`               |
| Akce `send_whatsapp`/`push`/`in_app`/`voice` = no-op        | ✅ opraveno           | `actions.ts:1567-1575` → `executeQueuedChannel` do reálných front                                                                                                             |
| Chybí `unsubscribe` node                                    | ✅ opraveno           | `actions.ts:1576` `executeUnsubscribe`                                                                                                                                        |
| `update_field` ignoruje custom fields                       | ✅ opraveno           | `actions.ts:524-533` merge do `customFields` JSONB                                                                                                                            |
| Run-state (converted / splitBranch / data) nepřežije `wait` | ✅ opraveno           | `executor.ts:114-129` persistuje po **každém** nodu                                                                                                                           |
| Fronta `webhook` nemá konzumenta                            | ✅ opraveno           | `jobs/webhook-deliver.ts` startuje v `workers/src/index.ts`                                                                                                                   |
| Žádná journey analytika                                     | 🟡 částečně           | `/workflows/:id/analytics` (runs, conversion rate, revenue, RPR) — ale **žádný per-krok breakdown** jako MC „Marketing Automation Flow Reports"                               |
| Manuální VIP flag chybí                                     | ✅ opraveno           | `contacts.isVip` + index `contacts_org_vip_idx`                                                                                                                               |
| Stavy `non_subscribed` / `archived` chybí                   | ✅ opraveno           | `db/schema/enums.ts:26,29`                                                                                                                                                    |

### 1.2 Mailchimp mezitím přidal (a část toho MF nemá)

| Novinka MC                                                                        | Datum                                     | Stav v MF                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Analytics AI** — konverzační analytický agent („co se změnilo, proč, co dělat") | 5/2026, GA na placených plánech           | ✅ parita: `/api/v1/ai-analytics/ask` (NL → query plan → sandboxovaný SQL; `services/ai-analytics/nl-query.ts` + `sandbox.ts`) |
| **AI Segment Builder** — segment z popisu přirozeným jazykem                      | 5/2026, **beta**                          | ✅ MF to má v GA: `/api/v1/ai/segment-from-description` (`routes/v1/ai.ts:125`)                                                |
| **Mailchimp app v Claude a ChatGPT**                                              | 5/2026, US/CA/UK/AU                       | ✅ parita jinou cestou: `apps/mcp-server` (MCP)                                                                                |
| **Canva integrace** (design → send-ready e-mail)                                  | 5/2026                                    | 🔴 chybí                                                                                                                       |
| **One-Click Data Activation** (Site Pixel pro WooCommerce + Wix)                  | 5/2026                                    | 🟡 MF má `site-tracking.ts` + Woo integraci, Wix ne                                                                            |
| **SMS age-gating** (alkohol, podle zemí)                                          | 5/2026                                    | 🔴 chybí                                                                                                                       |
| **Yotpo / Judge.me reviews konektory**                                            | 2/2026                                    | 🔴 chybí (MF má vlastní `reviews-v2`, ne tyhle konektory)                                                                      |
| **Unique discount codes v SMS**                                                   | 2/2026                                    | ✅ MF má SMS kupóny + atomic assign z batche                                                                                   |
| **SMS ve 37 zemích** + instant opt-in v popupu                                    | 2/2026                                    | 🟡 MF má vlastní SMPP gateway (bez limitu zemí), ale ne „instant opt-in" flow v popupu                                         |
| **Back-in-stock alerty**                                                          | v `/help/automation`                      | ✅ MF má (`stock-alerts.ts`) — MC tuhle MF výhodu dohnal                                                                       |
| **Loyalty Leaderboard**                                                           | v `/help/audiences`                       | ✅ MF má (`routes/v1/loyalty/analytics.ts`)                                                                                    |
| **Enhanced migration tools** (import z konkurence)                                | 2/2026                                    | 🔴 MF má jen CSV import + `contact-imports`                                                                                    |
| **Comparative reports**                                                           | **zrušeno** (už nejsou v `/help/reports`) | ✅ MF si je nechal → výhoda                                                                                                    |

---

## 2. Doménové srovnání

### 2.1 Audience & kontakty

**MailForge dorovnává nebo překonává:** many-to-many lists (lepší model než MC izolované audiences),
tagy + auto-tag rules, groups, merge fields s inline default filtry, saved segmenty s live count,
CLV / purchase-likelihood / churn (Gamma-Poisson v `predictive-segmentation/pure.ts`, denní cron přes
`/internal/triggers/daily-run`), predicted next-order, timeline, notes, per-purpose GDPR consent,
dedup + **identity resolution / merge** (MC nemá), RFM 11 segmentů, VIP flag, `non_subscribed` +
`archived` stavy, list hygiene + e-mail validace.

**MailForge navíc (MC nemá):** lifecycle stages + historie · phone/HLR intelligence (typ, operátor,
region, ported, roaming) · cross-record identity merge · consent graph · zero-party data · CDP unified profile.

**Mezery MF vs MC:**

| Co                                              | Stav | Ověřeno                                                                                                                                                                 |
| ----------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Predicted age range**                         | 🔴   | grep `ageRange\|predictedAge` v `apps/api/src` → 0 zásahů. Gender MF má (`gender/cz-sk-inference.ts` + `genderize-api.ts`), predicted location jen nepřímo z geo eventů |
| **Typy custom polí: 5 vs ~11**                  | 🔴   | `enums.ts:102` = `text, number, date, select, boolean`. MC má navíc address, birthday, image, website, phone, zip, radio                                                |
| **Contact rating 1–5 hvězd**                    | 🟡   | MF má `engagementScore` 0–100 (`schema/engagement.ts:84`) — jiná stupnice, ne MC formát                                                                                 |
| **Combine Audiences tool / Replicate Audience** | 🔴   | grep `combineAudience\|replicateAudience` → 0. MF má identity merge na úrovni kontaktu, ne slévání celých audiences                                                     |

### 2.2 Signup formuláře, landing pages, weby

**MF navíc:** A/B varianty formulářů · conditional smart fields · progressive profiling · prefill známého
návštěvníka · workflow/webhook trigger na submit · QR generátor · hostovaná stránka + `loader.js` embed
(nově obsloužené) · captcha (3 providery) + honeypot.

**MC navíc:**

| Co                                                               | Stav MF                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Landing pages** (builder, URL, SEO, notification bar, reporty) | 🔴 chybí úplně (`find -iname "*landing*"` → jen marketingová stránka MF a `/v/:token` video landing) |
| **Website builder + nákup a správa domény**                      | 🔴 chybí                                                                                             |
| **Cookie banner + legal policy generátor**                       | 🔴 chybí                                                                                             |
| **Překlady polí formuláře**                                      | 🔴 chybí (grep `formTranslation` → 0)                                                                |
| **Mini-kvíz v popup formuláři**                                  | 🔴 chybí                                                                                             |
| **SMS age-gating při signupu**                                   | 🔴 chybí                                                                                             |
| Popup form renderer                                              | 🟡 schema je, klientský renderer ne                                                                  |

> Poznámka: landing pages / website builder / donations / event pages jsi v session 2026-07-02
> explicitně **odmítl stavět**. Uvádím je jako fakticky chybějící, ne jako doporučení je dělat.

### 2.3 Kampaně & editor

**Typy kampaní:** regular, plain-text, A/B, multivariate (≤8), RSS — všech 5 ✅. Multivariate má MC až
na Premium ($350/měs), MF neplan-gatuje.

**MF navíc (MC nemá):**

- **AMP for Email**
- **animovaný countdown GIF** (`/editor/countdown.gif`)
- **14 operátorů dynamic content** (`blocks.ts:42-56`: eq, neq, gt, gte, lt, lte, contains, not_contains,
  in, not_in, is_set, is_not_set, has_tag, not_has_tag) — **MC má 4** (is / is not / contains / does not
  contain), max 10 podmínek na blok, jen Standard+, nefunguje ve footeru
- 10 typů dynamic zdrojů (`time_of_day`, `day_of_week`, `weather`, `geo`, `stock_level`, `live_price`,
  `countdown`, `custom_api`, …)
- inline merge default `{{x|default:"y"}}` + řetězení filtrů
- **CZ/SK skloňovací filtry** `|vocative|genitive|dative`
- pre-send spam-score checker + dark-pattern detector + accessibility fix
- Liquid + Connected Content
- per-recipient AI generování, AI subject lines s historií, brand-voice analýza

**MC navíc:**

| Co                                                    | Stav MF      | Ověřeno                                                                                                                                                                        |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **260+ šablon**                                       | 🟡 MF ~70+   | `editor/templates/index.test.ts:9` `toBeGreaterThanOrEqual(70)`                                                                                                                |
| **Photo editor** (ořez, filtry)                       | 🔴           | grep `sharp\|resize\|crop` v media službě → 0                                                                                                                                  |
| **AI generování grafiky** (Creative Assistant)        | 🔴           | grep `generateImage\|dall-e` → 0                                                                                                                                               |
| **~30 typů bloků** vs MF 13                           | 🟡           | `blocks.ts:377-391` = text, image, button, divider, spacer, columns, hero, social, product, video, coupon, footer, dynamic                                                     |
| — konkrétně chybějící bloky                           | 🔴           | survey/poll, payment (Stripe), share, RSS items, signup form, code/HTML, apps, image map, table of contents, samostatný product-recommendation blok, layouts / section manager |
| **Live co-editing + komentáře**                       | 🔴           | MC „Collaborate on Emails"; v MF žádná obdoba                                                                                                                                  |
| **Email Beamer** (poslat e-mail → vznikne kampaň)     | 🔴           | grep `beamer` → 0                                                                                                                                                              |
| **Import HTML from URL**                              | 🔴           | grep `importHtmlFromUrl\|importFromUrl` → 0                                                                                                                                    |
| **Campaign folders / Template folders**               | 🔴           | grep `campaignFolder\|templateFolder` → 0                                                                                                                                      |
| **Giphy / Wistia / Playable video / Instagram bloky** | 🔴           | žádný z konektorů                                                                                                                                                              |
| CSS inliner                                           | ✅ nepotřeba | renderer emituje inline styly přímo (`render/render.ts:84,132`)                                                                                                                |

### 2.4 Automatizace

**MF navíc:** víc typů akcí než MC — 30 v `actions.ts:1563-1626` vs ~10 rule/action typů v MC — včetně
Viber, cascade, **nested sub-flows** (`start_workflow`), loyalty, `run_code` sandbox, sync do ad audience,
Stripe retry charge, review request, `smart_channel`, N-way split, automation map, CZ/SK jmeniny a svátky
jako triggery. 50+ receptů v registry (`registry.test.ts` hlídá ≥50 receptů / ≥15 kategorií / en+cs+sk).

**MC navíc:**

- **Per-krok reporting flow** (MC „About Marketing Automation Flow Reports", i na mobilu) — MF má jen
  run-level agregáty: `getWorkflowAnalytics` (`workflows/index.ts:163-193`) vrací total / active /
  completed / failed / converted / conversionRate / totalRevenue / revenuePerRecipient. 🟡
- **Classic Automations** jako druhá, jednodušší vrstva (birthday e-maily, RSS automation, autorespondery).
  Spíš legacy dluh MC než výhoda, ale pro migrující zákazníky to má cenu.
- **Wait for Trigger rules** jako first-class prvek.
- **Post-sending actions** na automation e-mailech.

#### 🔴 NOVĚ NALEZENÝ BUG: `cascade` node se nikdy neposune

**Ověřeno:** `actions.ts:934` čte `run.data.cascadeStep`. Grep `cascadeStep` přes celý `apps/api/src`
vrací **jen čtení** (`:934`, `:937`) a **tři testovací fixtures** (`workflows.test.ts:620,665,707`) —
v produkčním kódu se nikdy nezapisuje.

Důsledek: `currentStep` je vždy `0`, podmínka `if (currentStep > 0 && …)` nikdy neplatí, takže se
**nikdy nevyhodnotí ukončovací podmínka** a node donekonečna posílá krok 0 každých `delayHours`.
Nejde tedy o „pošle jen první krok" (tak to popisoval červencový audit), ale o **nekonečnou smyčku
prvního kroku** — run-state se teď totiž korektně persistuje, takže se node opravdu resumuje pořád dokola.

Testy `workflows.test.ts` prochází (spuštěno: `vitest run` → **29/29 passed**), protože si fixtures
`cascadeStep` dosazují ručně. Test na inkrement neexistuje.

### 2.5 Odesílání, plánování, doručitelnost — **zde MF vede**

**MF (vše ověřeno v kódu):** vlastní Go MTA (direct-to-MX, reálný DKIM podpis, connection pooling) ·
per-ISP routing + rate caps · **adaptivní ISP throttle nyní zapojený** · **VERP / Return-Path** ·
in-session i out-of-band bounce handling (ARF/DSN) · FBL + auto-quarantine · Timewarp ·
plain-text multipart · RFC 8058 one-click unsubscribe · SPF/DKIM/DMARC generování + živé DNS ověření ·
BIMI · DMARC IMAP poll · blacklist monitor · seed-list placement testy · warmup s enforcementem ·
dedicated IP pooly · **SMTP submission server na :587 se STARTTLS** (`engine/internal/submission/server.go`
— právě hardenovaný na této větvi: AUTH jen po TLS, limit 100 RCPT, 5 failed AUTH → close).

MC proti tomu nabízí černou skříňku (Omnivore, Delivery Insights, throttling) — bez kontroly nad IP,
bez vlastního MTA, se SMTP relayem jen jako placeným Mandrill add-onem.

**Zbývající mezery MF:**

| Co                                                              | Stav | Ověřeno                                                                                                                                                                              |
| --------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Batch Delivery** (rozložit odeslání do N dávek po X minutách) | 🔴   | grep `batchDelivery\|batchSchedule` → 0. MC to má jako „Schedule Batch Delivery"                                                                                                     |
| **Per-contact STO při hromadném sendu**                         | 🟡   | `send-optimization/per-contact-sto.ts` i `/send-optimization/batch-compute` existují, ale **žádný cron je nespouští** a `campaign-splitter.ts` předává jen `timewarp`, ne STO hodinu |
| **Inbox preview přes Litmus**                                   | 🟡   | architektura hotová, provider je heuristická simulace                                                                                                                                |

### 2.6 Reporting & analytika — **MF vede**

**MF dorovnává/překonává:** core metriky včetně CTOR · timeline · top links · click mapy s pozicemi ·
revenue reporty · **multi-touch atribuce 5 modelů + cross-channel** · prediktivní skóre · **kohorty +
funnely** · growth/churn · A/B + multivariate výsledky · per-event **Apple MPP** flagging · bot filtering ·
benchmarks · **comparative reports (MC je zrušil)** · **geo země + město + mapa** (🟡 vyžaduje
`GEOIP_API_URL`) · **device / e-mail klient** · **CSV + PDF export** · **custom report builder** ·
**scheduled reports reálně e-mailem** · **NL konverzační analytika** (`/ai-analytics/ask`) · seed-list metriky.

**MC navíc:**

| Co                                                                         | Stav MF                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Google Analytics integrace** (nativní, „Find Mailchimp Data in GA")      | 🔴 jen UTM parametry, žádný GA konektor (grep `googleAnalytics\|ga4` → 0) |
| **Meta Pixel na landing pages**                                            | 🔴 (MF nemá landing pages)                                                |
| **Domain performance report**                                              | 🔴                                                                        |
| **Conversion Insights Dashboard / Campaign Manager** jako hotové obrazovky | 🟡 data MF má, UI ne                                                      |
| **Chimp Chatter** (real-time feed aktivit)                                 | 🟡 MF má audit log, ne aktivity feed                                      |

### 2.7 E-commerce — **MF vede**

**MF navíc:** back-in-stock + price-drop alerty · **reálná ISDOC fakturace** (DPH, IČO/DIČ, Pohoda/Money) ·
**CZ storefronty** Shoptet / Upgates / FastCentrik · **Heureka / Zboží / Google Shopping feedy** ·
SMS kupóny · AI product recommendations (co-purchase + Claude) · replenishment recepty ·
loyalty program + leaderboard · digital assets + license keys.

**MC navíc:** Yotpo / Judge.me reviews konektory 🔴 · QuickBooks Online 🔴 · Square shoppable landing
pages 🔴 · Stripe payment blok v e-mailu 🔴 · Wix / Lightspeed / Volusion / Big Cartel / Squarespace
Commerce konektory 🔴.

MF má `stripe` (billing + CDP source), ale ne payment blok v e-mailu.

### 2.8 Multichannel — **MF vede drtivě**

**MF má, MC nemá vůbec:** WhatsApp (Meta Cloud API, templates, 24h okno) · Viber (3-provider failover) ·
Web Push + FCM/APNs · **AI Voice bot** (Twilio + Deepgram + ElevenLabs + Claude) · RCS ·
LinkedIn + TikTok organic social · Sklik ads + lookalike · in-app zprávy · site messages ·
helpdesk / universal inbox · meetings + round-robin booking.

**MC má, MF nemá:** **postcards / fyzická pošta** 🔴 · tvorba ad kreativ a kampaní (MF má jen audience
sync + reporting) 🟡 · Google Remarketing Ads jako turnkey produkt 🟡.

### 2.9 Recipient-facing toky — **MC vede**

**MF ✅:** single/double opt-in · opt-in confirmation · signed RFC 8058 one-click unsubscribe ·
unsubscribe stránka · preference center (per-list + global, signed token, bez loginu) · resubscribe ·
GDPR per-purpose consent s IP/timestamp · **view-in-browser (nově funkční)** ·
**CAN-SPAM poštovní adresa (nově)** · bounced/complained ≈ MC „cleaned".

**Zbývající mezery:**

| Co                                                                                                   | Stav | Ověřeno                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| **Veřejná archivní stránka kampaně** (MC „Email Campaign Archives and Pages" + embed archivu na web) | 🔴   | grep `campaignArchive\|public/campaigns` → 0                                   |
| **Forward-to-a-friend**                                                                              | 🔴   | grep `forwardToFriend` → 0                                                     |
| **Permission reminder**                                                                              | 🔴   | grep `permissionReminder` → 0                                                  |
| **Strukturovaný unsubscribe-reason survey + report**                                                 | 🟡   | jen volný text (`preference-center.ts:32` `reason: z.string()`), žádná analýza |
| **Social share bloky pro příjemce**                                                                  | 🔴   | `social` blok = follow ikony                                                   |
| Preference center needituje custom fields / groups                                                   | 🟡   |                                                                                |

### 2.10 Platforma, API, admin — **MF vede na jádru, MC na ekosystému**

**MF navíc (MC nemá):** **SAML + OIDC SSO** — Mailchimp nativní SSO nenabízí na žádném tieru, existují
jen konektory třetích stran (Okta / OneLogin / miniOrange) · searchable audit log · custom permission
sets · field-level permissions · **MCP server** · **Resend-kompatibilní API** · vlastní MTA + SMTP
submission · App Studio · sandboxy · data residency · HIPAA pozice · superadmin konzole · partner program ·
**transactional API v ceně** (u MC placený Mandrill add-on).

**MC navíc:**

| Co                                                                           | Stav MF  | Ověřeno                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **300+ integrací**                                                           | 🔴 MF 29 | `services/integrations/catalog.ts` — 29 položek                                                                                                                                                                                         |
| **Batch Operations API + Batch Webhooks**                                    | 🔴       | grep `batchOperations` → 0                                                                                                                                                                                                              |
| **Account Exports API** (export celého účtu)                                 | 🔴       | grep `accountExport` → 0; MF má jen export kontaktů                                                                                                                                                                                     |
| **Plnohodnotné mobilní apky (iOS + Android) + Mobile SDK + push notifikace** | 🟡       | `apps/mobile` je Expo scaffold, **705 řádků**, 5 obrazovek (login, dashboard, campaigns, campaign detail, contacts). MC umí na mobilu vytvořit e-mail, landing page, social post, welcome/abandoned-cart automation, anomaly notifikace |
| **Per-plan rate limiting**                                                   | 🔴       | `plugins/rate-limit.ts` = **plochých 100/min pro všechny** (vyňaté je jen `/internal/*`)                                                                                                                                                |
| **5 rolí** (Owner/Admin/Manager/Author/Viewer)                               | 🟡       | MF má 4 (owner/admin/editor/viewer) + custom permission sets                                                                                                                                                                            |
| **Agency access / Mailchimp & Co**                                           | 🟡       | MF má `partner.ts` a `cross-account.ts`, ne stejný program                                                                                                                                                                              |
| Plné SDK pokrytí                                                             | 🟡       | MF Python SDK jen contacts + events                                                                                                                                                                                                     |

---

## 3. Kde MailForge Mailchimp jednoznačně předbíhá

Vlastní MTA · SMTP submission (:587 STARTTLS) · VERP + out-of-band bounce · adaptivní ISP throttle ·
dedicated IP pooly + warmup · DMARC IMAP poll + BIMI · seed-list placement testy ·
WhatsApp · Viber · RCS · Web/mobile push · AI Voice bot · SMPP SMS gateway ·
LinkedIn + TikTok social · Sklik · MCP server · Resend-kompatibilní API · SAML/OIDC SSO ·
searchable audit log · custom permission sets · field-level permissions · App Studio · sandboxy ·
identity resolution/merge · lifecycle stages · phone/HLR intel · consent graph · zero-party data ·
Gamma-Poisson CLV · 5-model multi-touch atribuce · kohorty + funnely · NL analytika v GA ·
NL→segment v GA (MC jen beta) · comparative reports (MC zrušil) · AMP e-mail · countdown GIF ·
14-operátorový dynamic content · 10 dynamic zdrojů · CZ/SK skloňování a jmeniny · pre-send spam-check ·
dark-pattern detector · back-in-stock + price-drop · ISDOC fakturace · Shoptet/Upgates/FastCentrik ·
Heureka/Zboží/Google Shopping feedy · SMS kupóny · A/B formuláře · progressive profiling ·
per-purpose GDPR consent · helpdesk/universal inbox · meetings · loyalty + leaderboard ·
newsletter tiers/paywall/referrals · transactional v ceně.

## 4. Kde MailForge reálně zaostává — seřazeno podle dopadu

### P1 — brání prodeji nebo je to potvrzená chyba

1. **`cascade` node je nekonečná smyčka** (§2.4). Jediná potvrzená funkční chyba nalezená v tomto auditu.
2. **Landing pages + website builder** — MC je má na všech plánech; pro SMB častý důvod výběru.
3. **300+ integrací vs 29** — největší strukturální rozdíl. Chybí Canva, GA, SurveyMonkey, Typeform,
   Yotpo, Judge.me, QuickBooks, Wix, Square, Lightspeed.
4. **Mobilní aplikace** — MF má scaffold, MC plnohodnotné apky + SDK.
5. **Per-plan rate limiting** — plochých 100/min je pro enterprise zákazníka nepoužitelné a zároveň
   příliš volné pro free tier.

### P2 — viditelné mezery v produktu

6. Veřejná archivní stránka kampaně + forward-to-friend + permission reminder (§2.9).
7. Chybějící bloky editoru: survey/poll, payment, share, RSS items, signup form, code (§2.3).
8. Šablony: ~70 vs 260+.
9. Photo editor + AI generování grafiky.
10. Per-krok reporting automatizací.
11. Batch Delivery + per-contact STO při hromadném sendu (§2.5).
12. Campaign / template folders.
13. Batch Operations API + Account Exports API.
14. Google Analytics konektor.

### P3 — drobnosti a paritní detaily

15. Predicted age range · typy custom polí (5 vs 11) · contact rating 1–5.
16. Překlady polí formuláře · mini-kvíz v popupu · SMS age-gating.
17. Email Beamer · Import HTML from URL · Combine/Replicate Audience.
18. Postcards / direct mail · tvorba ad kreativ.
19. Live co-editing a komentáře v editoru.
20. 5. role (Manager/Author split).

### Podmíněně ověřené — pozor při tvrzení „hotovo"

- **Geo-enrichment** (`lib/geo.ts`) je bez `GEOIP_API_URL` no-op. Kód je hotový, **živě jsem ho běžet
  neviděl**. Než to prohlásíme za funkční, chce to jeden reálný běh proti nastavené službě.
- **Inbox preview** je heuristická simulace, ne Litmus.
- Testy `workflows.test.ts` (29/29 green) **maskují** cascade bug tím, že si `cascadeStep` dosazují.

---

## Zdroje (primární, Mailchimp)

- [Mailchimp Features](https://mailchimp.com/features/)
- [Mailchimp Marketing Pricing](https://mailchimp.com/pricing/marketing/)
- [Marketing API Reference](https://mailchimp.com/developer/marketing/api/)
- [Mailchimp Developer](https://mailchimp.com/developer/)
- Nápověda: [Audiences](https://mailchimp.com/help/audiences/) · [Automation](https://mailchimp.com/help/automation/) · [Emails](https://mailchimp.com/help/emails/) · [Reports](https://mailchimp.com/help/reports/) · [Edit and Design](https://mailchimp.com/help/edit-and-design/) · [Email Delivery](https://mailchimp.com/help/delivery/) · [Websites](https://mailchimp.com/help/websites/) · [Landing Pages](https://mailchimp.com/help/landing-pages/) · [Transactional](https://mailchimp.com/help/transactional/) · [Data Privacy](https://mailchimp.com/help/data-privacy/) · [Integrations](https://mailchimp.com/help/integrations/) · [Mobile](https://mailchimp.com/help/mobile/) · [Accounts](https://mailchimp.com/help/accounts/) · [Merge Tags](https://mailchimp.com/help/merge-tags/)
- [All the Segmenting Options](https://mailchimp.com/help/all-the-segmenting-options/) · [About Dynamic Content](https://mailchimp.com/help/about-dynamic-content/) · [About SMS Marketing](https://mailchimp.com/help/about-sms-marketing/)
- [Newsroom: Analytics AI + AI Segment Builder + Claude/ChatGPT app (5/2026)](https://mailchimp.com/newsroom/introducinganalyticsai/)
- [February 2026 release — data-driven ecommerce marketing](https://mailchimp.com/february-2026-release-data-driven-ecommerce-marketing/)
- [Intuit investor release — Analytics AI](https://investors.intuit.com/news-events/press-releases/detail/1313/intuit-mailchimp-launches-analytics-ai-and-expanded-data-integrations-to-give-brands-conversational-actionable-intelligence)
- SSO: [Okta Mailchimp integration](https://www.okta.com/integrations/mailchimp/) · [miniOrange Mailchimp SSO](https://www.miniorange.com/iam/integrations/mailchimp-single-sign-on-sso) — nativní SAML Mailchimp nenabízí
