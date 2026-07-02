# Mailchimp vs MailForge — kompletní feature audit (2026-07-01)

Metodika: 10 doménových agentů, každý ověřil **skutečné funkce Mailchimpu z jeho vlastní dokumentace** (mailchimp.com/help, /developer) a **reálnou implementaci MailForge v kódu** (ne TODO značky). Legenda: ✅ plné · 🟡 částečné/stub/nezapojené · 🔴 chybí.

> **Klíčové zjištění:** MailForge má **širší datový/API model než Mailchimp** ve většině domén a navíc kanály, které Mailchimp nemá (WhatsApp, Viber, Push, Voice). Slabinou nejsou chybějící featury, ale **„postaveno, ale nezapojeno do živé cesty"** (built-but-unwired) a chybějící vizuální/hostované UI vrstvy (backend-only projekt).

---

## Scoreboard (kdo vede v doméně)

| Doména | Vítěz | Poznámka |
|---|---|---|
| Audience & contacts | **MailForge** | + lifecycle, phone intel, identity merge, per-purpose GDPR |
| Signup forms | MailForge (data) / Mailchimp (UI) | MF: A/B, smart fields, progressive, prefill; MC: hostované stránky, reCAPTCHA, překlady |
| Landing pages | **Mailchimp** | MF nemá landing pages vůbec |
| Campaign types & editor engine | **MailForge (parita+)** | + AMP, countdown GIF, 14-op dynamic, CZ/SK skloňování, spam-check; MC: drag-drop UI, photo editor |
| Automations/journeys | **Mailchimp** | MF širší typy akcí, ale detaily rozbité (viz níže) |
| Sending & deliverability | **Mailchimp** | MF má vlastní MTA, ale 3 velké wiring gapy |
| Reporting & analytics | Smíšené | MF: atribuce/prediktiva/cohorty; MC: geo, export, custom builder |
| E-commerce | **MailForge** | + back-in-stock, price-drop, ISDOC, CZ feeds, SMS kupóny |
| Multichannel/extras | **MailForge** | + WhatsApp/Viber/Push/Voice; MC: postcards, website builder |
| Recipient-side flows | **Mailchimp** | MF silná compliance páteř, ale chybí recipient-facing stránky |
| Platform/API/admin | **MailForge** | + SSO/SAML, audit log, MCP, Resend API, vlastní MTA |

---

## 1. Audience & Contact Management — MailForge ≥ Mailchimp

**MailForge dorovnává/překonává:** lists (many-to-many join — lepší model než MC isolované audiences), tagy (+auto-tag rules, barva), groups (checkbox/radio/dropdown, hidden), merge fields s inline default filtry, **nested AND/OR segmenty (depth 8)**, saved segments + live count, CLV/purchase-likelihood/churn (**Gamma-Poisson** — rigoróznější než MC lineární model), predicted next-order, timeline, notes, GDPR per-purpose consent (bohatší než MC), dedup + **identity resolution/merge** (MC nemá), import/export, RFM 11 segmentů.

**MailForge navíc (MC nemá):** lifecycle stages + history, phone/HLR intelligence (typ/operátor/region/ported/roaming), cross-record identity merge.

**Mezery MF:** predicted **age** (🔴), Mailchimp 1-5 star member rating (🟡 má 0-100 score místo toho), manuální **VIP flag** (🔴, jen auto RFM champions), stavy **non-subscribed** a **archived** (🔴), **audience-growth dashboard** (🔴 growth/net-growth analytics). Custom field typy: MF 5 (text/number/date/select/boolean) vs MC 13 (chybí Address/Image/Website/Birthday/Language).

## 2. Signup Forms & Landing Pages — smíšené

**MailForge navíc (data/API):** A/B varianty formulářů, **conditional smart fields**, **progressive profiling**, **prefill známého návštěvníka**, workflow/webhook trigger na submit, nativní **QR generátor**.

**Mezery MF:** hostovaná stránka formuláře (embed `loader.js` a `/view` **nejsou obsloužené** → 🟡), popup renderer (schema ano, klient ne), **reCAPTCHA/anti-bot** (🔴), překlady polí (🔴), **form-level double opt-in flag se nikdy nečte** (🟡 stub — DOI běží jen přes GDPR-purpose cestu), welcome email jen přes workflow. **Landing pages: úplně chybí** (🔴 — `apps/web/landing` je vlastní marketing MF, ne builder).

## 3. Campaigns & Email Designer — MailForge parita+ (engine)

**Všech 5 typů kampaní** (regular, plain-text, A/B, multivariate ≤8, RSS) ✅. Render engine produkční (table-based, dark mode, responsive, plain-text).

