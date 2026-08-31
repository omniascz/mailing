# Klaviyo vs. MailForge — detailní srovnání (2026-08-31)

> Nahrazuje `KLAVIYO-VS-MAILFORGE-2026-07-01.md`. Klaviyo se za dva měsíce posunulo
> z „e-commerce marketing automation" na **„autonomní B2C CRM"** (Composer, Customer
> Agent, Service/Helpdesk, Customer Hub, RCS, WhatsApp). Řada mezer z července je
> na naší straně zavřená, ale otevřela se nová fronta.

## Metodika

- **Klaviyo strana**: výhradně z jejich vlastních zdrojů — `klaviyo.com/platform`,
  `klaviyo.com/whats-new/all` (163 releasů 2026), `help.klaviyo.com`,
  `developers.klaviyo.com`, `klaviyo.com/pricing`. Žádná třetí strana kromě cen
  (ty Klaviyo na webu nezveřejňuje v plném rozsahu).
- **MailForge strana**: výhradně čtením kódu v tomhle repu (`file:line`), ne z TODO.md
  a ne z dřívějších auditů. Kde tvrdím „nezapojeno", je to ověřené hledáním volajícího.
- **Legenda**: ✅ parita nebo lepší · 🟡 částečné / slabší / zapojené jen zčásti ·
  🔴 chybí · ⚫ postavené, ale v produkci vypnuté

---

## 0. ⚫ Nejdůležitější zjištění: v produkci je vypnutá většina srovnávané plochy

`apps/api/src/config/env.ts:116` — `FEATURE_BEYOND_CORE: boolFlag(!isProduction)`.
V produkci je tedy **false**, a `docker-compose.prod.yml` ji nenastavuje.
`apps/api/src/index.ts:408` pak **vůbec neregistruje** 76 skupin rout:

```
survey revenue product stockAlert coupon review advancedAnalytics helpdesk
aiAgent aiRecommendations ecommerce browseAbandonment crmAccount crmPipeline
crmDeal crmReport aiSales productFeed seoSitemap blog cta crmTask crmNote
crmActivity crmSequence liveChat universalInbox loyaltyProgram loyaltyReward
loyaltyEarningRule loyaltyAnalytics loyaltyLedger calendarSync identityGraph
cdpProfile cdpEvent cdpTrait cdpActivation helpdeskRouting helpdeskAnalytics
aiSupport meeting cdpSource internalCoupons reviewsV2 seoClusters seoKeywords
seoAudit seoRankTracker socialAccount socialPost socialMention socialAnalytics
adAccount adAudienceSync adLookalike sklikLookalike adReporting adsWebhook
sklikPixel commerceProduct commerceQuote commerceInvoice stripeWebhook
commerceSubscription association gamification cannedResponse surveysNps
playbook rotation quoteTemplate extensionCard  (+ interní varianty)
```

Ve `workers` totéž: `seo-rank-poll`, `social-scheduler`, `invoice-reminder` a cron
`browse-abandonment` se v produkci nespouští (`apps/workers/src/index.ts:83-93`,
`apps/workers/src/jobs/workflow-scheduler.ts:353`).

**Důsledek pro tohle srovnání:** kupony, recenze, loyalty, CDP, helpdesk, produktový
katalog, stock alerts, browse abandonment, AI agenti a doporučování produktů —
tedy **přesně to jádro, kvůli kterému si e-shop kupuje Klaviyo** — v produkčním
buildu MailForge neexistují jako endpointy. Kód je hotový, ale nasazený produkt
je dnes „odesílací infrastruktura + kampaně + flows + segmenty". To je záměr
(viz `POZICOVANI.md`), ne bug — ale při srovnání s Klaviyo je to ta nejzásadnější
věc, kterou je potřeba říct nahlas.

Níže značím ⚫ všude, kde funkce v kódu **je**, ale v produkci se neregistruje.

---

## 1. Kanály

