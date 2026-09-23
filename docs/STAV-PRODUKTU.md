# Stav produktu

_Měřeno 21. 9. 2026 proti masteru `c0d3bdf`. Popisuje, co produkt umí — ne co je
naprogramováno. U každého tvrzení je doklad: test, doložený běh, nebo
soubor:řádek. Kde doklad chybí, je napsáno „neověřeno"._

**Pravidlo, podle kterého je dokument psaný:** funkce „funguje" jen tehdy, když
existuje cesta, po které ji zákazník spustí, a ta doběhne. Kód bez volajícího
nefunguje. Funkce za vypnutou skupinou nefunguje, dokud se skupina nezapne.
Funkce, která čeká na událost, kterou nikdo negeneruje, nefunguje bez vlastní
integrace zákazníka.

---

## 1. Co produkt umí dnes

Bez zapnutí jediné skupiny je registrováno **901 adres a 1125 operací**
(změřeno dvakrát: `buildApp()` + `printRoutes`, jednou s
`FEATURE_BEYOND_CORE=false`, jednou `=true` → 1243 / 1562, rozdíl 342 / 437).
To je „jádro" — e-mailová platforma níže. Tahle čísla hlídá test, viz blok
na konci dokumentu.

Vše v této části má obrazovku v administraci nebo veřejné API a doklad, že
doběhne.

| Co                                                          | Jak to zákazník spustí                               | Doklad                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mailové kampaně — tvorba, plánování, odeslání             | `/campaigns` v administraci                          | `apps/web/src/app/(dashboard)/campaigns`; běh celé cesty až do MTA fronty: `apps/workers/src/integration/campaign-content-shape.integration.test.ts`            |
| Vizuální editor a šablony e-mailů                           | `/templates`, editor bloků                           | `apps/api/src/services/editor/templates` (91 vestavěných), render doložen `apps/editor/src/render` (284 jednotkových testů)                                     |
| A/B testy                                                   | `/ab-tests`                                          | `apps/workers/src/integration/ab-two-phase.integration.test.ts`, `ab-always-closes`                                                                             |
| Transakční pošta                                            | API `/api/v1/emails`                                 | `apps/api/src/integration/transactional-dkim.integration.test.ts`                                                                                               |
| Vlastní odesílací engine, DKIM, zahřívání IP, reputace      | `/domains`, `/settings`                              | `dkim-rotation`, `dkim-encryption`, `ip-reputation`, `warmup-claim` v `apps/api/src/integration/`                                                               |
| Odhlášení, stížnosti, potlačené adresy                      | `/suppressions`, odkaz v patičce                     | `unsubscribe.integration.test.ts`, `unsubscribe-callers.integration.test.ts`                                                                                    |
| Kontakty, segmenty, vlastní pole, import, sloučení duplicit | `/contacts`, `/segments`, `/custom-fields`           | obrazovky v `apps/web/src/app/(dashboard)/`; org-scope doložen `public-write-tenant-scope.integration.test.ts`                                                  |
| Souhlasy podle GDPR účelů, frekvenční stropy, tiché hodiny  | `/settings`, `/frequency-rules`, `/quiet-hours`      | `consent-guardrail.integration.test.ts`, `batch-sender-quiet-hours`, `batch-sender-consent`                                                                     |
| Workflow automatizace — plátno, větvení, čekání             | `/workflows`                                         | `workflow-graph-checks`, `workflow-editor-branches`, `workflow-cycle-guard`                                                                                     |
| Galerie flow šablon: 28 publikovaných, z toho 8 českých     | `/workflows` → fork šablony                          | měřeno během: 93 šablon celkem, 28 publikovaných, 65 skrytých, 8 s `locale=cs`                                                                                  |
| E-maily v šablonách flow se renderují                       | součást forku                                        | `apps/workers/src/integration/workflow-template-body.integration.test.ts`; 28 z 29 použitých e-mailů se vyrenderuje, `ecom-002` ne                              |
| SMS — odchozí i příchozí (Twilio, BulkGate)                 | `/campaigns` (typ SMS), API `/api/v1/messaging/send` | `apps/api/src/services/sms/routing.ts`; příjem včetně STOP/START a dohledání organizace podle čísla: `apps/api/src/routes/v1/sms.ts`, `services/sms/inbound.ts` |
| Analytika a reporty                                         | `/reports`                                           | obrazovky v `apps/web`; `/api/v1/analytics/cohorts` měřeno živě → 200                                                                                           |
| Veřejné REST API, webhooky, SDK (JS, Next, Python)          | API klíč v `/settings`                               | `packages/{sdk,web-sdk,next-sdk,sdk-python}`; `webhook-deliver.integration.test.ts`                                                                             |
| Vlastní události z webu nebo e-shopu                        | `POST /api/v1/events`, web SDK                       | `apps/api/src/routes/v1/events.ts`; `packages/web-sdk/src` (`track`)                                                                                            |

