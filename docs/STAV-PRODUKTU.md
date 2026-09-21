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

Bez zapnutí jediné skupiny je registrováno **903 adres a 1127 operací**
(změřeno dvakrát nezávisle: `buildApp()` + `printRoutes`, jednou s
`FEATURE_BEYOND_CORE=false`, jednou `=true` → 1245 / 1564, rozdíl 342 / 437).
To je „jádro" — e-mailová platforma níže.

Vše v této části má obrazovku v administraci nebo veřejné API a doklad, že
doběhne.

| Co                                                          | Jak to zákazník spustí                               | Doklad                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mailové kampaně — tvorba, plánování, odeslání             | `/campaigns` v administraci                          | `apps/web/src/app/(dashboard)/campaigns`; běh celé cesty až do MTA fronty: `apps/workers/src/integration/campaign-content-shape.integration.test.ts`                               |
| Vizuální editor a šablony e-mailů                           | `/templates`, editor bloků                           | `apps/api/src/services/editor/templates` (91 vestavěných), render doložen `apps/editor/src/render` (284 jednotkových testů)                                                        |
| A/B testy                                                   | `/ab-tests`                                          | `apps/workers/src/integration/ab-two-phase.integration.test.ts`, `ab-always-closes`                                                                                                |
| Transakční pošta                                            | API `/api/v1/emails`                                 | `apps/api/src/integration/transactional-dkim.integration.test.ts`                                                                                                                  |
| Vlastní odesílací engine, DKIM, zahřívání IP, reputace      | `/domains`, `/settings`                              | `dkim-rotation`, `dkim-encryption`, `ip-reputation`, `warmup-claim` v `apps/api/src/integration/`                                                                                  |
| Odhlášení, stížnosti, potlačené adresy                      | `/suppressions`, odkaz v patičce                     | `unsubscribe.integration.test.ts`, `unsubscribe-callers.integration.test.ts`                                                                                                       |
| Kontakty, segmenty, vlastní pole, import, sloučení duplicit | `/contacts`, `/segments`, `/custom-fields`           | obrazovky v `apps/web/src/app/(dashboard)/`; org-scope doložen `public-write-tenant-scope.integration.test.ts`                                                                     |
| Souhlasy podle GDPR účelů, frekvenční stropy, tiché hodiny  | `/settings`, `/frequency-rules`, `/quiet-hours`      | `consent-guardrail.integration.test.ts`, `batch-sender-quiet-hours`, `batch-sender-consent`                                                                                        |
| Workflow automatizace — plátno, větvení, čekání             | `/workflows`                                         | `workflow-graph-checks`, `workflow-editor-branches`, `workflow-cycle-guard`                                                                                                        |
| Galerie flow šablon: 28 publikovaných, z toho 8 českých     | `/workflows` → fork šablony                          | měřeno během: 93 šablon celkem, 28 publikovaných, 65 skrytých, 8 s `locale=cs`                                                                                                     |
| E-maily v šablonách flow se renderují                       | součást forku                                        | `apps/workers/src/integration/workflow-template-body.integration.test.ts`; 28 z 29 použitých e-mailů se vyrenderuje, `ecom-002` ne                                                 |
| SMS — odchozí i příchozí (Twilio, BulkGate)                 | `/campaigns` (typ SMS), API `/api/v1/messaging/send` | `apps/api/src/services/sms/routing.ts:139-146`; příjem včetně STOP/START a dohledání organizace podle čísla: `apps/api/src/routes/v1/sms.ts:209-213`, `services/sms/inbound.ts:47` |
| Analytika a reporty                                         | `/reports`                                           | obrazovky v `apps/web`; `/api/v1/analytics/cohorts` měřeno živě → 200                                                                                                              |
| Veřejné REST API, webhooky, SDK (JS, Next, Python)          | API klíč v `/settings`                               | `packages/{sdk,web-sdk,next-sdk,sdk-python}`; `webhook-deliver.integration.test.ts`                                                                                                |
| Vlastní události z webu nebo e-shopu                        | `POST /api/v1/events`, web SDK                       | `apps/api/src/routes/v1/events.ts:29,67`; `packages/web-sdk/src/*.ts:279`                                                                                                          |

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