| Kanál | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| **E-mail** | vlastní sending infra, sdílené i dedikované IP, viditelnost warming v UI (2026-03-31), oddělené branded domény pro marketing / transakční / service (2026-05-28), self-serve dedicated click-tracking domain | vlastní **Go MTA** (`apps/engine`), DKIM podepisování, warmup enforcement přes DB čítač, dedicated IP pooly, konfigurační sady, SMTP relay :587 | ✅ MailForge má hlubší vlastnictví stacku |
| **SMS** | **jen 23 zemí**: US, CA + 19 EU (AT, BE, DK, FI, FR, DE, HU, IE, IT, LU, NL, NO, PL, PT, ES, SE, CH, UK) + AU, NZ. **ČR ani SK v seznamu nejsou.** Toll-free / short code / long code / branded ID podle země; MMS jen US, CA (TF), AU | vlastní SMPP v3.4 gateway (`apps/sms-gateway`), multi-provider routing, bez zeměpisného omezení daného vendorem | ✅ **Zásadní výhoda na CZ/SK — Klaviyo tam SMS neposílá vůbec** |
| **MMS** | US, Kanada (jen toll-free), Austrálie | 🟡 podpora existuje, ale závisí na providerovi | 🟡 |
| **RCS** | GA od 2026-02-24: ověřené business profily, rich cards, karusely, tappable buttons, RCS v Automated Conversations, video (MP4), Next Best Product v RCS | `rcs.ts` route + `rcs-sender` worker | 🟡 kanál existuje, ale bez rich cards / karuselů / verified profile flow |
| **WhatsApp** | masivní investice 2026: **vlastní WhatsApp čísla přímo v Klaviyo** (bez třetí strany, 2026-06-09), consent capture na Shopify/Woo/Magento checkoutu, Click-to-Chat, A/B testy uvnitř WA flow, WhatsApp Deliverability Hub (quality rating, policy alerts), Zendesk sync, Customer Agent na WA | `whatsapp.ts` + `whatsapp-sender` worker, Cloud API adaptér | 🟡 posílání ano; chybí vlastní číslo, consent na checkoutu, deliverability hub, A/B ve flow |
| **Mobilní push** | nativní SDK **iOS/Swift, Android/Kotlin, React Native, Flutter**; action buttons (až 3), video v pushi, iOS background processing, automatické UTM u deep linků, A/B testy pushe ve flows (GA) | serverová strana je hotová a reálná — **APNs HTTP/2 + ES256 JWT a FCM HTTP v1** (`apps/api/src/services/push/mobile-transport.ts`), `mobile-push-sender` worker. **Klientské SDK ale neexistuje** — `apps/mobile` je Expo *admin* appka pro marketéra (login API klíčem, Insights, Contacts, Campaigns), ne SDK pro zákaznickou appku | 🔴 bez klientského SDK je kanál nepoužitelný |
| **In-app messaging** | in-app formuláře v mobilní appce, šablonová knihovna (2026-08-14), flyout in-app (2026-05-07), SDK hooks (shown/dismissed/clicked), filtry podle event properties | `in-app.ts` route + `show_in_app` flow akce | ⚫🔴 bez mobilního SDK není kam doručovat |
| **Web push** | ❌ nemá | ✅ `push.ts`, web-push adaptér | ✅ MailForge navíc |
| **Viber** | ❌ nemá | ✅ 3 providery (Infobip / Rakuten / MessageBird), `viber-sender` worker | ✅ MailForge navíc |
| **Voice / AI hlasový robot** | ❌ nemá | ✅ `apps/voice-bot` (Twilio + Deepgram + ElevenLabs + Claude), `make_voice_call` flow akce | ✅ MailForge navíc |
| **Instagram / Messenger** | **Social Auto-Replies**: automatická odpověď na IG komentář/DM, která z followera udělá e-mail/SMS odběratele; Tap-to-Text opt-in z DM; Social List Growth pro WhatsApp; Instagram 1-to-Many (jeden IG účet → víc regionálních Klaviyo účtů); Social Insights Agent (AI analýza UGC) | `channels/instagram`, `channels/messenger`, `social/inbox-bridge.ts` — DM se dostanou do inboxu | 🔴 chybí celá auto-reply → list-growth smyčka |
| **Sociální obsah v e-mailu** | vkládání IG postů přímo do e-mailu, SMS a formulářů (2026-07-14) | ❌ | 🔴 |

---

## 2. Kampaně a e-mailový editor

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| Bloky editoru | text, image, button, divider, spacer, split, table (+ **čisté HTML uvnitř Table a Split buněk**, 2026-03-25), **product**, social, video | `text, image, button, divider, spacer, columns, social, video, html, table, product, rss, poll` (`apps/editor/src/blocks`) | ✅ parita, product blok doplněn |
| Universal / znovupoužitelný obsah | Universal Content Blocks — sdílené bloky, headery, footery, i ve formulářích (2026-03-31); Composer je umí referencovat promptem | `savedBlocks` + `brandKits` (`services/assets/shared.ts`), sdílení i z parent org | 🟡 existuje, ale bez propagace změny do už odeslaného/rozpracovaného obsahu a bez podpory ve formulářích |
| Složky šablon | ano, včetně vnořených a hromadného přesunu (2026-04-29) | `folders.ts` | ✅ |
| Překlady | **Smart Translations**: překlad těla i jména odesílatele, RTL, source→target páry, CSV import/export, hromadná správa locale | `i18n.ts`, `packages/i18n-cs`, `i18n-sk` — merge-tag filtry, skloňování, jmeniny | 🟡 jiná filozofie: my máme hlubokou CZ/SK gramatiku, oni široký AI překlad |
| Barcode / QR | `{% barcode %}` Code 128 v e-mailu, MMS, RCS, WhatsApp | `qr-codes.ts` | 🟡 QR ano, Code 128 barcode ne |
| AMP / countdown / connected content | ❌ AMP nemá | ✅ AMP renderer, countdown GIF, connected content | ✅ MailForge navíc |
| Pre-send kontroly | ✅ | ✅ spam / accessibility / dark-mode check, Litmus, `pre-send.ts` | ✅ MailForge lepší |
| Gradual sending | **po minutách**, dávky až 1 % za minutu (2026-07-16) | `scheduling.ts`, batch splitter | 🟡 dávkování ano, minutová granularita neověřena |
| A/B testy kampaní | subject, obsah, čas odeslání; **automatický winner při statistické významnosti**, win probability; ve flows kritérium ≥ 500 příjemců na variantu a ≥ 90 % win probability; A/B kombinovatelné s Personalized Send Time (2026-07-27); A/B ve WhatsApp flow; A/B mobilního pushe ve flows | `services/campaigns/ab-winner.ts` — dvouvýběrový test proporcí, konfigurovatelný `confidenceThreshold` (default 95 %), Bonferroni poznámka, `ab-winner` worker; multivariate testy | ✅ statistika je u nás dokonce explicitnější; 🟡 ale multivariate testy jsou schované za capability flagem |
| Klonování / omnichannel canvas | klonování single-channel kampaně do omnichannel canvasu se zachováním nastavení; follow-up zprávy s auto-generovanými engagement filtry; omnichannel auto-respondery podle otevírací doby | `campaigns.ts`, `channel-dispatch.ts`, `channel-fallback.ts`, `smart_channel` flow node | 🟡 dispatch ano, omnichannel canvas jako UI koncept ne |
| Audience optimization | **Refine** — prediktivní model odstraní před odesláním profily s vysokým rizikem odhlášení; report odstraněných profilů; guardraily proti hromadné supresi (kontrola nedávných kupujících a klikačů); doporučení k supresi neaktivních profilů | `frequency-rules.ts`, `frequency-suppressions.ts`, `list-hygiene.ts`, `holdout.ts`, `graymail.ts` | 🟡 frekvenční stropy a hygiena ano; prediktivní „nech tohohle člověka být" ne |

