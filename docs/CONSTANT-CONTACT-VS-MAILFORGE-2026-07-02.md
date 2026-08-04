# Constant Contact vs ForgeMsg — kompletní feature audit (2026-07-02)

Metodika: 5 doménových agentů ověřilo **reálnou implementaci ForgeMsg přímo v kódu** (routes + services + DB schema + cron/worker + `apps/web` UI stránky — ne TODO značky, ne dokumentace) a porovnalo se **skutečným produktovým katalogem Constant Contactu** (email + automation, contacts, SMS, social marketing/ads, landing pages, Event Marketing/RSVP, surveys, donations, coupons, ecommerce, website+logo builder, reporting, AI, integrace, účet/admin, mobilní app). Legenda: ✅ plné a zapojené · 🟡 částečné / stub / nezapojené do živé cesty · 🔴 chybí.

> **Klíčové zjištění:** Constant Contact je **SMB all-in-one nástroj pro tvorbu a hostování obsahu** (landing pages, event/RSVP stránky, website + e-shop + logo builder, hostované formuláře, mobilní app, 300+ marketplace). ForgeMsg je **hlubší messaging/data engine** (vlastní MTA, více kanálů, RFM/prediktiva, atribuce, hlubší segmentace, SSO/audit) — ale **postrádá celou „hostovanou/self-serve stránkovou" vrstvu**, na které CC stojí. Rozdíl NENÍ o síle e-mailu — v e-mailu ForgeMsg CC překonává. Rozdíl je o **věcech, které CC hostuje za tebe**: event registrace, landing pages, web/e-shop, donations, hostované formuláře, mobilní aplikace.

---

## Scoreboard (kdo vede v doméně)

| Doména                              | Vítěz                                                   | Poznámka                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Contacts, lists, segmentace         | **ForgeMsg**                                            | 8úrovňové AND/OR segmenty, engagement/RFM/prediktiva; CC jednodušší                                                       |
| Signup forms                        | ForgeMsg (data) / **CC (hosting)**                      | MF: A/B, progressive, targeting, captcha, DOI ✅; ale **hostovaná stránka formuláře chybí** (embed loader.js neobsloužen) |
| **Landing pages**                   | **Constant Contact**                                    | MF nemá landing page builder vůbec 🔴                                                                                     |
| Email editor + šablony              | ForgeMsg (engine) / **CC (šířka bloků + šablony)**      | MF silnější merge/dynamic/Liquid; CC má video/event/survey/coupon bloky + stovky šablon                                   |
| AI obsah                            | **ForgeMsg**                                            | reálné Claude API, širší (subject/body/translate/per-recipient/sequence/accessibility)                                    |
| Brand kit                           | **Constant Contact**                                    | CC skenuje web → logo/barvy; MF jen manuální guidelines + AI brand voice z textu                                          |
| Automations / autorespondery        | **ForgeMsg**                                            | víc kanálů + triggerů, run-state persistuje přes wait; resend-to-non-openers ✅                                           |
| Sending & deliverability            | **ForgeMsg**                                            | vlastní Go MTA + DKIM + DMARC + scheduler cron; CC nedává vlastní MTA                                                     |
| **Event Marketing / RSVP**          | **Constant Contact**                                    | MF nemá nativní tvorbu eventů/registrace/RSVP/prodej lístků 🔴 (jen ingestní overlay nad externí ticketing app)           |
| Surveys, polls & feedback           | **ForgeMsg** (data)                                     | ✅ vč. NPS/CSAT; ale bez hostované vyplňovací stránky                                                                     |
| Coupons                             | **ForgeMsg**                                            | unikátní kódy + store-sync (Shopify/Woo); CC má jednodušší                                                                |
| **Donations (neziskovky)**          | **Constant Contact**                                    | MF nemá donation stránky 🔴                                                                                               |
| SMS / multichannel                  | **ForgeMsg**                                            | SMS+WhatsApp+Viber+Push+Voice; CC jen SMS (US add-on)                                                                     |
| Social — organic posting            | **remíza**                                              | oba reálné (MF: FB/IG/LI/X/TikTok)                                                                                        |
| Social — paid ads                   | **Constant Contact**                                    | CC tvoří a spouští FB/IG/Google ads; MF jen audience sync + reporting 🟡                                                  |
| Ecommerce                           | **ForgeMsg**                                            | 8 platforem + CZ storefronty + feedy + AI doporučení + coupon sync                                                        |
| **Website / e-shop / logo builder** | **Constant Contact**                                    | MF nemá 🔴                                                                                                                |
| Reporting & analytics               | **ForgeMsg** (hloubka) / CC (geo/device/heatmap polish) | MF: atribuce/cohorty/prediktiva; CC: mapa + device breakdown, kde MF má mrtvý write-path                                  |
| **Integrations marketplace**        | **Constant Contact**                                    | 300+ app + Zapier; MF ~30 nativních, žádný marketplace/Zapier 🔴                                                          |
| Účet / admin                        | **ForgeMsg**                                            | SSO/SAML + audit log + 4 role + 2FA; CC bez SSO                                                                           |
| **Mobilní aplikace**                | **Constant Contact**                                    | MF nemá 🔴 (backend/web only)                                                                                             |