**Pozn. k SMS:** vlastní SMPP brána neexistuje. `apps/sms-gateway/main.go` má sedm
řádků a jen vypíše hlášku; odesílání jde přes Twilio nebo BulkGate.

**Pozn. k důkazní základně:** prohlížečem je ověřena jen přihlašovací cesta
(`apps/web/e2e/`, 5 testů: landing, ceník, login, dashboard, obnova hesla).
Obrazovky výše jsou doložené tím, že existují a volají doložené API — ne
proklikaným během.

### Co dnes vrací chybu serveru

Seznam vede repozitář sám: `apps/api/src/integration/route-smoke/known-failures.ts`
(`MAX_KNOWN_5XX = 6`), a route-smoke test shodí build, jakmile některá položka
začne procházet. Všech šest změřeno živě proti reálné databázi (`app.inject`),
s přihlášenou relací i bez ní:

| Endpoint                               | s relací | bez relace | Co padá                                                                                                                          |
| -------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/external-feeds`               | 500      | 401        | `syntax error at or near "null"` — `isNull(externalFeeds['deletedAt'])`, sloupec neexistuje (`services/external-feeds/index.ts`) |
| `/api/v1/analytics/cohort`             | 500      | 401        | `rawCohorts.rows is not iterable` — postgres-js vrací pole bez `.rows` (`services/analytics/cohort.ts`)                          |
| `/api/v1/helpdesk/analytics`           | 500      | 401        | `helpdeskTickets.as is not a function` (`services/helpdesk/analytics.ts`); za skupinou `helpdesk-analytics`                      |
| `/api/v1/analytics/compare`            | 500      | **500**    | chybějící querystring spadne dřív, než se odpoví 401                                                                             |
| `/api/v1/integrations/allegro/connect` | 500      | 401        | `ALLEGRO_CLIENT_ID not configured` — konfigurace, ne kód (`routes/v1/integrations/allegro.ts`)                                   |
| `/api/v1/phone/softphone/ws`           | 500      | **500**    | websocketová routa; přes HTTP není socket. Nemá `app.authenticate` v řetězci hooků                                               |

Pět z šesti je v jádru, šestá (analytika helpdesku) za skupinou. Dvě odpovídají
500 i nepřihlášenému.

Pozor na záměnu: `/api/v1/analytics/**cohorts**` (množné číslo) je jiný
endpoint, ten byl opraven a měřeno vrací 200
(`apps/api/src/integration/beyond-core-5xx.integration.test.ts`). Rozbitý je
`/api/v1/analytics/**cohort**`.

---

## 2. Co je postavené, ale nedosažitelné

Toto je největší část produktu.

### Plocha za přepínači

76 funkčních skupin (`packages/shared/src/beyond-core/index.ts`, `BEYOND_CORE_GROUPS`), **342 cest
a 437 operací** (doloženo zeleným během
`apps/api/src/integration/beyond-core-groups.integration.test.ts`, `BEYOND_CORE_SURFACE`).
Výchozí stav je nula zapnutých skupin: `registerBeyondCore` plugin neregistruje,
dokud skupina není vyjmenovaná v `BEYOND_CORE_GROUPS`
(`apps/api/src/index.ts`, `registerBeyondCore`), v produkci je `FEATURE_BEYOND_CORE` odmítnuto
(`packages/shared/src/beyond-core/index.ts`, `resolveBeyondCoreGroups`) a `docker-compose.prod.yml`
předává proměnnou bez defaultu. Zda operátor v ostrém provozu něco zapnul:
**neověřeno** — hodnota není v repozitáři.

Z té plochy je 186 čtecích adres. Podle řetězce hooků jich **168** vyžaduje
`app.authenticate` a **18** ne — OAuth callbacky (social, ads, Shopify,
Shoptet), veřejná nabídka, náhled a veřejný článek blogu, hostovaný dotazník,
chatový token, `sitemap.xml` a `robots.txt`, Sklik pixel, stránka schůzky a
veřejné recenze. Část z těch 18 odmítá až v handleru (např.
`routes/v1/blog.ts`, náhled článku → 400/401), což řetězec hooků nevidí; přesné
rozdělení „veřejné záměrně" proti „odmítne později" je **neověřeno**.

Dřívější tvrzení, že z té čtecí plochy „ani jedna nespadne", **neplatí**:
analytika helpdesku je jednou z těch 186 a vrací 500.

Zapnout jde 75 skupin ze 76 — blokovaná je jediná (`ads-webhook`, část 5).

### Schopnosti bez cesty od zákazníka

Měřeno greppem cest `/api/v1/...` v `apps/web/src`, `apps/workers/src`,
`packages/*` a `scripts/`: ze 76 skupin má volajícího **14**, bez volajícího je
**62**; po odečtení tří spouštěných zvenčí (`ads-webhook`, `stripe-webhook`,
`sklik-pixel`) a jedné čistě vnitřní (`internal-coupons`) zbývá **58
zákaznických schopností, ke kterým nevede žádná cesta**.

Dřívější číslo „36 případů postavené a nedosažitelné" se touto metodou
nereprodukuje a je příliš nízké.

Bez jediné obrazovky v administraci (0 zásahů na daný prefix v `apps/web/src`):

| Oblast                                                            | Kde je API                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| CRM — firmy, pipeline, obchodní případy, úkoly, sekvence, reporty | `apps/api/src/routes/v1/crm/` (11 modulů, 74 endpointů)      |
| Obchodní dokumenty — nabídky, faktury, předplatná, katalog        | `apps/api/src/routes/v1/commerce/`                           |
| SEO — audit, klastry, klíčová slova, pozice, mapa webu            | `apps/api/src/routes/v1/seo/`                                |
| Správa sociálních sítí                                            | `apps/api/src/routes/v1/social/`                             |
| Reklamní účty a publika                                           | `apps/api/src/routes/v1/ads/`                                |
| Zákaznická datová platforma (CDP)                                 | `apps/api/src/routes/v1/cdp/`                                |
| Věrnostní pravidla, odměny, ledger, analytika                     | `apps/api/src/routes/v1/loyalty/earning-rules.ts` a sousední |

Věrnostní program má výjimku: obrazovka `/loyalty` existuje, ale je to read-only
výpis programů a v prázdném stavu sama říká „Create a program via the API"
(`apps/web/src/app/(dashboard)/loyalty/page.tsx`).

Jednotlivé endpointy bez volajícího kdekoli v repozitáři:

- **Přidělování kupónů po dávkách** — `POST /api/v1/internal/coupons/allocate-batch`
  (`apps/api/src/routes/v1/internal/coupons.ts`). Jeho vlastní docstring tvrdí,
  že ho volá batch-sender; ten místo toho importuje funkci přímo
  (`apps/workers/src/jobs/batch-sender.ts`, `resolveEmailCouponTags`).
- **Doporučovací engine** — `POST /api/v1/ai/recommend`
  (`apps/api/src/routes/v1/ai-recommendations.ts`) a
  `GET /api/v1/products/recommendations`
  (`apps/api/src/routes/v1/product-recommendations.ts`). Ani jeden nemá
  volajícího v administraci ani v SDK.

### Funkce s plánovačem, ale bez obrazovky pro nastavení

Cron existuje a volá vnitřní routu; nastavit je nejde odnikud:

| Funkce                          | Cron                                            | Rozvrh                                                                                  |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sledování opuštěného prohlížení | `apps/workers/src/jobs/workflow-scheduler.ts`   | `*/15 * * * *`, jen při zapnuté skupině `browse-abandonment` (`browseAbandonmentQueue`) |
| Rozesílání příspěvků na sítě    | `apps/workers/src/jobs/social-scheduler.ts`     | `* * * * *`, skupina `internal-social`                                                  |
| Upomínky faktur                 | `apps/workers/src/jobs/invoice-reminder.ts`     | `0 8 * * *`, skupina `internal-commerce`                                                |
| Generování opakovaných plateb   | `apps/workers/src/jobs/subscription-billing.ts` | `*/5 * * * *`, bez podmínky                                                             |
| Měření pozic ve vyhledávání     | `apps/workers/src/jobs/seo-rank-poll.ts`        | `0 6 * * *`, skupina `internal-seo-rank-poll`                                           |

### Kanály, které nejsou dokončené

- **WhatsApp** — odchozí funguje (`apps/workers/src/jobs/whatsapp-sender.ts`,
  kredenciály jen globální). Příjem ne: routa vrací 404, dokud není zapnutý
  vlastní přepínač a nastavený app secret
  (`apps/api/src/routes/v1/whatsapp.ts`), a i pak přiřazuje zprávy
  natvrdo do `DEFAULT_ORG_ID` (tamtéž; totéž `routes/v1/sms.ts`, WhatsApp inbound handler).
- **Viber** — odchozí jde jen přímým voláním API
  (`apps/api/src/routes/v1/viber.ts`). Příchozí zpráva se zahodí: doslova
  `void inbound;` (`persistDlr`). Kampaňový kanál to není —
  `apps/api/src/services/campaigns/channel-dispatch.ts` pouští jen
  sms/whatsapp/push.
- **Hlasový robot** — funguje přes API (`apps/api/src/routes/v1/voice.ts`,
  `POST /api/v1/voice/calls/initiate`), kampaňový kanál to není.
- **Mobilní notifikace** — klíče k Apple a Google jsou jen globální v prostředí
  (`apps/api/src/services/push/mobile-transport.ts`); per-zákazníka
  je v databázi jen web-push VAPID (`apps/api/src/db/schema/push.ts`). Do
  aplikace zákazníka tedy doručit nelze.

### Další měřené mezery

- **DMARC reporty jen pro jednu organizaci.** Jediná automatická cesta je IMAP
  poller, který každý report podává pod `DMARC_IMAP_ORG_ID`, a bez něj report
  zahodí (`apps/workers/src/jobs/dmarc-imap-poll.ts`). Schránka je
  jedna platformní adresa sdílená všemi zákazníky
  (`apps/api/src/config/env.ts`).
- **E-shopové konektory nemají připojovací obrazovku.** Stránka `/integrations`
  jen vypíše URL jako text (`apps/web/src/app/(dashboard)/integrations/page.tsx`)
  a callback přesměruje na `/settings/integrations/ecommerce/:id`
  (`apps/api/src/routes/v1/ecommerce-integrations.ts`), která v `apps/web`
  neexistuje.

---

## 3. Co potřebuje vlastní integraci zákazníka

**Co zákazník dostane po napojení e-shopu (Shoptet, Upgates, FastCentrik,
Shopify):** objednávky. Webhook nebo synchronizace volá `ingestOrder`
(`apps/api/src/integrations/shoptet/index.ts`, `upgates/index.ts`,
`fastcentrik/index.ts`), ta spustí `onOrderPlaced`
(`apps/api/src/services/ecommerce/index.ts`), což je spouštěč
`purchase_event` — tedy **po-nákupní a cross-sell flow běží samy**. Platí ale, že
skupina `ecommerce` musí být zapnutá (`apps/api/src/index.ts`) a připojení se
dnes dělá mimo administraci.

**Co produkt sám generuje:** jmeniny a datová pole (denní cron 06:00 UTC →
`apps/workers/src/jobs/workflow-scheduler.ts`), naskladnění
(`onBackInStock` → `back_in_stock`, `apps/api/src/services/workflows/triggers.ts`),
přidání štítku, věrnostní body (`services/loyalty/earning-rules.ts`).

**Události, které produkt negeneruje** — flow na ně čeká marně, dokud je
zákazník nezačne posílat na `POST /api/v1/events`:

| Událost           | Kdo ji čeká                   | Stav                                                                                                        |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cart_abandoned`  | `abandoned-cart-cs` (3 kroky) | nikdo ji neposílá; Shoptet téma `cart/abandoned` se zahazuje (`apps/api/src/integrations/shoptet/index.ts`) |
| `payment_pending` | `payment-pending-cs`          | nikdo ji neposílá                                                                                           |
| `pickup_ready`    | `pickup-invoice-cs`           | nikdo ji neposílá                                                                                           |