**MailForge navíc (MC nemá):** **AMP for Email**, **animovaný countdown GIF**, **14-operátorový dynamic content** vč. `has_tag` a v plain-textu (MC má 6 operátorů, ne tagy, ne v subjectu), **inline merge default** `{{x|default:"y"}}`, **CZ/SK skloňovací filtry** `|vocative|genitive`, **pre-send spam-score checker**, history-anchored AI subject lines, Liquid + Connected Content.

**Mezery MF (vizuální/media vrstva):** drag-drop builder polish, vestavěný **photo editor** (🔴), **Creative Assistant AI grafika** (🔴, MC to ale sunsetuje 12/2025), curated Apps gallery, **real-time komentáře/co-editing** (🔴). Chybějící bloky: video (🔴), social-share (🔴), first-class product/survey/promo blok (🟡 řešeno přes columns/merge). Custom field typy blocks a `mc:edit` editable-regions (🟡 řešeno Liquidem). Inbox preview má **mock provider** (architektura hotová, chybí Litmus klíč).

## 4. Automations & Journeys — Mailchimp vede (MF detaily rozbité)

**MailForge navíc:** víc typů akcí než MC (Viber, cascade, **nested/sub-flows**, loyalty, run_code, CZ/SK name-day/holiday triggery), automation map, N-way split. 5 core recipes běží end-to-end (welcome, abandoned-cart, onboarding, re-engagement, dunning).

**Vážné mezery MF (ověřeno v kódu):**
- **`onListSubscribe` a `onTagAdded` triggery jsou definované, ale nikdy volané** v produkci (jen v testech) — dva nejzákladnější triggery reálně nefungují. 🟡
- **56-recipe „gallery" je nepoužitelná** — configy neodpovídají executor kontraktu (`wait:{duration:{days}}`→NaN, `send_sms:{body}`→executor chce `message`, `condition:{rule}`→čte `field`→vždy false). Fork zkopíruje vadné configy. 🟡
- **Akce no-op:** `send_whatsapp`/`send_push`/`show_in_app`/`make_voice_call` vrací `next` bez odeslání; **žádný unsubscribe node**; update-field jen whitelist first_name/last_name/phone (custom fields ignorovány). 🔴
- **Run-state se nepersistuje přes `wait`:** `converted` (goal), `splitBranch`, `run.data` (run_code/cascade) žijí jen v paměti → po jakémkoli waitu se **konverzní suppression, A/B reporting i cross-node data tiše rozbijí**. 🟡
- **Cascade pošle jen krok 0** (counter se neinkrementuje). 🟡
- Žádná **journey-level analytika** (jen totalRuns/completed/failed countery). 🔴
- Enum chybí `email_link_click`/`company_event`/`ticket_event`/`consent_*` (handlery existují, ale workflow nejde vytvořit — cast `as never`). 🟡

## 5. Sending, Scheduling & Deliverability — Mailchimp vede (3 wiring gapy)

**MailForge silná manuální send path** (ověřeno end-to-end na `POST /campaigns/:id/send`): **vlastní Go MTA** (direct-to-MX, real DKIM podpis, connection pooling), per-ISP routing + rate caps, plain-text multipart, RFC 8058 one-click unsub, synchronní bounce handling (hard→suppress, soft→retry), FBL + auto-quarantine, Timewarp, plan-limit enforcement, SPF/DKIM/DMARC generování + **živé DNS ověření**.

**3 velké wiring gapy (🔴):**
1. **Naplánované kampaně se nikdy neodešlou** — `scheduleCampaign()` zapíše `status='scheduled'`, ale **žádný cron nepolluje** due kampaně do splitteru. *(pozn.: transactional scheduling jsem už opravil v předchozí session, ale campaign scheduler chybí)*
2. **Adaptivní ISP throttle = dead code** — logika halvení na 421/451 (`isp-throttle.ts`) se **nikdy nevolá**; živě limituje jen statický BullMQ limiter; engine nehlásí 421/451 zpět.
3. **Out-of-band bounce ztracené** — engine nemá **VERP/Return-Path** (`MAIL FROM = FromEmail`), `bounce-processor.ts` (ARF/DSN) není nikde importován → zachyceny jen in-session SMTP rejecty.

**Další 🟡:** dedicated-IP per-org není zapojen do sendu (jede global `SENDING_IPS`), STO predikce se hromadně nepočítají (cron chybí → STO reálně skoro nefiruje), batch delivery není konfigurovatelné (N batchů / X min), inbox preview je heuristická simulace ne Litmus, warmup se enforcuje jen když je `SENDING_IPS` set.

## 6. Reporting & Analytics — smíšené