---

## 1. Contacts, lists & segmentace — ForgeMsg vede

**ForgeMsg ✅ (ověřeno):** kontakty plné CRUD + cursor pagination + filtry (status/list/tag/phone), batch ≤500, VIP toggle, archive, GDPR anonymize/export (`routes/v1/contacts.ts`). Statusy: `active, unsubscribed, bounced, complained, pending, non_subscribed, archived` (`db/schema/enums.ts`). Statické listy (many-to-many join + per-list opt-out) + **dynamické segmenty s rekurzivním AND/OR stromem, `negate`, hloubka až 8 úrovní** (`services/segments/query-builder.ts`), saved segmenty + live count + materializovaný `segment_members` pro entered/exited triggery. **Engagement segmentace** (opened/not_opened/clicked/not_clicked s `withinDays`), RFM, prediktivní pole. Import: 4krokový wizard CSV **i XLSX** 50 MB s progressem + Mailchimp migrace. Export CSV.

**Mezery MF:** custom-field typy jen **5** (text/number/date/select/boolean) a **validace `validateCustomFields` se na create/update kontaktu nikdy nevolá** → hodnoty uloženy bez validace (🟡). **List-growth dashboard: endpoint existuje (`/newsletter-analytics/growth`), ale nemá UI stránku** (🟡).

**Constant Contact navíc:** jednodušší, ale kompletní — a hlavně vše má hostované UI. Rozdíl je v hloubce (MF hlubší), ne pokrytí.

## 2. Signup forms — smíšené (MF data, CC hosting)

**ForgeMsg ✅ (data):** typy `inline, popup, slide, floating`; A/B varianty (hash-bucketed traffic split), conditional smart fields, progressive profiling, autofill, targeting (URL/device/trigger/frequency), **honeypot + captcha (Turnstile/reCAPTCHA v3/hCaptcha) ověřené server-side**, **double opt-in wired** (`pending` + `sendListDoiConfirmation`).

**Vážná mezera MF (🔴):** **hostovaná stránka formuláře neexistuje.** `/public/forms/:id` vrací jen JSON; `generateEmbedScript` odkazuje na `/public/forms/loader.js`, **který se nikdy neservíruje** (žádná route, žádný static soubor) → embed je fakticky rozbitý. Žádná `apps/web` veřejná form stránka. Chybí i `standalone`/landing typ formuláře.

**Constant Contact:** hostované inline/popup formuláře i **standalone lead-gen stránky**, které reálně fungují out-of-the-box.

## 3. Landing pages — Constant Contact vede (MF chybí 🔴)

**ForgeMsg: landing page builder úplně chybí.** Jediný „landing" hit (`apps/web/(public)/landing`) je **vlastní marketingový web ForgeMsg**, ne builder pro uživatele. Žádné hostované page-builder routes ani service. Nejbližší je signup-forms (embed), ne standalone hostovaná stránka.