Z osmi českých šablon tedy **dvě běží po napojení e-shopu samy**
(post-purchase-cs, cross-sell-cs), **tři jsou vnitřní** (jmeniny, naskladnění,
věrnostní body) a **tři čekají na vlastní integraci**. Událost
`checkout_started` produkt generuje, ale jen z Shopify
(`apps/api/src/routes/v1/ecommerce-integrations.ts`); české platformy ji
neposílají a žádná publikovaná šablona ji zatím nepoužívá.

---

## 4. Co blokuje spuštění

- **Doména.** Systémová pošta (potvrzení registrace, obnova hesla, ověřovací
  maily) odchází z naší domény pod identitou zákazníkovy organizace, ale
  vyhledání podpisového klíče je org-scoped, takže klíč nemůže nikdy sednout —
  pošta odchází **nepodepsaná** a engine to hlásí jako úspěch. Doloženo testem
  `apps/api/src/lib/transactional-dkim.test.ts`. Na téže doméně visí SPF
  a DMARC, adresa pro vrácené zprávy, odhlašovací centrum a sledování prokliků.
- **Stripe Connect u commerce.** Platba za fakturu zákazníka se vytváří na
  **našem** Stripe účtu: `createInvoicePaymentIntent`
  (`apps/api/src/services/commerce/payments.ts`) neposílá `on_behalf_of`,
  `transfer_data` ani hlavičku `Stripe-Account` — v repozitáři není žádné
  `acct_` ani onboarding připojeného účtu
  (`apps/api/src/integration/stripe-customer-tenant.integration.test.ts`).
  Dokud Connect nebude, peníze zákazníkových faktur by chodily nám.