---

## 3. Flows / automatizace

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| **Typy triggerů** | 6: Added to List, **Added to Segment**, Metric (jakýkoli event z integrace nebo API), Date Property (i z custom objektu), **Price Drop**, **Low Inventory** | 16 hodnot enumu (`db/schema/workflows.ts:35`): `list_subscribe, tag_added, date_field, api_event, form_submit, purchase_event, manual, loyalty_points_earned, loyalty_tier_up, loyalty_reward_redeemed, name_day_today, lifecycle_stage_changed, n_days_before_holiday, segment_entered, segment_exited` | ✅ **segment_entered/exited doplněno** (červencová mezera zavřená); 🔴 price-drop a low-inventory trigger jako typ flow chybí |
| Trigger filtry | filtrují podle **dat eventu**, ne profilu; u custom objektů se vyhodnocují na každém kroku | `api_event` podmínky umí číst payload (`actions.ts:423`) | ✅ |
| Profile filters | kontrola při vstupu i před **každou** akcí; kdo neprojde, akci přeskočí, ale ve flow pokračuje | `condition` node, operátory `eq/neq/contains/not_contains/starts_with/ends_with/is_set/is_not_set/gt/gte/lt/lte` | ✅ |
| Re-entry criteria | první třídy v nastavení triggeru pro **všechny** typy: jednou / vždy / po min. době | ověřeno jen částečně | 🟡 |
| Typy akcí | e-mail, SMS, RCS, WhatsApp, push, in-app, wait, conditional split, trigger split, webhook | **30 typů** (`actions.ts:1643-1706`): `send_email, send_sms, send_whatsapp, send_push, show_in_app, make_voice_call, send_viber, unsubscribe, wait, condition, add_tag, remove_tag, update_field, move_to_list, remove_from_list, send_webhook, internal_notification, smart_channel, split, goal, cascade, send_personal_email, assign_task, start_workflow, enroll_in_loyalty, award_loyalty_points, sync_to_ad_audience, stripe_retry_charge, notify_owner, run_code, send_review_request, trigger` | ✅ **MailForge má výrazně širší paletu akcí** |
| **Flow analytika** | Flow Analytics Dashboard (2026-06-22) — srovnání kanálů, revenue a konverze period-over-period | `getWorkflowAnalytics` + `/workflows/:id/analytics` a `/node-analytics` — konverzní poměr, revenue, **revenue-per-recipient** | ✅ **červencová mezera zavřená** |
| Výkon | **Flows 2.0** (2026-08-18): přepsaný engine, **74 000 profilů/s** | BullMQ, `workflow-run-resume` cron každou minutu | 🔴 řádově jinde; naše rozlišení je minuta, ne sekunda |
| Doporučení / best practices | Composer – Flow Analyst: doporučení na základě dat ze **196 000 značek** | `workflow-templates.ts` (56 šablon), `ai/sequence-generator.ts` | 🔴 nemáme datový základ pro benchmark doporučení |
| Smart Sending / frekvenční strop | ✅ | ✅ **zapojené** — `batch-sender.ts:906` volá `/internal/frequency/check-batch`, které volá `smartCanSend`; workflow e-maily jdou přes stejný triggered batch-sender pipeline | ✅ **červencová mezera zavřená** |
| Quiet hours | ✅ | 🟡 `quiet-hours.ts` route + `isQuiet()`, ale **jediný volající je HTTP route** — do send-path se nevolá | 🟡 postaveno, nezapojeno |
| Send-time optimization | **Personalized Send Time**: per-profil okno; fixní čas nebo historické vzorce; agregovaná analytika; kombinovatelné s A/B (2026-07-27, 2026-08-27) | `send-optimization/` + `per-contact-sto.ts` + timewarp (`/internal/timewarp`); `timewarpSchedule` se v `batch-sender.ts:270` **skutečně aplikuje** | 🟡 timewarp zapojen; per-contact STO jen přes route |
| Backpopulation | ano | ❌ | 🔴 |
| Needs review / kontrola před spuštěním | „How to make sure your flow is ready to send" — vestavěné kontroly | ❌ | 🔴 |
| Sub-flows | ❌ | ✅ `start_workflow` akce | ✅ MailForge navíc |
| Vlastní kód ve flow | Advanced KDP: hosted code functions | ✅ `run_code` akce | ✅ |

---