**Constant Contact:** plnohodnotný **landing page builder** (hostované lead-gen stránky, mobilně responzivní, s formulářem/CTA). **Jedna z hlavních CC funkcí, kterou MF nemá vůbec.**

## 4. Email editor & šablony — ForgeMsg (engine) / CC (šířka)

**ForgeMsg ✅ (engine):** 11 typů bloků (`text, image, button, divider, spacer, columns, hero, social, product, footer, dynamic`) — Zod discriminated union, factory + render case pro každý (`apps/editor/src/schema/`). `product` blok je merge-tag-aware (per-recipient doporučení), `dynamic` = if/else podmíněný blok. **Personalizace/merge silná:** `{{field}}`, `{{field|default:"x"}}`, řetězené locale filtry, Liquid renderer, condition evaluator, server-side dynamic content + AI per-recipient. ~**48 vestavěných šablon** (`services/editor/templates/index.ts` + `extended.ts`, 9 kategorií) + org saved templates s DB CRUD.

**Mezery MF (bloky, které CC má):** **žádný `video`, `event`/`RSVP`, `survey`/`poll`, ani `coupon` blok** (coupon existuje jen na úrovni send-merge, ne jako editor blok). `social` blok = follow ikony, ne share. Šablon **~48 vs CC stovky**. Šablony nemají thumbnaily (`thumbnailUrl=null`). Média: `POST /media` chce **klientem dodané `storageUrl`** (žádný presigned-URL/binary upload endpoint) — knihovna eviduje metadata, upload je klientská záležitost (🟡). Inbox preview je reálný jen s **Litmus klíčem**, jinak mock (🟡).

**Constant Contact:** stovky brandových šablon, drag-drop editor s **video/event/RSVP/survey/poll/coupon bloky**, photo editor, mobilní náhled.

## 5. Brand kit — Constant Contact vede

**ForgeMsg 🟡:** **manuální** brand guidelines (tone, forbidden/required fráze, `primaryColors`, `approvedFonts`, emoji/vykřičník limity, reading level) + AI consistency check. **AI brand voice** extrahovaná z **textových vzorků nebo minulých kampaní** (ne z webu). URL scraper existuje jen pro **produktová** data (`product-scraper.ts`), ne pro brand identitu.

**Constant Contact:** **„naskenujeme tvůj web a vytáhneme logo, barvy a fonty"** — automatický brand kit z URL. **MF tohle nemá** (grep na logo/favicon/brand-extract z URL = nic).

## 6. Automations & autorespondery — ForgeMsg vede

**ForgeMsg ✅ (ověřeno wired):** engine je reálný stavový automat (`executor.ts`) s reálným cronem. **Triggery mají produkční callery** (ne jen enum): `onListSubscribe`, `onTagAdded`, `onApiEvent`, `onOrderPlaced/CheckoutStarted/AddedToCart`, `onSegmentEntered/Exited`, `onEmailLinkClick`, deal/loyalty/consent/ticket + daily date/name-day/holiday (CZ/SK) triggery přes `daily-triggers` cron. **Run-state (goal `converted`, `splitBranch`, `run.data`) persistuje přes `wait`** (`executor.ts` ukládá po každém uzlu, `resumeWorkflowRun` reloaduje). Turnkey šablony (welcome drip, abandoned-cart, onboarding, re-engagement) + registry ~24 kategorií. Reálné akce: send_email/sms/viber/whatsapp/push/voice (BullMQ fronty), add/remove_tag, update_field (vč. custom JSONB), move/remove_list, **unsubscribe (+suppression)**, assign_task, loyalty, sync_to_ad_audience, stripe_retry, start_workflow (nested), run_code.

**Mezery MF:** `cascade` krok pro push/whatsapp je no-op placeholder (samostatné nody ale fungují) (🟡). ISP hodinové limity hardcoded konstanty (🟡).

**Constant Contact:** jednodušší vizuální path builder, welcome/autoresponder série, **resend to non-openers** (viz níže), list/date triggery. Méně kanálů, méně typů akcí, žádný run_code/nested flows.

## 7. Sending, scheduling & deliverability — ForgeMsg vede