- **Kvóty a ceník ve dvou podobách.** AI kvóta se hlásí jako klouzavých 24 h přes
  všechny funkce (`apps/api/src/services/billing/plan-enforcement.ts`),
  ale vynucuje se per funkce a per kalendářní den UTC
  (`packages/shared-ai/src/rate-limiter.ts`) — u free tarifu 5/den hlášených
  proti ~65/den skutečně povolených. Strop odeslání: `plans.ts` odmítá přesně
  na kvótě, `plan-enforcement.ts` pouští 20 % přes. Dva katalogy plánů
  servírují stejný tarif za jinou cenu (`billing/index.ts` 149 vs
  `billing/plans.ts` 139). Která cena skutečně fakturuje: **neověřeno**
  (je ve Stripu).
- **E-shopové konektory bez obrazovky** (viz část 2) — bez nich je většina
  českých flow šablon nepoužitelná.

---

## 5. Co se nezapíná a proč

- **`ads-webhook` (příjem reklamních formulářů z Facebooku)** — jediná položka
  na seznamu blokovaných skupin
  (`packages/shared/src/beyond-core/index.ts`). V produkci ji nezapne ani
  jeden ze dvou přepínačů: uvedení v `BEYOND_CORE_GROUPS` shodí boot (`resolveBeyondCoreGroups`)
  a registrace navíc vyžaduje `ENABLE_META_LEAD_ADS_WEBHOOK` plus app secret
  (`apps/api/src/index.ts`, `lib/webhook-switches.ts`). Důvod uvedený
  na seznamu je ale **zastaralý**: tvrdí, že ověření podpisu se otevírá při
  chybějícím secretu, a to už neplatí (`apps/api/src/lib/meta-signature.ts`
  vrací `unsignedWebhooksAllowed()`, v produkci vždy false).