| Endpoint                               | s relací | bez relace | Co padá                                                                                                                             |
| -------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/external-feeds`               | 500      | 401        | `syntax error at or near "null"` — `isNull(externalFeeds['deletedAt'])`, sloupec neexistuje (`services/external-feeds/index.ts:38`) |
| `/api/v1/analytics/cohort`             | 500      | 401        | `rawCohorts.rows is not iterable` — postgres-js vrací pole bez `.rows` (`services/analytics/cohort.ts:60-74`)                       |
| `/api/v1/helpdesk/analytics`           | 500      | 401        | `helpdeskTickets.as is not a function` (`services/helpdesk/analytics.ts:95,97`); za skupinou `helpdesk-analytics`                   |
| `/api/v1/analytics/compare`            | 500      | **500**    | chybějící querystring spadne dřív, než se odpoví 401                                                                                |
| `/api/v1/integrations/allegro/connect` | 500      | 401        | `ALLEGRO_CLIENT_ID not configured` — konfigurace, ne kód (`routes/v1/integrations/allegro.ts:74-76`)                                |
| `/api/v1/phone/softphone/ws`           | 500      | **500**    | websocketová routa; přes HTTP není socket. Nemá `app.authenticate` v řetězci hooků                                                  |

Pět z šesti je v jádru, šestá (analytika helpdesku) za skupinou. Dvě odpovídají
500 i nepřihlášenému.

Pozor na záměnu: `/api/v1/analytics/**cohorts**` (množné číslo) je jiný
endpoint, ten byl opraven a měřeno vrací 200
(`apps/api/src/integration/beyond-core-5xx.integration.test.ts:245`). Rozbitý je
`/api/v1/analytics/**cohort**`.

---

## 2. Co je postavené, ale nedosažitelné

Toto je největší část produktu.

### Plocha za přepínači

76 funkčních skupin (`packages/shared/src/beyond-core/index.ts:46`), **342 cest
a 437 operací** (doloženo zeleným během
`apps/api/src/integration/beyond-core-groups.integration.test.ts:82,194-195`).
Výchozí stav je nula zapnutých skupin: `registerBeyondCore` plugin neregistruje,
dokud skupina není vyjmenovaná v `BEYOND_CORE_GROUPS`
(`apps/api/src/index.ts:421-424`), v produkci je `FEATURE_BEYOND_CORE` odmítnuto
(`packages/shared/src/beyond-core/index.ts:252-259`) a `docker-compose.prod.yml`
předává proměnnou bez defaultu. Zda operátor v ostrém provozu něco zapnul:
**neověřeno** — hodnota není v repozitáři.

Z té plochy je 186 čtecích adres. Podle řetězce hooků jich **168** vyžaduje
`app.authenticate` a **18** ne — OAuth callbacky (social, ads, Shopify,
Shoptet), veřejná nabídka, náhled a veřejný článek blogu, hostovaný dotazník,
chatový token, `sitemap.xml` a `robots.txt`, Sklik pixel, stránka schůzky a
veřejné recenze. Část z těch 18 odmítá až v handleru (např.
`routes/v1/blog.ts:421-426` → 400/401), což řetězec hooků nevidí; přesné
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
(`apps/web/src/app/(dashboard)/loyalty/page.tsx:20,41-42`).

Jednotlivé endpointy bez volajícího kdekoli v repozitáři:

- **Přidělování kupónů po dávkách** — `POST /api/v1/internal/coupons/allocate-batch`
  (`apps/api/src/routes/v1/internal/coupons.ts:15`). Jeho vlastní docstring tvrdí,
  že ho volá batch-sender; ten místo toho importuje funkci přímo
  (`apps/workers/src/jobs/batch-sender.ts:33,543-545`).
- **Doporučovací engine** — `POST /api/v1/ai/recommend`
  (`apps/api/src/routes/v1/ai-recommendations.ts:33`) a
  `GET /api/v1/products/recommendations`
  (`apps/api/src/routes/v1/product-recommendations.ts:62`). Ani jeden nemá
  volajícího v administraci ani v SDK.

### Funkce s plánovačem, ale bez obrazovky pro nastavení

Cron existuje a volá vnitřní routu; nastavit je nejde odnikud:

| Funkce                          | Cron                                               | Rozvrh                                                                |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Sledování opuštěného prohlížení | `apps/workers/src/jobs/workflow-scheduler.ts:184`  | `*/15 * * * *`, jen při zapnuté skupině `browse-abandonment` (`:396`) |
| Rozesílání příspěvků na sítě    | `apps/workers/src/jobs/social-scheduler.ts:28`     | `* * * * *`, skupina `internal-social`                                |
| Upomínky faktur                 | `apps/workers/src/jobs/invoice-reminder.ts:32`     | `0 8 * * *`, skupina `internal-commerce`                              |
| Generování opakovaných plateb   | `apps/workers/src/jobs/subscription-billing.ts:58` | `*/5 * * * *`, bez podmínky                                           |
| Měření pozic ve vyhledávání     | `apps/workers/src/jobs/seo-rank-poll.ts:22`        | `0 6 * * *`, skupina `internal-seo-rank-poll`                         |

### Kanály, které nejsou dokončené

- **WhatsApp** — odchozí funguje (`apps/workers/src/jobs/whatsapp-sender.ts:31-38`,
  kredenciály jen globální). Příjem ne: routa vrací 404, dokud není zapnutý
  vlastní přepínač a nastavený app secret
  (`apps/api/src/routes/v1/whatsapp.ts:280-285`), a i pak přiřazuje zprávy
  natvrdo do `DEFAULT_ORG_ID` (`:293`, totéž `routes/v1/sms.ts:264`).
- **Viber** — odchozí jde jen přímým voláním API
  (`apps/api/src/routes/v1/viber.ts:111`). Příchozí zpráva se zahodí: doslova
  `void inbound;` (`:203`). Kampaňový kanál to není —
  `apps/api/src/services/campaigns/channel-dispatch.ts:146-148` pouští jen
  sms/whatsapp/push.
- **Hlasový robot** — funguje přes API
  (`apps/api/src/routes/v1/voice.ts:28-33`), kampaňový kanál to není. Routa
  navíc nemá `preHandler: [app.authenticate]`, ale čte `req.user!.orgId`
  (`:30,33`), takže anonymní volání skončí výjimkou místo 401.
- **Mobilní notifikace** — klíče k Apple a Google jsou jen globální v prostředí
  (`apps/api/src/services/push/mobile-transport.ts:56-68,161-163`); per-zákazníka
  je v databázi jen web-push VAPID (`apps/api/src/db/schema/push.ts:19`). Do
  aplikace zákazníka tedy doručit nelze.

### Další měřené mezery

- **DMARC reporty jen pro jednu organizaci.** Jediná automatická cesta je IMAP
  poller, který každý report podává pod `DMARC_IMAP_ORG_ID`, a bez něj report
  zahodí (`apps/workers/src/jobs/dmarc-imap-poll.ts:99-114,122`). Schránka je
  jedna platformní adresa sdílená všemi zákazníky
  (`apps/api/src/config/env.ts:681-682`).
- **E-shopové konektory nemají připojovací obrazovku.** Stránka `/integrations`
  jen vypíše URL jako text (`apps/web/src/app/(dashboard)/integrations/page.tsx:97-99`)
  a callback přesměruje na `/settings/integrations/ecommerce/:id`
  (`apps/api/src/routes/v1/ecommerce-integrations.ts:356`), která v `apps/web`
  neexistuje.

---

## 3. Co potřebuje vlastní integraci zákazníka

**Co zákazník dostane po napojení e-shopu (Shoptet, Upgates, FastCentrik,
Shopify):** objednávky. Webhook nebo synchronizace volá `ingestOrder`
(`apps/api/src/integrations/shoptet/index.ts:89`, `upgates/index.ts:85`,
`fastcentrik/index.ts:90`), ta spustí `onOrderPlaced`
(`apps/api/src/services/ecommerce/index.ts:697`), což je spouštěč
`purchase_event` — tedy **po-nákupní a cross-sell flow běží samy**. Platí ale, že
skupina `ecommerce` musí být zapnutá (`apps/api/src/index.ts:518`) a připojení se
dnes dělá mimo administraci.

**Co produkt sám generuje:** jmeniny a datová pole (denní cron 06:00 UTC →
`apps/workers/src/jobs/workflow-scheduler.ts:74`), naskladnění
(`onBackInStock` → `back_in_stock`, `apps/api/src/services/workflows/triggers.ts:243`),
přidání štítku, věrnostní body (`services/loyalty/earning-rules.ts:208`).

**Události, které produkt negeneruje** — flow na ně čeká marně, dokud je
zákazník nezačne posílat na `POST /api/v1/events`:

| Událost           | Kdo ji čeká                   | Stav                                                                                                              |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cart_abandoned`  | `abandoned-cart-cs` (3 kroky) | nikdo ji neposílá; Shoptet téma `cart/abandoned` se zahazuje (`apps/api/src/integrations/shoptet/index.ts:92-94`) |
| `payment_pending` | `payment-pending-cs`          | nikdo ji neposílá                                                                                                 |
| `pickup_ready`    | `pickup-invoice-cs`           | nikdo ji neposílá                                                                                                 |

