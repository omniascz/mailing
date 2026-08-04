# Brevo (ex-Sendinblue) vs ForgeMsg — kompletní feature audit (2026-07-03)

Metodika: 5 doménových agentů ověřilo **reálnou implementaci ForgeMsg přímo v kódu** (routes + services + DB schema + cron/worker + Go engine + `apps/web` UI — ne TODO, ne dokumentace) a porovnalo se **skutečným produktovým katalogem Breva** (email + transakční/SMTP relay, SMS/WhatsApp, automation, Sales CRM, Conversations/chat, Phone, Meetings, landing pages, formuláře, ads, reporting, deliverability, API/plán). Legenda: ✅ plné a zapojené · 🟡 částečné / stub / nezapojené do živé cesty · 🔴 chybí.

> **Klíčové zjištění:** Brevo je **„all-in-one" balík produktů** (email + transakční SMTP relay + Sales CRM + Conversations + Phone + Meetings + SMS/WhatsApp kampaně + landing pages). ForgeMsg **většinu těchto produktů má a v hloubce je často překonává** (CRM, CDP, Conversations, Phone, Meetings, deliverability, multivariate, CZ/SK). Hlavní reálné mezery vůči Brevu jsou **(a) zákaznický outbound SMTP relay** (Brevo staple — posílání přes SMTP credentials), **(b) landing page builder**, a **(c) bulk SMS/WhatsApp kampaně** — ForgeMsg umí SMS/WhatsApp jen per-contact/triggered, ne jako hromadnou kampaň. Plus několik **„postaveno, ale nezapojeno"** děr.

---

## Scoreboard (kdo vede v doméně)

| Doména                                | Vítěz        | Poznámka                                                                                                                            |
| ------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Email kampaně + editor + šablony      | **ForgeMsg** | 13 bloků (vč. video+coupon), ~71 šablon, A/B **+ multivariate** (Brevo jen A/B), scheduler cron ✅                                  |
| **Transakční email / SMTP relay**     | **Brevo**    | MF má transakční API + streams + inbound MX, ale **chybí zákaznický outbound SMTP submission relay** 🔴                             |
| Deliverability                        | **ForgeMsg** | vlastní Go MTA, DKIM/SPF/DMARC/BIMI, dedicated IP + binding zdrojové IP, warmup, blacklist                                          |
| Send-time optimization                | **Brevo**    | MF STO postavené, ale **nezapojené do dispatch** 🟡                                                                                 |
| Kontakty / segmentace                 | **ForgeMsg** | 8úrovňové AND/OR + behavioral; ale jen 5 typů custom fields                                                                         |
| **Sales CRM** (deals/pipelines/tasks) | **ForgeMsg** | pipelines s probability + stage-history, accounts s hierarchií, sequences, forecast/win-loss — hlubší než Brevo; ale **bez CRM UI** |
| **CDP + identity graph**              | **ForgeMsg** | Brevo CDP/identity graph nemá vůbec                                                                                                 |
| Lead scoring                          | **remíza**   | MF má scoring engine, ale **nezapojený do automatizací** 🔴                                                                         |
| Automation / workflows                | **ForgeMsg** | víc triggerů/akcí, run-state persistuje přes wait; voice akce mrtvá                                                                 |
| **SMS kampaně**                       | **Brevo**    | MF: silný per-contact/triggered send + compliance, ale **žádné bulk SMS kampaně** 🔴                                                |
| **WhatsApp kampaně**                  | **Brevo**    | MF: send path reálný (Meta) + receipts, ale **žádné bulk WhatsApp kampaně** (501) 🔴                                                |
| Web push                              | **remíza**   | oba ✅ (VAPID/FCM)                                                                                                                  |
| Mobile push (APNs/FCM)                | **Brevo**    | MF: jen registry + payload buildery, **žádný send transport** 🔴                                                                    |
| Viber                                 | **ForgeMsg** | Brevo nemá                                                                                                                          |
| Voice / call bot                      | **ForgeMsg** | Twilio VoIP + AI voice bot; Brevo nemá voice bota                                                                                   |
| **Conversations / live chat**         | **remíza**   | MF: SSE widget nad helpdesk tickety, 12kanálový universal inbox                                                                     |
| Shared inbox / helpdesk               | **ForgeMsg** | routing/assignment/canned/analytics; chybí jen SLA engine 🟡                                                                        |
| **Phone / cloud calling**             | **ForgeMsg** | dual-provider (Twilio+Telnyx), softphone, IVR/hunt groups                                                                           |
| **Meetings / booking**                | **ForgeMsg** | booking pages, round-robin, Google+Outlook write-back + Calendly                                                                    |
| **Landing pages**                     | **Brevo**    | MF landing page builder nemá vůbec 🔴                                                                                               |
| Signup forms                          | **ForgeMsg** | hostovaná stránka + loader.js + DOI + captcha + A/B                                                                                 |
| Facebook Ads                          | **Brevo**    | MF: jen audience sync + reporting (Sklik konkrétní), **žádná tvorba kreativ** 🟡                                                    |
| Coupons                               | **ForgeMsg** | unikátní kódy + store-sync                                                                                                          |
| Ecommerce                             | **ForgeMsg** | 8 platforem + CZ storefronty + revenue + product sync                                                                               |
| Reporting & analytics                 | **ForgeMsg** | geo country/city/**mapa**, poziční heatmap, device/client, CSV **+ PDF**                                                            |
| Developer platforma                   | **ForgeMsg** | REST+OpenAPI, signed webhooks (dual), OAuth2 provider, Zapier, marketplace, **MCP**                                                 |
| Plány / billing                       | **remíza**   | Stripe + free tier + multi-currency + subaccounts                                                                                   |

---

## 1. Email kampaně + editor + šablony — ForgeMsg vede

**ForgeMsg ✅ (ověřeno):** plný lifecycle `campaigns.ts` (draft → `/schedule` → `/send` → pause/resume/cancel/test). **Scheduler cron reálně firuje** — `dispatchScheduledCampaigns()` (dispatch.ts) selektuje `status='scheduled' AND scheduledAt<=now`, běží jako BullMQ `campaign-dispatch` každou minutu. Editor: **13 typů bloků** (text/image/button/divider/spacer/columns/hero/social/product/**video**/**coupon**/footer/dynamic). **~71 vestavěných šablon** (9 kategorií, test `>=70`). **A/B** (z-test winner engine + holdback) **+ multivariate** (2–8 variant) — Brevo má jen A/B. Personalizace: `{{field|default:"x"}}`, Liquid, dynamic if/else blok, CZ/SK skloňovací filtry, per-recipient coupon merge.