## 4. Segmentace, profily, data platforma

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| Real-time členství | segment se přepočítá okamžitě a `Added to Segment` je nejpoužívanější vstup do flow | `refreshSegmentMembership` / `refreshAllSegments` (`services/segments/membership.ts`) volané cronem `segmentMembershipQueue` přes `/internal/segments/refresh-membership` | 🟡 **zapojeno, ale dávkově cronem, ne real-time** |
| Regex v segmentaci | ✅ (2026-01-26) — segmentace podle domény e-mailu, formátu čísla | `matchOneUrl` umí regex u formulářů; u segmentů neověřeno | 🟡 |
| Hromadné hodnoty | až **500 PSČ najednou**, multi-select lokalit | `segments.ts` | 🟡 |
| Custom objects | plnohodnotné — subscriptions, rezervace, domácnosti; auto-complete hodnot v segmentech, šablonách i flows; date-property trigger umí číst z custom objektu | ✅ `services/custom-objects` — definice + záznamy + upsert | 🟡⚫ máme model, ale bez auto-complete a bez triggeru z custom objektu; v produkci navíc vypnuto |
| Multi-email profily | jeden profil až **5 e-mailových adres** (2026-06-29) | `services/multi-email`, `contact-emails.ts` | ✅ |
| Identity graph / merge | ✅ | ✅ `identity-graph.ts`, `identity-resolution.ts`, `identity-merge` | ⚫ v produkci vypnuto |
| Consent per kanál | ✅ | ✅ `consent-graph.ts`, `consent.ts`, GDPR purposes | ✅ MailForge lepší (GDPR purpose guardrail v send-path) |
| Calculated / computed properties | ✅ | ✅ `calculated-properties.ts` | ⚫ |
| **Data warehouse import (reverse ETL)** | **Snowflake, BigQuery, Databricks, Redshift → do profilů**; mapování polí klikáním, plánované opakované synchronizace, record-level error reporty (2026-05-01), connection/command-level log | `services/warehouse-sync` je **jen export** (S3 / Snowflake / BigQuery / Redshift / webhook) | 🔴 **jednosměrné — import z DWH chybí úplně** |
| Advanced KDP | no-code transformace, custom monitory, hosted code functions, data export, group membership API, webhooky | `data-pipelines.ts`, `data-ops`, `data-quality`, `data-sets.ts`, `saved-queries.ts` | 🟡⚫ blízko, ale vypnuto v produkci |
| Geofencing | import, pauza, správa **až 5 000 geofencí** (2026-05-01); v API od revize 2026-01 | **0 výskytů v celém repu** | 🔴 |
| Reverse ETL do reklamních platforem | Export API pro Google Ads Data Manager (2026-02-05) | `ad-audience-sync`, `sync_to_ad_audience` flow akce, Sklik lookalike | ✅⚫ máme i Sklik (CZ), ale vypnuto |

---

## 5. Prediktivní analytika a AI

### 5.1 Prediktivní pole

| Pole | Klaviyo | MailForge |
| --- | --- | --- |
| Historic CLV | ✅ | ✅ `getContactPredictions().historicClv` |
| Predicted CLV | ✅ (rok dopředu) | ✅ `predictedClv` |
| Total CLV | ✅ | ✅ `totalClv` |
| Churn risk | ✅ pravděpodobnost nenákupu v příštích 90 dnech; Low <33 %, Medium 33–66 %, High >66 % | ✅ `churnRisk` (0–1) |
| Average time between orders | ✅ | ✅ `avgOrderIntervalDays` |
| **Predicted gender** | ✅ (jméno + census data) | ✅ `gender.ts` (CZ/SK gender inference) |
| Expected date of next order | ✅ (chování zákazníka + všech zákazníků) | ✅ `predictedNextOrderAt` |
| Expected purchases / AOV | ❌ neexponuje | ✅ `expectedPurchases`, `avgOrderValue` |
| **Datové požadavky** | ≥ 500 zákazníků s objednávkou, ≥ 180 dní historie, objednávky za posledních 30 dní, část zákazníků s 3+ objednávkami | heuristika bez prahu — funguje i na malém vzorku (ale je to heuristika, ne fitted model) |

**Verdikt: ✅ parita polí, červencová mezera zavřená.** Rozdíl je v kalibraci — Klaviyo
model trénuje napříč statisíci účtů, my počítáme z dat jedné organizace.

### 5.2 AI produkty

| | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| **Agentní tvorba kampaní** | **Composer** (2026-06-30, GA): z jednoho promptu vygeneruje **celou koordinovanou kampaň** — publikum, sdělení, načasování, kanály — podle historického výkonu účtu. Přírůstky: clarifying questions, campaign brief (přílohou šablony/obrázky/kupony/produkty), subject-line intelligence z vlastní historie, universal content v promptu, AI image controls, push kampaně, generování segmentů plain-English, Analytics Agent nad 365 dny dat, Flow Analyst nad 196 000 značkami | `ai-agents/campaign-builder.ts` (`buildCampaign`), `ai/sequence-generator.ts`, `ai/subject-line-scorer.ts` (na vlastních datech), NL→segment/SQL (`saved-queries`, `rag`) | 🟡 stavební kameny máme, orchestrující agent na Composer úrovni ne |
| **Autonomní zákaznický servis** | **Customer Agent**: řeší dotazy sám napříč **chat / SMS / e-mail / WhatsApp**, multilingvní, s **profile context tools** (čte historii objednávek, členství v segmentech, prediktivní analytiku) a **skills, které konají**: Order Editing (změna/zrušení s kontrolou politiky), Returns & Exchanges, Subscription Skill, Loyalty Skill, Enhanced order tracking. Guidance v přirozeném jazyce pro tón a pravidla eskalace. Profile enrichment z konverzace. Veřejné API pro embed. | `ai-agents/customer-support.ts` — RAG nad KB, vrátí `auto_reply` / `suggest_draft` / `escalate` s citacemi a confidence. **Nemá tool-use** — neumí najít objednávku, změnit ji, zpracovat vratku ani přečíst loyalty. Sám neodesílá. | 🔴⚫ **Zásadní kvalitativní rozdíl** — náš agent radí, jejich jedná. A v produkci je vypnutý. |
| Send-time AI | Personalized Send Time + analytika distribuce | `per-contact-sto.ts`, timewarp | 🟡 |
| Next Best Product | doporučení v e-mailu, **SMS, RCS, push i WhatsApp** (2026-02-04), Product Feeds in Text (2026-06-15) | `ai-recommendations.ts`, `product-recommendations.ts`, `nba-engine.ts` | 🟡⚫ engine je, cross-channel dosah ne; vypnuto |
| Obrázková AI | Image Remix, Nano Banana Pro model, AI image controls | `ai-alt-text.ts` | 🔴 |
| Sociální AI | Social Insights Agent — analýza IG UGC, top tvůrci, témata | `social/monitoring.ts` | 🟡⚫ |
| MCP / AI konektory | **Klaviyo MCP Server s 260+ nástroji** (2026-08-11) — čtení dat, tvorba segmentů, spouštění kampaní, psaní flows, správa katalogů. Plus **Claude Connector** (zero setup), **ChatGPT App**, Shopify Sidekick extension | `apps/mcp-server` — **6 nástrojů**: `send_email`, `send_sms`, `create_contact`, `query_segments`, `get_campaign`, `create_campaign` | 🔴 **6 vs. 260+** |
| Brand / voice | brand assets v Composeru | ✅ `brand-voice.ts`, `brand-guidelines.ts`, `ai/brand-consistency.ts` | ✅ |