- **Commerce jde zapnout.** Dřívější tvrzení, že je nezapnutelné, **neplatí**:
  všech šest skupin (`commerce-product`, `commerce-quote`, `commerce-invoice`,
  `stripe-webhook`, `commerce-subscription`, `internal-commerce`) se registruje
  běžným `registerBeyondCore` bez druhé podmínky
  (`apps/api/src/index.ts`) a na seznamu blokovaných nejsou. Co jim chybí,
  je konfigurace (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) a Connect
  z části 4 — tedy důvod obchodní, ne technický přepínač.
- **Analytika helpdesku** — skupinu `helpdesk-analytics`
  (`apps/api/src/index.ts`) lze zapnout, ale
  `GET /api/v1/helpdesk/analytics` vrací 500 (měřeno živě). Zapínat ji s touto
  rozbitou obrazovkou nemá smysl.

---

## Strojová fakta

Devět čísel, o která se dokument opírá. Nepřepisují se ručně: přepočítá je
`apps/api/src/integration/stav-produktu-facts.integration.test.ts` a porovná
s tímhle blokem, takže posun čísla shodí CI ve stejném PR, které ho způsobilo.
Zbytek dokumentu — úsudky, odkazy, tabulky — testem hlídaný není a zůstává
na člověku.

```yaml
# Routy složené aplikace: buildApp() + printRoutes, bez zapnuté skupiny.
core_paths: 901
core_operations: 1125
# Rozdíl proti FEATURE_BEYOND_CORE=true, tedy plocha za přepínači.
beyond_core_paths: 342
beyond_core_operations: 437
# packages/shared/src/beyond-core/index.ts
beyond_core_groups: 76
# apps/api/src/integration/route-smoke/known-failures.ts
known_5xx_routes: 6
# apps/api/src/services/workflow-templates/registry.ts
published_workflow_templates: 28
# Vestavěné e-maily, na které publikované šablony odkazují, a kolik z nich
# projde readCampaignContent jako EmailSchema.
published_template_emails: 29
published_template_emails_rendering: 28
```