**Brevo navíc:** srovnatelný drag-drop UI + galerie; nemá multivariate ani CZ/SK skloňování.

## 2. Transakční email / SMTP relay — Brevo vede (jedna z hlavních mezer MF)

**ForgeMsg ✅ (transakční):** `routes/v1/transactional.ts` — `POST /transactional/email` (X-API-Key + scope `emails:send`, přílohy, scheduleAt, mergeVars), batch ≤1000, `/sms`, `/messages` search, export. **Message streams** (transactional/triggered/broadcast, oddělené fronty). **Resend-kompat API** (`resend-compat/` — api-keys, audiences, broadcasts, domains; ale broadcasts, ne single `/emails`). **Inbound MX SMTP receiver** (`apps/engine/internal/inbound/receiver.go` — reálný SMTP server, parse RFC 5322 → webhook).

**Mezera MF (🔴 vůči Brevu):** **žádný zákaznický outbound SMTP submission relay** — Brevo nechá zákazníky posílat přes `smtp-relay.brevo.com` s SMTP credentials. ForgeMsg má jen API-enqueue → Go MTA (odchozí) a inbound MX (příjem), ne autentizovaný submission server. Pro řadu zákazníků integrujících přes SMTP je to blocker.

## 3. Deliverability — ForgeMsg vede

**ForgeMsg ✅:** **vlastní Go MTA** (gRPC + per-domain connection pool), **DKIM signer v enginu** + keygen/DNS, **SPF/DMARC/BIMI** (routes + `dmarc-imap-poll` worker + blacklist-monitor cron), **dedicated IP + pooly** (engine reálně binduje zdrojovou IP `pool.DialFrom(domain, ip)`), warmup, suppression bulk-check per batch, RFC 8058 one-click List-Unsubscribe. Brevo nedává vlastní MTA ani DKIM klíče do ruky. MF technicky dál.