---

## 6. Formuláře, onsite personalizace, Customer Hub

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| Typy formulářů | popup, flyout, full page, embedded, **in-app (mobil)** | popup / slide / floating / embedded / hosted stránka | 🟡 chybí in-app |
| Targeting & behavior | exit intent, time delay, scroll, URL pravidla, device, frekvence, **„nezobrazovat existujícím profilům"**, **display priority mezi formuláři**, teasery (před zobrazením i po zavření) | `signup-forms/targeting.ts` — trigger `immediate / delay / scroll / exit_intent`, URL pravidla **včetně regexu**, device, `maxImpressions`, cooldown, `already_submitted` | ✅ **červencová mezera zavřená**; 🔴 chybí teasery, priorita mezi formuláři, cílení podle segmentu/existence profilu |
| A/B formulářů | ano, s **data-science váženým rozdělením** provozu k vítězi | `listVariants` / `selectVariantForVisitor` / `trackVariantView|Submit` | 🟡 A/B ano, adaptivní vážení ne |
| Custom HTML / CSS ve formuláři | Custom HTML blok (2026-08-14), Custom CSS — line-height, letter-spacing, RTL (2026-06-29) | `styles` v configu | 🟡 |
| Progressive profiling / autofill | ❌ nemá jako produkt | ✅ `progressive.ts`, `autofill.ts` (šifrovaný contactId), honeypot bot protection | ✅ MailForge navíc |
| **Landing pages** | **hostované landing pages** (2026-02-10) — samostatné stránky pro sběr odběratelů a promo | jen hostovaná stránka jednoho formuláře (`renderHostedFormPage`) | 🔴 |
| Onsite personalizace | Onsite Personalized Banners (podle identity, segmentu, jazyka), multi-message banners, URL-targeted content bloky, scheduleable bloky, Embedded Personalized Content Blocks na Shopify storefrontu bez kódu | `web-personalization.ts` (`resolveRulesForVisitor`), `site-messages.ts` | 🟡⚫ pravidlový engine je, bez-kódová integrace do storefrontu ne |
| **Customer Hub** | celý produkt: self-service portál — historie objednávek, tracking (Wonderment, Malomo), vratky, subscriptions, loyalty (Yotpo integrace), **mini-cart s doporučeními** (2026-06-23), wishlisty/favorites, eskalace na agenta. Pro Shopify i **WooCommerce** (2026-04-02). Integrations schema pro partnerské eventy (WISMO, returns, loyalty, subscriptions) | `preference-center.ts` (preference + GDPR), `subscriptions.ts` | 🔴 **celý produkt chybí** |

---

## 7. Recenze

| Schopnost | Klaviyo Reviews (add-on od $25/měs podle objemu objednávek) | MailForge | Verdikt |
| --- | --- | --- | --- |
| Sběr | žádost e-mailem/SMS z flow | ✅ `send_review_request` flow akce → `createReviewRequest` | ✅ **červencová mezera zavřená** |
| Widgety | star rating, review summary (graf rozložení + fotky + nejčastější témata), review list, **featured review carousel**, **SEO / all-reviews stránka** | `/reviews-v2/widget/:sku` — schválené recenze + souhrn hodnocení, bez auth | 🟡 jeden widget vs. pět |
| Foto / video recenze | ✅ obojí | 🟡 neověřeno pro video | 🟡 |
| **Syndikace** | Meta storefront, Google, Shopify, Shop app; **multi-store syndikace** mezi vlastními storefronty | ❌ | 🔴 |
| Moderace / sentiment | ✅ | ✅ moderační lifecycle + sentiment | ✅ |
| Otázky zákazníků (Q&A) | ✅ v review list widgetu | ❌ | 🔴 |

⚫ Celé `reviewsV2` je v produkci vypnuté.

---

## 8. Zákaznický servis (Klaviyo Service)

Tohle je doména, kterou Klaviyo za poslední rok postavil od nuly a která v červencovém auditu ještě nebyla.

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| Helpdesk / shared inbox | ano, v **Free** plánu | ✅ `helpdesk/` — tickety, routing, analytics, canned responses, live chat, universal inbox | ✅⚫ srovnatelné, ale vypnuté |
| Ticket history view | všechny minulé tickety zákazníka s kanálem, stavem, agentem, tagy | `services/timeline` | 🟡 |
| Suggested responses | z minulých ticketů | `ai-support/note-to-message.ts`, `summarize.ts`, `tone-adjust.ts` | 🟡 |
| Predictive Insights panel | CLV, churn risk, loyalty přímo v ticketu | ❌ | 🔴 |
| Coupon assignment v ticketu | ✅ (2026-02-20) | ❌ | 🔴 |
| Third-party helpdesk handoff | předání threadu e-mailem bez ztráty kontextu | ❌ | 🔴 |
| Note tagging kolegů | ✅ | 🟡 | 🟡 |
| Integrace | Skio (subscriptions přímo v ticketu), Zendesk (WhatsApp sync) | ❌ | 🔴 |
| Automatické crawlování webu | web se re-crawluje sám, aby agent zůstal aktuální | RAG indexace ručně | 🟡 |