**ForgeMsg ✅:** **vlastní Go MTA** (direct-to-MX SMTP, connection pooling, `apps/engine/`), **reálný DKIM signer**, SPF/DMARC verifikace + drift monitoring + DMARC aggregate ingestion (IMAP poll). **Scheduler cron reálně funguje** — `dispatchScheduledCampaigns()` selektuje `status='scheduled' AND scheduledAt<=now` → splitter, driven `campaign-dispatch` BullMQ cronem každou minutu. Bounce handling (hard→suppress, soft→retry, 421/451→throttle backoff, block→alert), FBL processor, suppression list, blacklist monitor, IP warmup. **Resend to non-openers ✅ wired** (`auto-resend.ts`: klonuje kampaň jako scheduled child, audience `resolveNonOpeners` vylučuje boty/MPP). **Timewarp ✅** (per-contact local-time send).

**Mezery MF:** **STO (engagement send-time optimization) je postavené, ale NEnapojené do send pipeline** — `send-time-optimization.ts` volá jen query endpoint, splitter/batch-sender ho nevolá (na rozdíl od Timewarpu, který wired je) (🟡). SMPP Go gateway (`apps/sms-gateway/main.go`) je **stub** (jen tiskne startup log) — SMS reálně teče přes Bulkgate/Twilio HTTP adaptéry (🔴 pro self-hosted SMPP, ale ✅ pro reálné odesílání SMS).

**Constant Contact:** managed shared reputation, **nedává vlastní MTA ani DKIM klíče do ruky**. MF je tu technicky dál.

## 8. Event Marketing / RSVP — Constant Contact vede (MF chybí nativně 🔴)

**Toto je největší CC flagship, který ForgeMsg nemá.**

**ForgeMsg má „ticketing", ale je to něco jiného:** ingestní / marketingový **overlay nad EXTERNÍ ticketing aplikací (Tixly)**, ne nativní event management. Schema `db/schema/ticketing.ts`: `externalEvents` (zrcadlo externího eventu — `externalId`, neprodaná místa/tiery) + `eventAttendance` (`purchased|attended|waitlisted|lottery_won|refunded|cart_abandoned`). Hlavička souboru to říká doslova: _„Populated by the ingestion/sync layer from a ticketing app (e.g. Tixly); ForgeMsg owns the marketing on top."_ Route `ticketing.ts` = jen ingestní webhook (`POST /events`, `/events/batch`, `/seed-workflows`, `/recipes`) + crony (day-of / fill-the-house / discover).

**Co MF NEMÁ (a CC má):** tvorba eventu v produktu, **hostovaná veřejná registrační / RSVP stránka**, prodej lístků / checkout, správa účastníků (attendee management), event reminder jako produktová funkce, event dashboard v UI. (`routes/v1/events.ts` je nesouvisející — je to custom-event tracking pro workflow triggery.)

**Constant Contact:** vytvoříš event, dostaneš **hostovanou registrační stránku s RSVP**, výběrem lístků/poplatků, správou registrací, automatickými event e-maily. **MF by tohle musel celé postavit.**

## 9. Surveys, polls & feedback — ForgeMsg (data) ✅

**ForgeMsg ✅:** `surveys` + `surveyResponses` (single/multi/scale/text/**nps**/rating), full CRUD, results, **veřejná neautentizovaná submission** `POST /public/surveys/:id/submit`. Navíc NPS/CSAT/CES templates + `nps-report` + response-automation rules (add_tag/trigger_workflow). UI stránka `(dashboard)/surveys`.

**Mezera MF:** žádná **hostovaná vyplňovací stránka** (submission je API-only — front-end si musíš postavit sám); žádný distinktní „poll" typ (řešeno question typy) (🟡).

**Constant Contact:** hostované survey/poll stránky s vyplňováním out-of-the-box.

## 10. Coupons — ForgeMsg vede