## 4. Send-time optimization — Brevo vede

**ForgeMsg 🟡:** STO service existuje (`send-optimization/` — bestHourForContact, timewarp) + endpointy, **ALE splitter/dispatch ho nevolají** (grep: 0 referencí v `campaign-splitter.ts`/`dispatch.ts`) — konzumují ho jen AI NBA engine + persona inference. Takže per-recipient best-time je analytická featura, ne aplikovaná na reálné plánování odeslání. Brevo STO aplikuje.

## 5. Kontakty + segmentace — ForgeMsg vede (2 drobné mezery)

**ForgeMsg ✅:** kontakty plné CRUD + batch + VIP + archive + GDPR anonymize/export; statické listy; **dynamické segmenty AND/OR + nested groups + negate, hloubka ≤8, 20 operátorů** vč. behavioral (opened/clicked/has_tag + withinDays), live count. Import **CSV i XLSX** (4kroky, 50 MB).

**Mezery MF:** custom-field typy jen **5** (text/number/date/select/boolean) — Brevo má víc (category/multi/id/calculated) (🟡). **Export jen CSV** (žádný XLSX) (🟡).

## 6. Sales CRM — ForgeMsg vede (hlouběji než Brevo), ale bez UI

**ForgeMsg ✅ (vše wired na reálné DB tabulky):** **deals** (create/list-filtry/move-stage se stage-history + duration/won/lost+reason/soft-delete, CDP eventy), **pipelines** se stages (probability/order/color, seed-default), **accounts/companies** s parent-child hierarchií, **tasks** (call/email/meeting/todo, overdue), **activity timeline** (16 typů), **sequences/cadences** (email/personal_email/wait/task/sms/linkedin, enroll, exit-on-reply, BullMQ executor), **lead scoring** (rules event→points + decay job), **CRM reporty** (deals-by-stage, conversion, velocity, rep-performance, win-loss, **forecast**). Toto **překonává** Brevo Sales CRM.

**Mezera MF:** **žádné CRM/CDP web UI** — vše API-only (`apps/web` má jen contacts/segments/lists/custom-fields/lead-scoring, žádné deals/pipelines/sequences/accounts stránky). Brevo má plné CRM UI.

## 7. CDP + identity graph — ForgeMsg vede (Brevo nemá)

**ForgeMsg ✅:** unified profile (cache-first, resolve-by-signal), events (single+batch ≤500, timeline), traits (compute/recompute), **identity graph** (9 typů signálů, ingest/resolve, **merge kontaktů**, duplicate detection), activation, sources. **Brevo nemá srovnatelný CDP ani identity graph** — čistá výhra MF.

## 8. Automation / workflows — ForgeMsg vede

**ForgeMsg ✅:** triggery s reálnými callery (onApiEvent/onListSubscribe/onTagAdded/onOrderPlaced/CheckoutStarted/AddedToCart/onSegmentEntered-Exited/onEmailLinkClick/sms_reply + daily birthday/jmeniny/holiday/stale-deal). **Run-state persistuje přes wait** (executor ukládá data/splitBranch/converted po každém uzlu; resumeWorkflowRun pokračuje). Reálné akce: send_email/sms/whatsapp/push/viber/webhook/personal_email/review_request, add/remove_tag, update_field (vč. custom JSONB), move/remove_list, **unsubscribe (+suppression)**, condition, split (sha256), goal, smart_channel, assign_task, start_workflow (nested), loyalty, sync_to_ad_audience, stripe_retry, **run_code** (sandbox).

**Mezery MF:** `make_voice_call` enqueuuje do `voice-call` fronty, **která nemá worker consumer** → mrtvá akce (🔴). `cascade` push/whatsapp kroky jsou prázdné placeholdery (🟡). **Lead scoring není zapojený do automatizací** — žádný score trigger/action node (🔴).

## 9. SMS marketing — Brevo vede (MF nemá bulk kampaně)