**MailForge dorovnává/překonává:** core metriky (opens/clicks/CTR/**CTOR**/bounces/unsubs/complaints), timeline, top links, revenue/e-commerce reports, **multi-touch atribuce (5 modelů + cross-channel — bohatší než MC)**, prediktivní skóre (CLV/likelihood/churn), **cohort retention + funnels**, growth/churn, A/B + multivariate výsledky, per-event **Apple MPP** flagging (silnější než MC), comparative reports (MC to 03/2026 retiruje, MF si to nechal).

**Mezery MF:** **geolokace/opens-by-location (🔴** — IP se ukládá, ale žádný geo-IP lookup), **domain performance (🔴)**, **CSV/PDF/PNG export (🔴)**, **custom report builder (🔴)**, **device/email-client stats nenaplněné (🔴** — sloupce existují, write path je nikdy nezapíše → vždy „unknown"), **scheduled reports reálně neposílají e-mail (🔴** — jen renderují HTML, žádný cron je nevolá), GA integrace (🔴, jen UTM), click-map bez souřadnic + screenshot vrací 501 bez puppeteeru, benchmarks statická tabulka 11 oborů.

## 7. E-commerce — MailForge ≥ Mailchimp

**Dorovnává/překonává:** store integrace (Shopify/Woo/BigCommerce — real OAuth+webhooks), product/order sync, purchase data, CLV/likelihood, **AI product recommendations** (co-purchase + Claude), product bloky, abandoned browse/retargeting, e-commerce segmentace, revenue reporting + atribuce, promo kódy (unique batch, atomic assign).

**MailForge navíc (MC nemá):** **back-in-stock + price-drop alerty**, **reálná ISDOC fakturace** (VAT, IČO/DIČ, Pohoda/Money export), **CZ storefronty** (Shoptet/Upgates/FastCentrik), **Heureka/Zboží/Google Shopping feedy**, **SMS kupóny**.

**Mezery MF:** abandoned-cart a order-notifications dodané jako **template+workflow, ne turnkey** managed automatizace (🟡), Magento/PrestaShop mají jen normalizer bez OAuth shellu (🟡), některé e-com joby jedou přes API endpoint, ne dedikovaný cron worker (🟡), `custom_xml` feed větev vrací `[]` (🔴 stub).

## 8. Multichannel & Extras — MailForge vede

**MailForge navíc (MC nemá vůbec):** **WhatsApp** (Meta Cloud API, templates + 24h okno, delivery/read), **Viber** (3-provider failover), **Web Push + FCM**, **AI Voice bot** (Twilio+Deepgram+ElevenLabs+Claude), **LinkedIn+TikTok** organic social, round-robin team booking, ad-audience sync přes 5 platforem vč. **Sklik**.

**Mailchimp navíc (MF nemá):** **postcards / fyzická pošta** (🔴), **free website builder + nákup domény** (🔴), turnkey **ad-creative/kampaň authoring** (MF má jen audience sync + reporting, ne tvorbu kreativ, 🟡), **AI vizuální design generátor** (🔴, MC to ale sunsetuje).

## 9. Recipient / Subscriber-side Flows — Mailchimp vede

**MailForge silná compliance páteř (✅):** single/double opt-in, opt-in confirmation email, **signed RFC 8058 one-click unsubscribe** (nedávno opraveno), unsubscribe stránka, **preference center** (per-list + global opt-out, signed token, bez loginu), **resubscribe** (global + per-list), GDPR per-purpose consent s IP/timestamp snapshoty, bounced/complained ≈ MC „cleaned".

**Mezery MF (recipient-facing stránky):**
- **View-in-browser (🔴)** — `{{view_in_browser_url}}` merge tag definován, ale **nikdy naplněn** → renderuje prázdný; žádná hostovaná kopie e-mailu.
- **Campaign archive page (🔴)** — žádná veřejná archivní stránka.
- **Forward-to-a-friend (🔴)** — chybí úplně.
- **Recipient social-share (🔴)** — `social` blok jsou follow ikony, ne sdílení.
- **CAN-SPAM fyzická poštovní adresa (🔴)** — footer je jen free-text, žádné pole ani auto-append adresy. **Právní + deliverability blocker.**
- **Permission reminder (🔴)**, strukturovaný **unsubscribe-reason survey (🟡** — jen free-text reason, žádný report), preference center needituje custom fields/groups (🟡).

## 10. Platform / API / Account & Admin — MailForge vede

**MailForge navíc (MC nemá):** **SAML + OIDC SSO** (MC SSO nenabízí na žádném tieru!), **searchable audit log** (MC má jen real-time notifikace), **custom permission sets**, **MCP server** (AI-native), **Resend-kompatibilní API**, **vlastní MTA**, App Studio (build-your-own-app), HIPAA pozice (MC odmítá).

**Dorovnává:** Marketing REST API + OpenAPI, API klíče (live/test), transactional API (u MC placený Mandrill add-on, u MF v ceně), webhooky (**silnější** — dual HMAC podpis + retries), 2FA TOTP + backup codes, plány + PAYG kredity, EU data residency, helpdesk/universal inbox, AI asistent (Claude, širší než MC).

**Mezery MF:** **API-key scopes se nevynucují (🔴** — každý klíč = admin), **rate limiting flat 100/min** (ne per-plan, 🟡), **Python SDK jen contacts+events** (🟡, neumí poslat e-mail), Zapier malý povrch (2 triggery/3 akce), **žádný 300+ integrations marketplace** (MF ~18 nativních, silné CZ/SK), **žádná mobilní app** (🔴, backend-only), 4 role vs MC 5 (chybí Manager/Author split).

---

## Souhrn: kde MailForge WINS (Mailchimp nemá)

WhatsApp · Viber · Web Push/FCM · AI Voice bot · LinkedIn+TikTok social · vlastní MTA · Resend-kompat API · MCP server · SAML/OIDC SSO · searchable audit log · custom permission sets · App Studio · identity resolution/merge · lifecycle stages · phone/HLR intel · Gamma-Poisson CLV · 5-model multi-touch atribuce · cohort/funnel · AMP email · countdown GIF · 14-op dynamic content · CZ/SK skloňování · pre-send spam-check · back-in-stock/price-drop · ISDOC fakturace · CZ storefronty (Shoptet/Upgates/FastCentrik) · Heureka/Zboží feedy · SMS kupóny · Sklik ads · A/B formuláře · progressive profiling · per-purpose GDPR consent.

## Souhrn: kde Mailchimp WINS (MailForge chybí/rozbité)

Landing page builder · website builder + nákup domény · postcards/fyzická pošta · turnkey ad-creative authoring · AI vizuální design · photo editor · drag-drop UI + komentáře/co-editing · mobilní app · 300+ integrations marketplace · geolokace v reportech · CSV/PDF export · custom report builder · reCAPTCHA · view-in-browser · campaign archive · forward-to-a-friend · CAN-SPAM adresa · strukturovaný unsub-reason survey · predicted age · VIP flag · non-subscribed/archived stavy.

## ⚠️ Kritické „postaveno, ale nezapojeno" (nejnebezpečnější — vypadá hotově)

1. **Naplánované kampaně se neodešlou** (chybí scheduler cron) — send/deliverability
2. **Automation list-subscribe & tag-added triggery se nikdy nevolají** — nejzákladnější automatizace nefungují
3. **Workflow galerie config mismatch** — ✅ ČÁSTEČNĚ OPRAVENO 2026-07-02: `wait` (114 nodů, `{duration:{days,hours}}`→NaN) a `send_sms` (`{body}`→`{message}`) sladěny s executor kontraktem + regression test. ZBÝVÁ (sémantické, vyžadují nové executor featury): 22 `condition {rule:{type:...}}` business podmínek (executor čte `field/op/value` → dnes vždy else-větev) + 9 event-relativních `wait {until:{field,offsetHours}}` (executor chce ISO string).
4. **Workflow converted/splitBranch/run.data se nepersistují přes wait** — konverze/A-B/cascade tiše rozbité
5. **Workflow akce WhatsApp/Push/In-app/Voice/unsubscribe jsou no-op**
6. **Adaptivní ISP throttle = dead code**
7. **Out-of-band bounces ztracené** (chybí VERP/Return-Path)
8. **Device/geo analytics se nikdy nezapisují**; **scheduled reports neposílají e-mail**
9. **View-in-browser merge tag prázdný**; **CAN-SPAM adresa chybí** (deliverability/právní blocker)
10. **API-key scopes se nevynucují** (každý klíč = admin)
11. Signup form **hostovaná stránka + form-level DOI** jsou stub

---

## Bottom line

MailForge je na úrovni **datového modelu, API a šíře kanálů dál než Mailchimp** a v řadě domén (audience, e-commerce, multichannel, platform/API, editor engine) ho **překonává**. Není to ale dnes plnohodnotná náhrada, protože: **(a)** chybí vizuální/hostované UI vrstvy (landing pages, drag-drop builder, recipient-facing stránky, mobilní app) — z velké části záměrně (backend-only fáze), a **(b)** kritické featury jsou **postaveny, ale nezapojeny do živé cesty** — a právě to je nebezpečné, protože TODO to hlásí jako hotové. Priorita pro „reálně konkurenceschopné": doplnit scheduler cron, opravit workflow run-state + triggery, zapojit throttle/VERP, doplnit CAN-SPAM adresu + view-in-browser, vynutit API scopes.