**ForgeMsg ✅:** `couponBatches` (percent/fixed, expiry) + `couponCodes` (**unikátní kód per-org**, `assignedTo`, `redeemedAt`, `revenue`), generování až 100k, assign/redeem/stats/bulk-import, **sync-to-store** (Shopify price rule / WooCommerce). Merge do e-mailu i SMS. UI `(dashboard)/coupons`.

**Constant Contact:** má coupony, ale jednodušší (bez unikátních per-recipient kódů se store-sync na této úrovni).

## 11. Donations — Constant Contact vede (MF chybí 🔴)

**ForgeMsg:** žádný kód. `donation|donate|fundrais|nonprofit` matchne jen v .md dokumentech + industry label v benchmarks. Žádná route/schema/service/UI.

**Constant Contact:** **donation landing pages** pro neziskovky (výběr částky, opakované dary). MF nemá.

## 12. SMS & multichannel — ForgeMsg vede

**ForgeMsg ✅:** SMS (routing per země, two-way inbound, DLR webhooks, consent + compliance gate), SMS keywords (subscribe/unsub/info/reply), + **WhatsApp, Viber, Web Push/FCM, AI Voice bot** — celý multichannel stack. Reálné adaptéry Bulkgate/Twilio/Meta.

**Constant Contact:** **jen SMS/text** (US add-on). Žádný WhatsApp/Viber/Push/Voice. MF výrazně širší.

## 13. Social marketing — smíšené

**Organic posting: remíza ✅** — MF reálné API calls FB/IG/LinkedIn/X/TikTok (`services/social/publisher.ts`), OAuth connect, scheduling přes `dispatchDuePosts()`. CC srovnatelné (FB/IG/LinkedIn) + social inbox.

**Paid ads: Constant Contact vede 🟡** — CC umí **vytvořit a spustit FB/IG/Google ads** (ad creative authoring) přímo v produktu. **MF umí jen audience sync + reporting** (`ads/` = accounts, audience-sync, lookalike, reporting, sklik) — hashované custom audiences na Meta/Google/TikTok/LinkedIn/Sklik + pull metrik. **Nelze složit ani spustit reklamu z ForgeMsg.**

## 14. Ecommerce — ForgeMsg vede

**ForgeMsg ✅:** integrace Shopify/Shoptet (OAuth) + WooCommerce/BigCommerce/Magento/PrestaShop/Upgates/FastCentrik, signed webhook order ingestion + normalizery, product sync/catalog + feedy, **AI product recommendations** (alsoBought/topInCategory/personalisedFor), revenue reporting + atribuce, coupon sync-out, abandoned cart/browse.

**Constant Contact:** Shopify/WooCommerce sync, product bloky, e-commerce segmenty, revenue reporting, abandoned cart, doporučení. Solidní, ale **užší** (méně platforem, žádné CZ storefronty/feedy). MF širší.

## 15. Website / e-shop / logo builder — Constant Contact vede (MF chybí 🔴)

**ForgeMsg:** nic. Žádný website builder, online store builder, ani logo maker (grep = nula). MF se ke storefront**ům** připojuje, nehostuje je.

**Constant Contact:** **AI website builder + online store (prodej produktů) + AI logo maker**. Celá další CC vrstva, kterou MF nemá.

## 16. Reporting & analytics — ForgeMsg (hloubka) / CC (geo/device/heatmap polish)

**ForgeMsg ✅:** core metriky vč. **CTOR**, hard/soft bounce split, timeline, top links, compare; multi-touch atribuce, prediktiva (CLV/likelihood/churn), cohort/funnel, A/B + multivariate výsledky, ClickHouse rollup. **Geolokace ✅ wired** (reálný geo-IP lookup přes `GEOIP_API_URL`, `enrichEventGeo` z open/click handlerů, `/stats/geo` po zemích) — ale **country-only, no-op bez env klíče, žádná mapa**. **Scheduled emailed reports ✅ wired** (`runDueReports` reálně posílá e-mail, hourly cron). **CSV export ✅.**

**Mezery MF:** **click heatmap je jen per-link overlay, ne poziční/coordinate mapa** (🟡); screenshot vrací „not installed" bez puppeteeru. **Device / email-client breakdown 🔴 — read path existuje, ale write-path nikdy nezapíše `deviceType`/`emailClient`** (tracking ukládá jen userAgent/IP, žádný UA parser) → vždy „unknown". **PDF export 🔴** (žádný pdf generator).