**ForgeMsg ✅ (per-contact/triggered):** `routedSmsSend` reálný (E.164 routing, priority + failover, log), volaný z workflow/transactional/messaging. Adaptéry **Twilio + Bulkgate** (reálné HTTP). **Compliance gate** reálně aktivní (consent EU/marketing, TCPA quiet hours, STOP append). Two-way inbound (STOP/START/HELP, → `sms_reply` trigger), keywords CRUD, DLR webhooky.

**Mezery MF (🔴 vůči Brevu):** **žádná bulk SMS kampaň** — `campaigns/:id/send` spouští jen email pipeline; `'sms'` je v enumu typu kampaně, ale hromadný SMS dispatch neexistuje. **Go SMPP gateway je stub** (`apps/sms-gateway/main.go` = 8 řádků, jen tiskne startup). Inbound webhooky řeší tenanta přes `DEFAULT_ORG_ID` (single-tenant zkratka). Brevo má plnohodnotné bulk SMS kampaně.

## 10. WhatsApp — Brevo vede (MF nemá bulk kampaně)

**ForgeMsg 🟡:** Meta Cloud API adaptér reálný (šablony + free-form v 24h okně, error mapping), worker `whatsapp-sender` konzumuje frontu, delivery/read receipts + inbound. Firuje ale **jen z workflows**.

**Mezera MF (🔴):** **žádná bulk WhatsApp kampaň** — unified `messaging/send.ts` vrací pro whatsapp **501 NOT_IMPLEMENTED**. Brevo má WhatsApp kampaně.

## 11. Web push / Mobile push — smíšené

**Web push ✅ (remíza):** per-org VAPID, subscriptions, `/push/send` + broadcast, click tracking, `send_push` workflow → `push-send` worker → adaptér. Reálné.

**Mobile push (APNs/FCM) 🔴:** device registry (`mobileDevices`, register/deactivate/list) + payload buildery (`buildApnsPayload`/`buildFcmMessage`) existují, **ale `prepareContactSend` jen loguje `queued` a nemá caller; žádný APNs/FCM HTTP transport**. `send_push` akce míří na **web** push, ne na zařízení. Send path pro mobilní push tedy neexistuje.

## 12. Viber / Voice — ForgeMsg bonus

**Viber ✅** (Brevo nemá): adaptér + route + worker (infobip/rakuten/messagebird), `send_viber` akce.
**Voice 🟡:** `call-manager` dělá **reálný Twilio Calls.json** (AMD + recording) přes API route; navíc **AI voice bot** (`apps/voice-bot` — Twilio media → Deepgram → Claude → ElevenLabs). **Ale** workflow `make_voice_call` je mrtvý (bez konzumenta). Brevo voice bota nemá.

## 13. Conversations / live chat — remíza (MF plně wired)

**ForgeMsg ✅:** live chat widget (`/t/chat/start` → helpdesk ticket, session v Redisu), **real-time přes SSE + Redis pub/sub** (`/t/chat/:token/stream`), polling fallback. **Universal inbox 12 kanálů** (email/chat/sms/whatsapp/voice/messenger/twitter/instagram/viber/rcs/telegram/webchat) s thread-match → identity-match → cross-channel resolution, idempotence. Instagram/Messenger bridge. Odpovídá Brevo Conversations (transport je SSE, ne obousměrný websocket jako u softphonu).

## 14. Shared inbox / helpdesk — ForgeMsg vede (chybí SLA)

**ForgeMsg ✅:** routing (round-robin/least-loaded/skill-based/manual), agent availability + skills, canned responses (shortcut search), analytics (first-response/resolution časy, volume by channel, per-agent, backlog buckets), CSAT endpoint. **Mezera:** **žádný SLA policy/breach engine** — časy se měří, ale cíle se nedefinují/nevynucují (🟡).

## 15. Phone / cloud calling — ForgeMsg vede

**ForgeMsg ✅:** **dual-provider VoIP** (Twilio + Telnyx, `IVoipProvider`), reálné number provisioning (Twilio REST), outbound/inbound dial, **softphone s websocket signalizací** + Twilio Access Token, IVR/hunt groups/business hours, call logging + auto CRM activity, recording + transcription. Odpovídá/překonává Brevo Phone. (Drobnost: Telnyx Ed25519 webhook sig je placeholder; softphone-token helper superseded reálným JWT v voip.ts.)