---

## 9. Reporting a analytika

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| Custom report builder | Advanced Report Builder — read-only přístup, multi-value filtry, klonování reportů | ✅ `services/report-builder` — metriky + dimenze, uložené reporty, `runSavedReport` | 🟡 **mezera zavřená**, ale dimenze jsou jen `none / day / week / month / campaign` |
| Scheduled report e-maily | ✅ | ✅ `scheduledReportsQueue` cron `5 * * * *` → `/internal/scheduled-reports/run-due` | ✅ **červencová mezera zavřená** |
| Dashboardy | vestavěné + hospitality pre-built dashboardy; Billing Analytics Dashboard (per-account breakdown); CLV dashboard; Category Analysis; Product Analysis (oddělené filtry od 2026-08-27); Catalog Insights | `analytics.ts`, `advanced-analytics.ts`, `cohort-analytics.ts`, `currency-analytics.ts`, `newsletter-analytics.ts`, `revenue.ts` | 🟡 API-first, bez skládaných dashboardů |
| **Benchmarky** | **peer group = 100 firem podobných odvětvím, velikostí, průměrnou hodnotou položky, obratem, růstem a charakterem kampaní**; percentily 25/50/75; hodnocení Poor / Fair / Good / Excellent; aktualizace 10. každého měsíce | `services/benchmarks/index.ts` — **hardcoded pole 11 odvětví** s fixními hodnotami z veřejných reportů Mailchimp/Omnisend 2025 | 🔴 **statické konstanty vs. živý peer benchmark** |
| Deliverability hub | account-level: pozitivní/negativní engagement, objem, **bounce details s důvody**; per-kampaň breakdown podle **inbox providera, domény, země, e-mailového klienta**; SMS deliverability hub; WhatsApp deliverability hub | `deliverability/` — health-score, blacklist-monitor, dmarc-digest, dns-health, inbox-placement-sim, seed-test, reputation-badge, bot-detection, graymail, anomaly-detector; `dedicated-ips.ts` (13 endpointů), `isp-feedback.ts` (7), `seed-tests.ts` (7) | ✅ **MailForge má bohatší nástrojovou sadu** (my vlastníme MTA, oni ne) |
| Atribuce | conversion metric výběr | ✅ `attribution.ts`, `cross-channel-attribution.ts`, 5 modelů, `revenue-attribution` | ✅ MailForge lepší |
| RFM | ✅ | ✅ `rfm.ts` | ✅ |
| Funnel reporting | ✅ | ✅ `services/funnel` | ✅ |
| Portfolio / multi-account | omnichannel kampaně jako seskupené řádky v Portfolio reportingu; Billing Analytics per account | `cross-account.ts`, `partner.ts` | 🟡 |
| Coupon usage tracking | metrika „Coupon Used" pro retargeting | `coupons` `redeem()` + `batchStats` | ✅⚫ |

---

## 10. E-commerce

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| **Checkout Started event** | Klaviyo flow #1 (abandoned checkout) | `onCheckoutStarted()` existuje (`workflows/triggers.ts:235`) — ale **jediné výskyty v repu jsou definice a test**. Shopify integrace (`integrations/shopify/index.ts`, 90 řádků) má jen OAuth + fetch produktů/zákazníků/objednávek, **žádné webhooky** | 🔴 **funkce existuje, nikdo ji nevolá — abandoned checkout reálně nefunguje** |
| Order Placed / Added to Cart | ✅ | `onOrderPlaced` (spouští i `purchase_event` flows), `onAddedToCart` | 🟡 stejný problém s volajícím |
| **Generování kuponů do storu** | Shopify coupons, **kombinovatelné s jinými slevami** (2026-05-06) | ✅ `coupons/store-pure.ts` + `store-sync.ts` — Shopify **price rules + batch discount codes** (limit 100/dávka), WooCommerce coupons; volané z `coupons.ts:107` | ✅ **červencová mezera zavřená** |
| Kupony do e-mailu | ✅ | ✅ `resolveEmailCouponTags` volané v `batch-sender.ts:430-432` pro subject i tělo | ✅ **zapojeno** |
| Back in stock | flow trigger **Low Inventory**; Back-in-Stock formuláře i pro WhatsApp consent | `back-in-stock/index.ts` — `notifyRestock` volané **jen** z `stock-alerts.ts` route | 🔴 **žádný cron, jen ruční HTTP** |
| Price drop | plnohodnotný **flow trigger**; Favorites → price-drop a low-stock flows (2026-04-02) | `price-drop/index.ts` — `notifyPriceChange` volané **jen** z `stock-alerts.ts` | 🔴 **žádný cron** |
| Browse abandonment | ✅ | ✅ cron `*/15 * * * *` → `/internal/browse-abandonment/tick` | ✅⚫ zapojeno, ale gated `FEATURE_BEYOND_CORE` → v produkci neběží |
| Katalog | auto-sync z integrací, custom katalog, Wix Catalogs V3, lokalizované produktové bloky pro Shopify Markets (jazyk, měna, URL, market) | `product-catalog/feed-adapters.ts` — **Heureka, Zboží.cz, Google Shopping, custom XML**; `feed-ingestion.ts` + `listDueFeeds` | 🟡⚫ jiné těžiště (CZ feedy vs. storefront sync); v produkci vypnuto |
| Favorites / wishlist | import ze Swym, Wishlist King, CSV; trigger flows z favorites | ❌ | 🔴 |
| **Integrace** | **350+** v katalogu; Shopify, WooCommerce, Magento 2, BigCommerce, Wix, Salesforce (multi-object, OAuth 2.0), Toast, Cloudbeds, Guesty, Mews, Olo, Punchh, Thanx, Yotpo, Skio, Canva, Figma… | 11 hlubokých (`shopify, woocommerce, bigcommerce, shoptet, upgates, fastcentrik, hubspot, salesforce, raynet, calendly, sklik`) + katalog 31 položek + CZ specifika (Comgate, GoPay, Packeta, Pohoda, FlexiBee) | 🔴 **350+ vs. ~11 hlubokých**; ✅ ale CZ stack (Shoptet, Upgates, FastCentrik, Heureka, Raynet, Sklik, ISDOC) Klaviyo nemá vůbec |
| Hospitality / restaurace | celá vertikála: reservation objects (Cloudbeds/Guesty/Mews), Toast menu data + Prepared Order event, room-night metriky, pre-built dashboardy | `meetings.ts`, `ticketing`, `calendar.ts` | 🔴 |