**Constant Contact:** opens/clicks, **geo mapa, mobile/device open breakdown, click heat-map** — vizuálně hotové tam, kde MF má mrtvý write-path nebo jen data bez vizualizace.

## 17. AI — ForgeMsg vede

**ForgeMsg ✅:** reálné volání `api.anthropic.com` (`claude-sonnet-4-6` pro generování, `claude-haiku-4-5` pro scraper) s Redis cache + `ai_usage` tracking + per-plan rate limit. Endpointy: generate-email, subject-lines (5 scored + historická data), analyze-brand-voice, campaign-summary, translate, segment-from-description, generate-per-recipient, generate-sequence, accessibility-fix, ab-optimizer (bandit). Usage/cost dashboard.

**Constant Contact:** **AI Content Generator** (subject + body), AI website/logo builder. CC má navíc AI **vizuální** builder (web/logo), MF má hlubší **textovou** AI. V content AI je MF širší.

## 18. Integrations marketplace — Constant Contact vede (MF chybí 🔴)

**ForgeMsg:** **žádný marketplace/directory ani Zapier/Make** (grep `zapier|make.com|integromat` = nic). Nativních integrací je ale hodně: `integrations/` (allegro, calendly, erp-cz, hubspot, mallcz, packeta, payments-cz, shoptet-advanced) + salesforce, raynet, 8 ecommerce, 5 social, 5 ad platforem. Public API cesta = **OAuth2 provider** (app registration/authorize/token/introspect/revoke/scopes) + webhooky + **Resend-kompat API**. `(dashboard)/integrations` listuje jen připojené e-shopy, není to procházecí app directory.

**Constant Contact:** **300+ app marketplace + Zapier**. MF má silné nativní CZ/SK integrace, ale žádný self-serve marketplace.

## 19. Účet / admin — ForgeMsg vede

**ForgeMsg ✅:** role `owner/admin/editor/viewer` (+ platform `system_admin`), **SSO — SAML (ACS/SP metadata) + OIDC**, **2FA TOTP**, **searchable audit log**, Stripe billing (checkout/portal/webhook, plány free/starter/pro/business/enterprise), API klíče + scopes, teams + members, superadmin.

**Constant Contact:** **nemá SSO/SAML**, omezené role, ale má **mobilní app** (viz níže). MF vede na hloubce správy, CC na mobilu.

## 20. Mobilní aplikace — Constant Contact vede (MF chybí 🔴)

**ForgeMsg:** žádná (grep `react-native|expo` = nic; `apps/` = api/editor/engine/mcp-server/sms-gateway/voice-bot/web/workers — vše server/web).

**Constant Contact:** nativní **iOS/Android app** (tvorba a odesílání kampaní, kontakty, reporty z mobilu).

---

## Souhrn: kde ForgeMsg WINS (Constant Contact nemá / je slabší)

Vlastní Go MTA + DKIM/DMARC · WhatsApp · Viber · Web Push/FCM · AI Voice bot · **multivariate testing** (CC jen A/B subject) · 8úrovňové AND/OR segmenty · RFM + prediktiva (CLV/churn/likelihood) · multi-touch atribuce · cohort/funnel · engagement segmentace · run_code + nested workflows + víc kanálových akcí · Timewarp · unikátní coupon kódy + store-sync · AI product recommendations · 8 ecommerce platforem + CZ storefronty (Shoptet/Upgates/FastCentrik) + Heureka/Zboží feedy · ISDOC fakturace · SMS coupony · Sklik · SSO/SAML · searchable audit log · 2FA · MCP server · Resend-kompat API · OAuth2 provider · širší AI textový stack · scheduled emailed reports · A/B + progressive + targeting signup formuláře.

## Souhrn: kde Constant Contact WINS (ForgeMsg chybí / rozbité)