## 16. Meetings / booking — ForgeMsg vede

**ForgeMsg ✅:** veřejné booking pages (`/meetings/:slug` + slot computation + book), event types (duration/buffers/notice/max-day/location zoom/meet/teams, single/**round-robin**/collective), availability + overrides, **round-robin team booking** (weighted, fairness v DB), **reálný Google Calendar + Microsoft Graph write-back** (OAuth + refresh + free/busy + zápis eventu + Meet/Teams link), + **Calendly** OAuth + signed webhook. Odpovídá/překonává Brevo Meetings.

## 17. Landing pages — Brevo vede (MF chybí 🔴)

**ForgeMsg:** **žádný landing page builder** — jediný „landing" je vlastní marketingový web MF. Veřejné hostované stránky existují jen pro **signup formuláře** a **survey**, ne obecné landing pages. Brevo má landing page builder (placené plány).

## 18. Signup forms — ForgeMsg vede

**ForgeMsg ✅:** hostovaná stránka `/public/forms/:id/hosted`, **served loader.js** `/public/forms/loader.js` (dřív 404 → opraveno), double opt-in (pending + DOI email), captcha (recaptcha/hcaptcha) + honeypot, A/B varianty, conditional fields, progressive profiling, autofill, targeting.

## 19. Facebook Ads — Brevo vede

**ForgeMsg 🟡:** audience sync (`/ads/audience-syncs`) + lookalike + lead-sync + reporting; konkrétně implementovaný provider je **Sklik**, Meta je enum cíl (ne dedikovaný modul). **Žádná tvorba ad kreativ** (🔴, grep `creative` = nic). Brevo umí FB ads retargeting + tvorbu.

## 20. Coupons / Ecommerce — ForgeMsg vede

**Coupons ✅:** batch generování ≤100k unikátů, assign/redeem/stats, **sync-to-store** (Shopify price-rule / Woo).
**Ecommerce ✅:** Shopify/Woo/BigCommerce/Magento/PrestaShop + CZ Shoptet/Upgates/FastCentrik, HMAC webhooky + `ingestOrder`, revenue reporting + atribuce, product feeds. **Abandoned cart 🟡** — přes workflow triggery, ne dedikovaný modul.

## 21. Reporting — ForgeMsg vede