---

## 11. Platforma, API, vývojáři

| Schopnost | Klaviyo | MailForge | Verdikt |
| --- | --- | --- | --- |
| **API versioning** | **datové revize** (`2026-01-15`, `2026-04-15`, `2026-07-15`) s deprecation policy; nové revize přinášejí nové zdroje (geofencing, custom objects, drag-and-drop templates, two-way conversations, Customer Agent) | URL path `/api/v1/` — **žádný revision header** | 🔴 |
| Public/private klíče | `/api` s private key, **`/client` s public company ID** pro prohlížeč, OAuth pro tech partnery (lepší rate limity) | ✅ `fm_pub_` public klíč ve `web-sdk`; `fm_live_`/`fm_test_` jen server-side; `oauth.ts` | ✅ **červencový leak privátního klíče opraven** |
| Rate limiting | per-account, **fixed-window se dvěma okny — burst (krátké) a steady (dlouhé)**; OAuth partneři mají vyšší limity | `@fastify/rate-limit` s **Redis storem** (sdílený čítač napříč instancemi), klíč = `x-api-key` jinak IP, `/api/v1/internal/*` vyjmuté, per-route limity v `auth.ts` (register 5/h, login 10/15 min, forgot-password 3/h). Ale hlavní okno je **jedno ploché 100/min pro všechny** (`plugins/rate-limit.ts:7`) | 🟡 mechanika je solidní, chybí **burst/steady dvojité okno a odstupňování podle plánu** |
| SDK | server SDK + **mobilní SDK pro iOS, Android, React Native, Flutter** | `packages/sdk` (TS), `sdk-python`, `next-sdk`, `web-sdk`, `react-email-adapter`, `zapier-app` | 🟡 širší server-side, nulové mobilní |
| MCP | 260+ nástrojů | 6 nástrojů | 🔴 |
| SSO | SAML | ✅ **SAML + OIDC** (`sso.ts`), Social Sign-On má i Klaviyo (Google) | ✅ |
| Role a oprávnění | custom user roles s novými permission sety (cross-account cloning, Helpdesk, Customer Agent) | ✅ RBAC owner/admin/editor/viewer, `field-permissions.ts`, `teams.ts` | ✅ |
| Activity log | ✅ (2026-03-27) | ✅ `audit-log.ts` | ✅ |
| API key disablement | zakázat/povolit bez smazání (2026-06-05) | 🟡 | 🟡 |
| Sandboxy | „test account" se **účtuje jako ostrý** | ✅ izolované sandboxy (`sandboxes.ts`) + live/test klíče | ✅ MailForge lepší |
| Webhooky | ✅ | ✅ 50/org, replay-safe podpis, SSRF guard v `lookup` callbacku | ✅ |
| White-label / partner | ❌ | ✅ `partner.ts`, provisioning | ✅ MailForge navíc |
| HIPAA / rezidence dat | EU data residency | ✅ `hipaa.ts`, `data-residency.ts`, EU compute (Hetzner DE/FI) | ✅ |

---

## 12. Ceny

| | Klaviyo | MailForge |
| --- | --- | --- |
| Free | 250 aktivních profilů, 500 e-mailů/měs, $5 mobilních zpráv, **Customer Hub i Helpdesk v základu**, 10 000 Composer creditů, e-mailová podpora jen 60 dní | — |
| Placené moduly | Marketing · Data + Analytics · Service · Composer · Customer Agent · Professional Services · Enterprise (Service/Composer/Customer Agent aktuálně −30 %) | — |
| E-mail plán | od ~$20/měs; ~$30 při 1 000 kontaktech, $45 při 1 500, ~$720 při 50 000. **Účtuje se podle aktivních profilů** (změna z 02/2025), ne podle odeslaných | — |
| Email + SMS | od $35/měs (251–500 profilů) včetně 1 250 SMS/MMS creditů | — |
| Reviews | add-on od $25/měs podle objemu objednávek | — |

Klaviyo tedy **modularizoval ceník na 5+ produktů**. Kdo chce Composer + Customer Agent
+ Reviews + Advanced KDP, platí čtyři účty. To je pro CZ/SK SMB cenově mimo hru —
a je to naše hlavní obchodní páka.

---

## 13. Kde MailForge Klaviyo překonává