Z osmi českých šablon tedy **dvě běží po napojení e-shopu samy**
(post-purchase-cs, cross-sell-cs), **tři jsou vnitřní** (jmeniny, naskladnění,
věrnostní body) a **tři čekají na vlastní integraci**. Událost
`checkout_started` produkt generuje, ale jen z Shopify
(`apps/api/src/routes/v1/ecommerce-integrations.ts:533-535`); české platformy ji
neposílají a žádná publikovaná šablona ji zatím nepoužívá.

---

## 4. Co blokuje spuštění

- **Doména.** Systémová pošta (potvrzení registrace, obnova hesla, ověřovací
  maily) odchází z naší domény pod identitou zákazníkovy organizace, ale
  vyhledání podpisového klíče je org-scoped, takže klíč nemůže nikdy sednout —
  pošta odchází **nepodepsaná** a engine to hlásí jako úspěch. Doloženo testem
  `apps/api/src/lib/transactional-dkim.test.ts:164-190`. Na téže doméně visí SPF
  a DMARC, adresa pro vrácené zprávy, odhlašovací centrum a sledování prokliků.
- **Stripe Connect u commerce.** Platba za fakturu zákazníka se vytváří na
  **našem** Stripe účtu: `createInvoicePaymentIntent`
  (`apps/api/src/services/commerce/payments.ts:101-127`) neposílá `on_behalf_of`,
  `transfer_data` ani hlavičku `Stripe-Account` — v repozitáři není žádné
  `acct_` ani onboarding připojeného účtu
  (`apps/api/src/integration/stripe-customer-tenant.integration.test.ts:22-28`).
  Dokud Connect nebude, peníze zákazníkových faktur by chodily nám.