**ForgeMsg ✅:** aggregate + timeline + per-link CTR/**CTOR** + device + **email-client** breakdown; **geo country + city + mapa (choropleth intensity)**; **poziční heatmap** (relativeY) i link-count overlay; **CSV + PDF export**; multi-campaign compare. Brevo má geo/heatmap, ale ne poziční heatmap ani PDF přes vlastní generátor + ne MF hloubku.

## 22. Developer platforma — ForgeMsg vede

**ForgeMsg ✅:** REST + OpenAPI 3 + Swagger UI `/docs`, transakční API, **signed webhooky dual scheme** (legacy sha256 + Stripe-style timestamped v2 replay-resistant), **API keys + scopes**, **OAuth2 provider** (authorize/token/introspect/revoke), **Zapier bridge** (trigger + akce), **integrations marketplace** (katalog + UI), **MCP server** (samostatný `apps/mcp-server` package — mimo apps/api). **Mezera:** zákaznický SMTP relay (viz §2) 🔴.

## 23. Plány / billing — remíza

**ForgeMsg ✅:** Stripe Checkout + signed webhook, plány vč. **free tier**, contact-based + transactional tiery, multi-currency (CZK/EUR/USD/GBP), credits/meters/plan-enforcement, **subaccounts**. Odpovídá Brevu.

---

## Souhrn: kde ForgeMsg WINS (Brevo nemá / je slabší)

CDP + identity graph · Viber · AI voice bot · vlastní Go MTA + BIMI + dedicated-IP source binding · **multivariate testing** (Brevo jen A/B) · hlubší Sales CRM (forecast/win-loss/velocity, sequences s LinkedIn) · dual-provider Phone (Twilio+Telnyx) · round-robin Meetings + Google+Outlook write-back · poziční heatmap · geo mapa · PDF export · MCP server · Resend-kompat API · OAuth2 provider · dual-signed webhooky · loyalty · coupons se store-sync · **CZ/SK lokalizace** (jmeniny, skloňování, Shoptet/Upgates/FastCentrik, Sklik, Seznam, ISDOC) · brand-kit z URL · 12kanálový universal inbox.

## Souhrn: kde Brevo WINS (ForgeMsg chybí / rozbité)

**Zákaznický outbound SMTP relay** (submission přes SMTP creds) 🔴 · **Landing page builder** 🔴 · **Bulk SMS kampaně** 🔴 (MF jen triggered) · **Bulk WhatsApp kampaně** 🔴 (501) · **Mobile push send transport** (APNs/FCM) 🔴 · **tvorba FB ad kreativ** 🟡 · **CRM/CDP web UI** (MF backend-only) · víc typů custom fields · **XLSX export** · **STO aplikované při dispatch** 🟡 · **SLA engine** v helpdesku 🟡.

## ⚠️ Kritické „postaveno, ale nezapojeno / rozbité" (nejnebezpečnější — vypadá hotově)

1. ~~**Bulk SMS/WhatsApp kampaně chybí**~~ — ✅ **OPRAVENO 2026-07-03**: `channel-dispatch.ts` resolvuje audience a fan-outuje per-contact na sms/whatsapp/push fronty; `enqueueCampaignSend` větví podle typu; bulk SMS nese campaignId (consent + atribuce).
2. **`make_voice_call` workflow akce = mrtvá** — enqueue do `voice-call` fronty bez konzumenta.
3. ~~**Mobile push: jen registry**~~ — ✅ **OPRAVENO 2026-07-03**: `mobile-transport.ts` (APNs HTTP/2 + ES256 JWT, FCM v1 + service-account OAuth), `sendContactMobilePush` + route + `mobile-push-send` worker; invalid tokeny se deaktivují.
4. **STO nezapojené do dispatch** — splitter/dispatch ho nevolají.
5. **Go SMPP gateway = stub** (SMS teče přes Bulkgate/Twilio).
6. ~~**Bug `messaging/send.ts` (SMS)**~~ — ✅ **OPRAVENO 2026-07-03**: proper UnifiedMessage envelope; whatsapp/push (dřív 501) zapojeny na adaptéry.
7. **`cascade` push/whatsapp kroky = placeholder** (samostatné nody fungují).
8. **Lead scoring není v automatizacích** (žádný score trigger/action).
9. **SMS inbound přes `DEFAULT_ORG_ID`** (single-tenant zkratka).
10. **Telnyx Ed25519 webhook sig = placeholder**; softphone-token helper superseded.

> **Aktualizace 2026-07-03:** Body 1, 3, 6 vyřešeny (bulk SMS/WhatsApp/push kampaně + mobile push transport + SMS envelope). Zbývají 2, 4, 5, 7–10. Odesílací kód mobile pushe (APNs/FCM naživo) nebyl v tomto prostředí spuštěn — ověřeno jen JWT podepisování (unit testy proti vygenerovaným EC/RSA klíčům); Go SMPP + worker běh mimo tsc.

---

## Bottom line

ForgeMsg **pokrývá prakticky celý Brevo balík a ve většině domén ho překonává** — email engine + deliverability, Sales CRM, CDP/identity graph, Conversations, Phone, Meetings, multivariate, reporting, developer platforma, CZ/SK lokalizace, plus kanály navíc (Viber, AI voice bot). **Brevo vyhrává v pěti konkrétních věcech:** **(1) zákaznický outbound SMTP relay** (posílání přes SMTP credentials — MF má jen API + inbound MX), **(2) landing page builder**, **(3) bulk SMS kampaně**, **(4) bulk WhatsApp kampaně** a **(5) mobile push doručení** — u posledních tří má MF „poslední míli" nezapojenou (send path chybí nebo vrací 501). Priorita pro „reálně nahradit Brevo": **zapojit bulk SMS/WhatsApp dispatch** (nejviditelnější mezera — enum to slibuje, ale nefunguje), **doplnit mobile-push transport**, **outbound SMTP relay**, **landing page builder** (staví na stejné hostované-page vrstvě jako už hotové form/survey stránky), a opravit mrtvou voice-call akci + SMS envelope bug. CRM/CDP UI je backend-only — datově hotové, chybí obrazovky.