1. **SMS na CZ/SK.** Klaviyo tam SMS neposílá — Česko ani Slovensko nejsou v jeho seznamu 23 zemí. Pro cílový trh je to diskvalifikace konkurenta, ne detail.
2. **Vlastní MTA (Go engine).** Vlastníme doručování, warmup enforcement, dedicated IP pooly, konfigurační sady, SMTP relay. Klaviyo je pro klienta černá skříňka.
3. **Kanály, které Klaviyo nemá vůbec:** Viber (3 providery), AI hlasový robot, Web Push.
4. **Nativní loyalty.** Klaviyo loyalty **nemá** — integruje LoyaltyLion, Smile.io, Yotpo, Punchh, Thanx. My máme vlastní body, tiery, odměny, ledger a tři flow triggery + dvě flow akce.
5. **CZ/SK lokalizace na úrovni jazyka.** Skloňování (7 pádů), vokativ, gender inference, jmeniny, svátky, Shoptet/Upgates/FastCentrik, Heureka/Zboží feedy, ISDOC/SPAYD faktury, Seznam.cz reputace.
6. **Šířka flow akcí.** 30 typů proti Klaviyo ~10 — včetně `run_code`, `assign_task`, `stripe_retry_charge`, `sync_to_ad_audience`, `start_workflow` (sub-flows), `make_voice_call`.
7. **Pre-send kontroly** (spam / accessibility / dark mode / Litmus) a **AMP, countdown GIF, connected content**.
8. **Izolované sandboxy + live/test klíče.** Klaviyo test account se účtuje jako ostrý.
9. **GDPR guardrail v send-path** — processing purpose se kontroluje před odesláním dávky, ne jen v UI.
10. **SSO SAML + OIDC**, white-label partner provisioning, self-serve dedicated IP.

---

## 14. Co se od 1. 7. 2026 zavřelo

Ověřeno v kódu, ne z TODO.md:

| Mezera z 1. 7. | Stav dnes |
| --- | --- |
| Trigger „vstup do segmentu" | ✅ `segment_entered` / `segment_exited` + cron `segmentMembershipQueue` |
| Flow analytika / revenue-per-recipient | ✅ `getWorkflowAnalytics` + `/node-analytics` |
| Scheduled report e-maily nefungují | ✅ cron `5 * * * *` |
| Custom report builder | ✅ `services/report-builder` |
| Generování kuponů do storu | ✅ Shopify price rules + Woo coupons |
| Injekce kuponů do sendu | ✅ zapojeno v `batch-sender.ts:430` |
| Reviews request → display | ✅ `send_review_request` flow akce + veřejný widget |
| Forms targeting engine | ✅ exit intent / delay / scroll / URL regex / device / frekvence |
| `web-sdk` leakoval privátní klíč | ✅ `fm_pub_` public key model |
| Produktový blok v editoru | ✅ |
| CLV historic / predicted / total split | ✅ |
| Smart Sending nezapojený | ✅ zapojen přes `/internal/frequency/check-batch` |
| Browse abandonment bez cronu | ✅ cron 15 min (ale ⚫ za flagem) |
| Native mobile push transport | ✅ APNs ES256 + FCM v1 |

## 15. Co zůstává otevřené — prioritizovaně

**P0 — brání prodeji e-shopu:**
1. ⚫ **Zapnout `FEATURE_BEYOND_CORE` v produkci**, nebo explicitně rozhodnout, že kupony/recenze/loyalty/CDP/helpdesk nejsou součást produktu. Dnes je stav nejednoznačný.
2. 🔴 **`onCheckoutStarted` nemá volajícího** a Shopify integrace nemá webhooky. Abandoned-checkout flow — Klaviyo flow č. 1 — reálně nefunguje.
3. 🔴 **Price-drop a back-in-stock bez cronu.** Notifikace odejde jen když někdo ručně zavolá HTTP.

**P1 — funkční mezery s jasným zadáním:**
4. 🔴 Klientské **mobilní SDK** (iOS/Android/RN). Server je hotový, kanál je bez něj mrtvý.
5. 🔴 **Data warehouse import (reverse ETL)** — dnes umíme jen export.
6. 🔴 **Peer benchmarky** místo 11 hardcoded konstant z cizích reportů.
7. 🟡 **Quiet hours zapojit do send-path** (dnes jen HTTP route).
8. 🔴 **Rozšířit MCP server** ze 6 nástrojů — je to nejlevnější způsob, jak dohnat „AI-native" pozici.

**P2 — konkurenční plocha:**
9. 🔴 Customer Hub (self-service portál).
10. 🔴 Hostované landing pages.
11. 🔴 Customer Agent s tool-use (lookup a změna objednávky, vratky, subscriptions, loyalty).
12. 🔴 Social auto-replies (IG DM → odběratel).
13. 🔴 Geofencing.
14. 🔴 Datové revize API; 🟡 burst/steady rate limity odstupňované podle plánu.
15. 🔴 Syndikace recenzí, Q&A, carousel/SEO widgety.

---

## Bottom line

**Infrastrukturně jsme nad Klaviyo** — vlastní MTA, deliverability nástroje, sandboxy,
kanály navíc, širší flow akce, nativní loyalty, GDPR guardrail v send-path. **Na CZ/SK
trhu je Klaviyo navíc bezzubé**: neposílá tam SMS a nemá jedinou lokální integraci.

Kde reálně prohráváme, je **e-commerce lifecycle jádro a nová servisní/AI vrstva**:
abandoned checkout nemá volajícího, stock/price flows nemají cron, mobilní kanál nemá
klienta, benchmarky jsou konstanty, MCP má 6 nástrojů proti 260 a celý Customer Hub
+ autonomní Customer Agent nemáme.

A nad tím vším stojí jedna věc, která hodnotu srovnání mění: **76 skupin rout je
v produkci vypnutých**. Dokud se to nerozhodne, je „co MailForge umí" jiná množina
podle toho, jestli se ptáme na repozitář, nebo na nasazený produkt.