- **Kvóty a ceník ve dvou podobách.** AI kvóta se hlásí jako klouzavých 24 h přes
  všechny funkce (`apps/api/src/services/billing/plan-enforcement.ts:202-206`),
  ale vynucuje se per funkce a per kalendářní den UTC
  (`packages/shared-ai/src/rate-limiter.ts:33-41`) — u free tarifu 5/den hlášených
  proti ~65/den skutečně povolených. Strop odeslání: `plans.ts:214` odmítá přesně
  na kvótě, `plan-enforcement.ts:160-168` pouští 20 % přes. Dva katalogy plánů
  servírují stejný tarif za jinou cenu (`billing/index.ts:13` 149 vs
  `billing/plans.ts:71-76` 139). Která cena skutečně fakturuje: **neověřeno**
  (je ve Stripu).
- **E-shopové konektory bez obrazovky** (viz část 2) — bez nich je většina
  českých flow šablon nepoužitelná.

---

## 5. Co se nezapíná a proč

- **`ads-webhook` (příjem reklamních formulářů z Facebooku)** — jediná položka
  na seznamu blokovaných skupin
  (`packages/shared/src/beyond-core/index.ts:161-170`). V produkci ji nezapne ani
  jeden ze dvou přepínačů: uvedení v `BEYOND_CORE_GROUPS` shodí boot (`:244-249`)
  a registrace navíc vyžaduje `ENABLE_META_LEAD_ADS_WEBHOOK` plus app secret
  (`apps/api/src/index.ts:650`, `lib/webhook-switches.ts:51-60`). Důvod uvedený
  na seznamu je ale **zastaralý**: tvrdí, že ověření podpisu se otevírá při
  chybějícím secretu, a to už neplatí (`apps/api/src/lib/meta-signature.ts:32`
  vrací `unsignedWebhooksAllowed()`, v produkci vždy false).
- **Commerce jde zapnout.** Dřívější tvrzení, že je nezapnutelné, **neplatí**:
  všech šest skupin (`commerce-product`, `commerce-quote`, `commerce-invoice`,
  `stripe-webhook`, `commerce-subscription`, `internal-commerce`) se registruje
  běžným `registerBeyondCore` bez druhé podmínky
  (`apps/api/src/index.ts:652-657`) a na seznamu blokovaných nejsou. Co jim chybí,
  je konfigurace (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) a Connect
  z části 4 — tedy důvod obchodní, ne technický přepínač.
- **Analytika helpdesku** — skupinu `helpdesk-analytics`
  (`apps/api/src/index.ts:579`) lze zapnout, ale
  `GET /api/v1/helpdesk/analytics` vrací 500 (měřeno živě). Zapínat ji s touto
  rozbitou obrazovkou nemá smysl.