**Landing page builder** 🔴 · **Event Marketing / RSVP / registrace / prodej lístků + hostovaná event stránka** 🔴 · **Website builder + online store + AI logo maker** 🔴 · **Donation stránky (neziskovky)** 🔴 · **social ad creative authoring** (tvorba+spuštění FB/IG/Google ads) 🟡 · **300+ integrations marketplace + Zapier** 🔴 · **mobilní app** 🔴 · **hostovaná stránka signup formuláře** (MF loader.js neobsloužen) 🔴 · **brand kit skenováním webu** (logo/barvy/fonty z URL) 🔴 · **stovky brandových šablon** (MF ~48) · **editor bloky video/event/RSVP/survey/poll/coupon** 🔴 · **hostovaná survey/poll vyplňovací stránka** · **poziční click heat-map** 🟡 · **device/email-client analytics** (MF write-path mrtvý) 🔴 · **geo mapa** (MF jen country data, žádná vizualizace) · **PDF export reportů** 🔴.

## ⚠️ „Postaveno, ale nezapojeno / mrtvé" (nebezpečné — vypadá hotově)

1. **Signup form hostovaná stránka** — `loader.js` embed odkazuje na neexistující route → embed rozbitý (🔴).
2. **Custom-field validace** — `validateCustomFields` se na create/update kontaktu nikdy nevolá → hodnoty bez validace (🟡).
3. **STO (send-time optimization)** — postaveno, ale splitter/batch-sender ho nevolá; wired je jen Timewarp (🟡).
4. **Device / email-client analytics** — read path čte `deviceType`/`emailClient`, ale tracking write-path je nikdy nezapíše → vždy „unknown" (🔴).
5. **List-growth dashboard** — endpoint existuje, chybí UI stránka (🟡).
6. **Click heatmap** — jen per-link overlay, ne poziční mapa; screenshot bez puppeteeru vrací 501 (🟡).
7. **SMPP Go gateway** — `main.go` je stub; SMS reálně teče přes Bulkgate/Twilio (🔴 pro self-hosted SMPP).
8. **`cascade` push/whatsapp krok** — no-op placeholder (samostatné nody fungují) (🟡).
9. **Media upload** — `POST /media` vyžaduje klientem dodané `storageUrl`, žádný presigned/binary upload (🟡).
10. **Inbox preview** — reálný jen s Litmus klíčem, jinak mock (🟡).

---

## Bottom line

V **e-mailu, automatizacích, datech, kanálech a deliverability je ForgeMsg dál než Constant Contact** — hlubší segmentace, RFM/prediktiva/atribuce, multivariate testy, vlastní MTA, multichannel (WhatsApp/Viber/Push/Voice), SSO/audit. **Constant Contact ale vyhrává v celé „hostované self-serve vrstvě", kterou ForgeMsg nemá vůbec:** landing pages, **Event Marketing/RSVP** (CC flagship), website+e-shop+logo builder, donations, hostované formuláře a survey stránky, mobilní app, 300+ marketplace + Zapier a vizuálně dotažené reporty (geo mapa, device breakdown, heat-map).

**Pokud je cíl „reálně nahradit Constant Contact", priority (od největší mezery):**

1. **Landing page builder** (hostované stránky) — a při té příležitosti dokončit **hostovanou stránku signup formuláře** (obojí stojí na stejné „hostované page" vrstvě, která dnes úplně chybí).
2. **Event Marketing / RSVP** jako nativní produkt (tvorba eventu → hostovaná registrační/RSVP stránka → správa účastníků → event e-maily). Dnešní ticketing je jen ingestní overlay.
3. **Mobilní app** a **integrations marketplace + Zapier**.
4. Doplnit **editor bloky** (video/event/RSVP/survey/poll/coupon) + víc šablon + **brand kit z URL**.
5. Opravit **mrtvé write-path** (device/email-client analytics), **zapojit STO**, **obsloužit form loader.js**, doplnit **PDF export** a **poziční heatmap**.

CC vs MF není „kdo má lepší e-mail" (tam MF vede) — je to **„kdo za uživatele hostuje víc věcí"**, a tam CC vede o celou stránkovou vrstvu.
