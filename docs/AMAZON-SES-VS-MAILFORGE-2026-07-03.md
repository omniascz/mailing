# Amazon SES vs ForgeMsg — kompletní feature audit (2026-07-03)

Metodika: 5 doménových agentů ověřilo **reálnou implementaci ForgeMsg přímo v kódu** (routes + services + **Go engine** + workers + DB schema — ne TODO, ne dokumentace) a porovnalo se **skutečným produktovým povrchem Amazon SES** (Send API v2, SMTP interface, identity/DKIM, dedicated IP + warmup, configuration sets, event destinations, suppression, sandbox/production model, quoty, templates, contact lists, inbound receiving). Legenda: ✅ plné a zapojené · 🟡 částečné / stub / nezapojené do živé cesty · 🔴 chybí.

> **Zásadní rozdíl v povaze produktu:** Amazon SES **není marketingový nástroj** — je to **vývojářská e-mailová infrastruktura**: API + SMTP endpoint, přes který posílají aplikace, s deliverability, dedikovanými IP, event notifikacemi a suppression. ForgeMsg je **plný ESP/marketing suite**, který **většinu SES infrastruktury už uvnitř má** (vlastní Go MTA, DKIM, SPF/DMARC/BIMI, dedicated IP, warmup, suppression, tracking, transakční API, Resend-kompat, webhooky, reputation dashboard, AI deliverability coach). **Aby ForgeMsg nabídl „SES jako službu"** (tj. raw dev email API + SMTP relay), chybí několik konkrétních infra kusů — a hlavně je **několik nosných věcí postaveno, ale nezapojeno / temných** (nejnebezpečnější kategorie).

---

## Scoreboard (kdo vede v doméně)

| Doména | Vítěz | Poznámka |
|---|---|---|
| Send API (single / batch) | **remíza** | MF transakční + Resend-kompat + batch (1000); SES SendEmail/SendBulkEmail |
| **Raw MIME send** (SendRawEmail) | **Amazon SES** | MF neumí přijmout hotový MIME k odeslání 🔴 |
| **SMTP submission relay** (zákaznický) | **Amazon SES** | MF nemá autentizovaný odchozí SMTP server — jen HTTP API 🔴 |
| Templated send (uložená šablona) | **Amazon SES** | MF: `templateId` se přijme, ale **nikdy neresolvuje** 🟡 |
| Vlastní MTA + connection pooling | **remíza (MF plně)** | direct-to-MX, per-domain pool, batch |
| Identity verifikace (doména) | **remíza** | MF živé DNS ověření SPF/DKIM/DMARC/Return-Path/MX; single-email identity 🔴 |
| DKIM (Easy DKIM) | **remíza** | MF keygen + podpis v Go MTA; **BYODKIM 🔴** |
| **Custom MAIL FROM / VERP** | **Amazon SES** | MF má DNS scaffolding, ale engine posílá envelope = header From (žádné VERP) 🟡 |
| SPF / DMARC / BIMI + monitoring | **ForgeMsg** | +DMARC aggregate ingest, BIMI CRUD, DNS-health |
| Dedicated IP + pooly + warmup | **remíza / 🟡** | engine umí bind IP + warmup enforce; ale **per-org výběr IP nezapojen** (`sendingIp:''`) |
| **Configuration sets** | **Amazon SES** | MF má jen `message_stream` enum, žádný pojmenovaný profil 🔴 |
| **Event destinations / notifikace** | **Amazon SES** | MF webhooky jsou hotové, ale **`dispatchEvent` se pro e-mail eventy nikdy nevolá — temné** 🟡 |
| Bounce / complaint / ARF FBL | **ForgeMsg** | 2 klasifikátory + ARF processor + auto-quarantine |
| Suppression list | **remíza** | org-scoped tabulka + API + auto-add + check-before-send |
| Open / click tracking + custom tracking domain | **ForgeMsg** | pixel + link-wrap + signed tokeny + branded subdoména |
| **Sandbox → production gate** | **Amazon SES** | MF nemá production-approval ani „jen ověření příjemci" sandbox 🔴 |
| Send rate / quota | **smíšené** | MF měsíční quota ✅; **žádný per-second send-rate** 🔴 |
| Templates (CRUD + knihovna) | **ForgeMsg** | 71 vestavěných + org CRUD |
| Contact lists / subscription | **ForgeMsg** | lists + DOI + RFC 8058 + preference center + consent; **Topics 🔴** |
| Reputation dashboard + VDM advisor | **ForgeMsg** | multi-ISP reputation + AI deliverability coach |
| Inbound receiving | **Amazon SES** | MF má MX receiver, ale rules hardcoded, žádné S3/Lambda/SNS akce 🔴 |
| Auth / API keys / scopes | **smíšené** | MF klíče silné, ale **scopes vynucené jen na 2 routách** (prázdný scope = full access) 🟡 |
| Webhooky (podpis + retry) | **ForgeMsg** | dual-signed + backoff (SES posílá jen do SNS/SQS) |
| Multichannel + marketing suite | **ForgeMsg** | SES tohle nemá vůbec (editor, kampaně, SMS/WhatsApp/push, CRM, CDP…) |

---

## 1. Send API — single / batch — remíza

**ForgeMsg ✅:** `POST /api/v1/transactional/email` (X-API-Key + scope `emails:send`, to/from/subject/html/text/mergeVars/scheduleAt/tags + ≤10 příloh/14 MB) → `sendTransactionalEmail()` → `mta-other` fronta → Go engine gRPC → SMTP:25. Zapisuje `send` event. **Batch:** `/transactional/email/batch` (≤1000, per-recipient mergeVars), `/transactional/batch` (≤1000 + Redis batchId progress), Resend `/emails/batch` (≤100). **Resend-kompat** `/emails` (cc/bcc/reply_to/headers/idempotency-key). Vše zapojené na živou send cestu.

**vs SES:** SendEmail/SendBulkEmail parita. Rozdíl: per-destination replacement je naivní `{{var}}` regex na inline html/text, ne přes uloženou šablonu (viz §3).

## 2. Raw MIME send (SendRawEmail) — Amazon SES vede 🔴

**ForgeMsg:** **žádný endpoint nepřijme hotový RFC5322/MIME blob k odeslání.** Engine komponuje MIME interně ze strukturovaných polí (`sender.go`); volající nemůže poslat vlastní MIME. Jediné „raw" je inbound ARF parsing + inbound MX parser — příjem, ne odeslání. SES SendRawEmail je běžná potřeba (vlastní hlavičky, S/MIME, custom multipart).

## 3. Templated send — Amazon SES vede 🟡 (přijímá se, ale nezapojeno)

**ForgeMsg 🟡:** `templateId` je v Zod schématu `transactional.ts` (single + batch) i `messaging/send.ts`, ale **nikdy se neresolvuje** — nepředává se do `sendTransactionalEmail()`, chybí v `TransactionalEmailInput`, `mta-sender.ts` nemá render podle template id. Uloží se jen do `emailEvents.metadata`. Funguje jen caller-supplied `{{var}}` na inline těle. **Uložené šablony přes id se nerenderují** — je to přijímané-ale-mrtvé pole.

## 4. SMTP submission relay (zákaznický) — Amazon SES vede 🔴 (klíčová mezera)

**ForgeMsg:** **žádný autentizovaný zákaznický SMTP submission server.** Go engine (`main.go`) startuje jen (a) **gRPC** server (interní workers) a (b) volitelný **inbound MX receiver** (`INBOUND_LISTEN` — příjem, `LHLO/MAIL/RCPT/DATA`, **žádné `AUTH`, žádný port 587**). Odchozí jde engine → externí MX:25. **Zákazník nemůže namířit SMTP klienta s SMTP credentials na ForgeMsg a relayovat přes něj poštu.** SES SMTP interface (smtp.*.amazonaws.com:587, credentials z IAM) je jeho druhá hlavní brána — MF ji nemá. *(Tuto mezeru flagoval i Brevo audit.)*

## 5. Vlastní MTA + pooling — remíza (MF plně ✅)

`apps/engine/internal/pool/pool.go`: `resolveMX` (MX pref + A fallback), port 25, **per-domain pool** s NOOP liveness reuse + 30s idle reaper. `sender.go` staví RFC 5322 (multipart/alternative + mixed přílohy), MAIL/RCPT/DATA, batch s bounded concurrency (sem=20). Plně zapojené. SES samozřejmě také má vlastní MTA (to je jeho podstata) — remíza.

## 6. Identity verifikace — remíza (doména) / 🔴 (single email)

**ForgeMsg ✅:** `POST /domains` vytvoří identity + DKIM; `POST /domains/:id/verify` dělá **živé DNS lookupy** (`node:dns`) pro SPF/DKIM/DMARC/Return-Path/MX a persistuje per-record `*Verified`. `/domains/:id/quality-check` konsoliduje readiness. **Mezera:** žádná SES `VerifyEmailIdentity` (ověření jednotlivé e-mailové adresy) — jen doménová. 🔴

## 7. DKIM — remíza (Easy DKIM ✅) / 🔴 BYODKIM

**ForgeMsg ✅:** auto keygen (`generateDkimKeyPair`, 2048-bit RSA, `v=DKIM1`) + selector rotace fm1→fm9. **Podpis dělá vlastní Go MTA** (`dkim/signer.go`, relaxed/relaxed RSA-SHA256), zapojeno end-to-end (`resolveDkimForSender` jen pro verified domény → splitter → mta-sender → engine). **Mezera:** žádný **BYODKIM** (import zákazníkova privátního klíče) — klíče jsou vždy platform-generated. 🔴

## 8. Custom MAIL FROM / Return-Path / VERP — Amazon SES vede 🟡

**ForgeMsg 🟡:** DNS záznamy pro custom Return-Path subdoménu se **generují i ověřují** (`CNAME → return-path.forgemsg.com`, bounce `MX`), tracked `returnPathVerified`. **ALE engine nastaví envelope sender na header From** (`sender.go:151` `conn.Client.Mail(msg.FromEmail)`) — **žádný custom Return-Path/MAIL FROM override a žádný VERP** (`Message` struct nemá envelope-from pole). Takže SPF-alignment přes custom MAIL FROM subdoménu se reálně neaplikuje a out-of-band bounces nejdou spárovat přes VERP. SES custom MAIL FROM je běžná featura.

## 9. SPF / DMARC / BIMI — ForgeMsg vede ✅

SPF generováno + ověřováno; DMARC generováno + ověřováno + **monitoring** (inbound aggregate-XML `POST /t/dmarc/report` + dashboardy); BIMI full CRUD + živé DNS verify (`default._bimi`, VMC). SES DMARC/BIMI neřeší na této úrovni — MF dál.

## 10. Dedicated IP + pooly + warmup — remíza / 🟡 (per-org výběr nezapojen)

**ForgeMsg:** IP pool + dedicated-IP CRUD plně (`dedicated-ips.ts` — create/allocate/assign-to-pool/status, `pickIpForSend` least-loaded, `recordIpSend`). Engine **umí** bindnout zdrojovou IP (`pool.go:DialFrom` `LocalAddr`). **Warmup ✅** enforce v MTA (`warmup.go` `SelectIP`+`RecordSend`, ramp 50→200→1k→5k→20k→unlimited, Redis INCR midnight TTL), env-gated (`SENDING_IPS`).

**Load-bearing mezera 🟡:** worker **hardcoduje `sendingIp: ''`** (`mta-sender.ts:76`) a **`pickIpForSend` se nikdy nevolá** v send cestě → org→pool→IP přiřazení **nedorazí do enginu**. Engine bind je řízen jen `SENDING_IPS` env listem, ne DB pool modelem. Dva paralelní warmup stavy (Go/Redis enforced vs TS/Postgres pro quoty) nejsou propojené live send cestou.

## 11. Configuration sets — Amazon SES vede 🔴

**ForgeMsg:** **žádná pojmenovaná „configuration set" abstrakce** (bundle event-destinations + IP pool + TLS policy + suppression + reputation, aplikovaná per-send). Jediné příbuzné je `message_stream` enum (`broadcast|transactional|triggered`) — použité jen jako sloupec na `email_events` + header hint v enginu. **Žádná `configuration_sets` tabulka, žádné per-set event-destination binding, žádný per-send výběr profilu.** Config sets jsou v SES centrální — přes ně se posílá všechno a váže se na ně event routing, IP pool i suppression override.

## 12. Event destinations / notifikace — Amazon SES vede 🟡 (webhooky temné)

**ForgeMsg — infra hotová, ale nevystřelí:** webhook subsystém je produkční (`services/webhooks/index.ts`) — **dual HMAC-SHA256 podpis** (legacy `X-ForgeMsg-Signature` + Stripe-style timestamped v2 s replay ochranou), retry (5× exp backoff), batching, per-org limit 50, delivery audit tabulka. Schema deklaruje eventy `email.delivered/opened/clicked/bounced/complained/unsubscribed`.

**Kritická mezera 🟡:** **`dispatchEvent()` se pro žádný e-mail event nikdy nevolá.** Grep: volá se jen pro `contact.created` (signup-forms) a Stripe billing. Internal events route, tracking route, bounce path i FBL processor zapisují `email_events`, ale **žádný nevolá `dispatchEvent`** → zákazník si předplatí delivery/bounce/complaint webhook a **nikdy nic nedostane**. Žádný SNS/SQS/Kinesis/EventBridge ekvivalent. **Toto je nejnebezpečnější gap — vypadá hotově, subscribuje se to, ale je to temné.**

## 13. Bounce / complaint / ARF — ForgeMsg vede ✅

Dva bounce klasifikátory (in-session SMTP fails v `mta-sender.ts` + out-of-band DSN `bounce-processor.ts`), hard→suppress, soft→retry (6× exp backoff, Gmail 3×), block→alert. **ARF (RFC 5965) processor** (`fbl-processor.ts`) — parse feedback, suppress, `complaint_count`, **auto-quarantine org při ≥0.3% complaint rate**. Google Postmaster digest. SES to má taky, MF srovnatelně/bohatší.

## 14. Suppression list — remíza 🟡

Tabulka `suppressions` (org-scoped, reasons hard_bounce/complaint/manual/unsubscribe), API list/add/delete/**`/suppressions/check`** (check-before-send), auto-add na bounce (`mta-sender.ts` + DSN path) i complaint (`fbl-processor.ts`). SES parita. Caveat: per-org (tenant), ne account/platform-managed; check-before-send musí zavolat volající.

## 15. Open / click tracking + custom tracking domain — ForgeMsg vede ✅

Pixel `GET /track/o/:token` (1×1 GIF + MPP detekce + bot scoring + geo) + click `GET /track/c/:token` (log + 302), HMAC signed tokeny. **Custom tracking domain** ✅ — resolvuje org `mailSubdomain` (CNAME → `track.mailforge.io`), branded baseUrl, volané per-batch. (Verifikační wizard UI deferred.) SES custom tracking domain je featura config setů; MF má.

## 16. Sandbox → production model — Amazon SES vede 🔴

**ForgeMsg:** test/sandbox mode existuje (`fm_test_` klíče → dispatch no-op; sandbox orgs `noOpMode`), ALE **žádný sandbox→production onboarding gate.** Nové orgy **nejsou** v „jen ověření příjemci" sandboxu, žádný production-access request, žádný approval workflow. Odesílání je gated jen plan quotou + `suspended` flagem, ne SES-style production graduation. **Pro důvěryhodnou infra službu (anti-abuse) je production gate zásadní** — SES tím chrání reputaci sdílených IP.

## 17. Send rate / quota — smíšené

**ForgeMsg ✅ (měsíční):** `checkSendCapacity` (free hard-stop, paid stop na 120% quota, `suspended`→403), volané před dispatch. `GET /billing/capacity` = GetSendQuota ekvivalent (`sends {current, limit, remaining}`). **Mezera 🔴:** **žádný per-second max send rate** (SES „max send rate" per účet) — jediná rate kontrola je per-IP warmup denní cap (deliverability, ne account rate). Žádná rolling 24h quota (jen kalendářní měsíc).

## 18. Sending statistics — ForgeMsg vede (per-campaign) / 🟡 (account rollup)

Per-campaign bohaté (`/campaigns/:id/stats`, timeline, links, devices, clients, geo+mapa, heatmap, revenue, CSV+PDF, compare). Benchmarks compare (bounce/unsub rate). **Mezera:** žádný jeden SES-style **account-level GetSendStatistics** endpoint (send/bounce/complaint souhrn za účet) — je to roztříštěné po campaign + benchmarks + isp/stats. 🟡

## 19. Templates + contact lists / subscription — ForgeMsg vede / 🔴 Topics

Template CRUD ✅ (71 vestavěných + org saved-templates CRUD + soft-delete). Merge-tag engine ✅ (`parseMergeTags`, filtry, custom_fields). **Mezera:** žádný standalone `TestRenderEmailTemplate` endpoint (render se volá interně) 🟡. Lists + DOI + **RFC 8058 one-click** + preference center (2 implementace) + per-channel consent + resubscribe ✅. **Mezera vs SES v2:** žádné **Topics** (subscription kategorie) — granularita je per-list a per-channel, ne per-topic. 🔴

## 20. Reputation dashboard + VDM advisor — ForgeMsg vede ✅

Multi-ISP reputation (`/deliverability/reputation` — SenderScore, Google Postmaster, Microsoft SNDS, Seznam; key-gated → „unknown" bez klíčů), health-score, insights rules engine. **VDM ekvivalent ✅:** `POST /deliverability/analyze` → AI deliverability coach (scored 0-100, grade A-F, issues content/reputation/technical/compliance/engagement + fix + impact, estimatedInboxRate, Claude). Blíž k SES Virtual Deliverability Manager advisoru. **Inbox placement 🟡** heuristická simulace (ne reálný seed-list); **Litmus adaptér existuje, ale `selectProvider` vrací default mock** 🟡.

## 21. Inbound receiving — Amazon SES vede 🔴 (akční model chybí)

**ForgeMsg 🟡:** MX receiver (Go `inbound/receiver.go`) → API ingest (`inbound-email.ts`) → persist `inbound_emails`, match kontaktu, bounce klasifikace, route na helpdesk ticket / `email_reply_received` workflow. **Mezery vs SES:** **žádný akční model** (S3-deliver / Lambda-invoke / SNS-publish / bounce / stop), **routing rules jsou HARDCODED** (`DEFAULT_RULES` — jen support/help/hello/contact → helpdesk), **žádná per-tenant rules/ingress konfigurace** (žádná rules tabulka), **žádné archivování inboundu**. SES Mail Manager (ingress endpoints, traffic policies, rule-based routing, archiving) nemá ekvivalent. 🔴

## 22. Auth / API keys / scopes — smíšené 🟡

Klíče silné (`fm_live_`/`fm_test_`/`fm_pub_`, SHA-256 hash, scopes[], mode, expiry, Redis cache). **Mezera 🟡:** `requireScope` je aplikován **jen na 2 route soubory** (`emails.ts`, `transactional.ts`, scope `emails:send`) a **prázdný scope list = full access** („legacy/unscoped key → full access"), `*` bypass → **většina endpointů scopes nevynucuje.** SES IAM je granulární per-akci. **SMTP credentials issuance 🔴** — žádná cesta negeneruje SMTP username/heslo (potřeba pro §4).

## 23. Bezpečnost / ops (region, encryption, audit) — 🟡

**Region/residency 🔴:** `data-residency/pure.ts` (us/eu/ap, endpoints) je **jen testovaná pure knihovna, nikde neimportovaná** — flag `dataRegion` na orgs, ale žádné fyzické routování/uložení podle regionu. **Encryption 🟡:** jen HIPAA field-level AES-256-GCM (env klíč), **žádné KMS / envelope encryption / key rotation**. **Audit log 🟡:** tabulka + searchable route existují, ale `logAuditEvent` je volán **jen v superadmin** — žádný onRequest hook = žádný CloudTrail-ekvivalent zachycení API akcí. **Webhooky ✅** signed + retry, ale **žádný dead-letter/replay** po 5 pokusech.

## 24. Per-email metering / PAYG — ForgeMsg 🟡 (nezapojeno)

Plány `contact_based`/`send_based`/`payg` (prepaid kredity), `/billing/credits`, meter product `'email'`, `recordUsage`/`computePeriodCost`. **Mezera 🟡:** **`recordUsage` je definováno, ale nikde se nevolá** (repo grep = 1 hit, jen definice) → **per-email metering není inkrementováno send pipeline** — pay-as-you-go není end-to-end zapojené. SES účtuje per-1000 e-mailů — MF má scaffolding, chybí live metering.

---

## Souhrn: kde ForgeMsg WINS (SES nemá / je slabší)

Celý marketing suite + editor + kampaně + **multichannel (SMS/WhatsApp/push/voice/Viber)** + CRM + CDP · SPF/**DMARC monitoring**/**BIMI** · **DMARC aggregate ingest** · open/click tracking + **custom tracking domain built-in** · **preference center + RFC 8058 + per-channel consent** · 71 vestavěných šablon + CRUD · bohatá per-campaign analytika (geo mapa, poziční heatmap, PDF) · **multi-ISP reputation dashboard + AI deliverability coach (VDM)** · **dual-signed webhooky s retry** (SES posílá jen do SNS/SQS bez podpisu) · ARF FBL + auto-quarantine · sub-accounts · Resend-kompat API · OAuth2 provider · MCP server. *(SES je čistá infra — tohle celé mimo jeho scope.)*

## Souhrn: kde Amazon SES WINS (co doplnit, aby MF nabídl „SES službu")

**Zákaznický SMTP submission relay** (port 587 + SMTP credentials) 🔴 · **Configuration sets** (pojmenovaný sending profil = event-dest + IP pool + TLS + suppression) 🔴 · **Event destinations reálně firing** — zapojit `dispatchEvent` pro e-mail eventy (dnes temné) 🟡 · **Raw MIME send** (SendRawEmail) 🔴 · **Templated send** zapojit (`templateId` resolve) 🟡 · **Sandbox→production gate** (verified-only sandbox + approval) 🔴 · **Per-second send-rate limit** 🔴 · **BYODKIM** + single-email identity 🔴 · **VERP / custom MAIL FROM** v enginu 🟡 · **per-org dedicated-IP výběr** zapojit (`sendingIp` hardcoded '') 🟡 · **auto-pause** triggerovaný real-time bounce/complaint (dnes route-only) 🟡 · **API-key scopes** vynutit napříč (dnes 2 routy) 🟡 · **inbound receipt-rule model** (Mail Manager) 🔴 · **per-email metering** zapojit (`recordUsage` se nevolá) 🟡 · **data residency** enforce (dnes jen flag) 🔴 · **TLS Require** policy 🟡 · **reject/rendering-failure/delivery-delay** event typy 🔴 · **account-level GetSendStatistics** 🟡 · **KMS encryption** 🟡 · **audit log** na všechny API akce 🟡.

## ⚠️ Kritické „postaveno, ale temné / rozbité" (nejnebezpečnější — vypadá hotově)

1. **E-mail webhooky nikdy nevystřelí** — webhook infra hotová + subscribovatelná, ale `dispatchEvent` se pro delivery/open/click/bounce/complaint **nikdy nevolá**. Zákazník si předplatí a nedostane nic. **Nejnebezpečnější.**
2. **Templated send temný** — `templateId` se přijme (Zod), ale nikdy neresolvuje → uložené šablony se přes API nerenderují.
3. **Per-org dedicated IP nezapojena** — `pickIpForSend` se nevolá, worker posílá `sendingIp:''` → přiřazení org→IP nedorazí do enginu.
4. **Auto-pause netriggerovaný ingestion** — abuse-detection (bounce>10%→pause, complaint>1%→suspend) je route-only, **nevolá se z bounce/complaint pipeline** → reputace se sama neochrání.
5. **Per-email metering se neinkrementuje** — `recordUsage` nikde voláno → PAYG neúčtuje reálné odeslání.
6. **`messaging/send.ts` email kanál loguje, ale neodesílá** — zapíše `email_events` `send` řádek a nic nedispatchne (stub).
7. **VERP/custom MAIL FROM DNS scaffolding nevyužit** — engine posílá envelope = header From.
8. **API-key scopes prakticky nevynucené** — prázdný scope = full access; enforce jen na 2 routách.
9. **Data-residency knihovna nikde neimportovaná** — jen flag, žádné regionální routování.
10. **Audit log jen superadmin** — žádné zachycení běžných API akcí.

---

## Bottom line + roadmapa „stát se SES konkurentem"

**ForgeMsg už drtivou většinu SES infrastruktury uvnitř má** — vlastní Go MTA, DKIM, SPF/DMARC/BIMI, dedicated IP + warmup, suppression, tracking, bounce/complaint/ARF, transakční + Resend-kompat API, reputation dashboard, AI deliverability coach — a nad rámec SES přidává celý marketing suite a multichannel. **Není to tedy „chybí infra", ale „infra je orientovaná jako ESP a několik nosných kusů je nezapojených."**

**Aby ForgeMsg nabízel SES-ekvivalentní vývojářskou službu, priorita (od nejdůležitějšího):**
1. **Zapojit e-mail event webhooky** (`dispatchEvent` na delivery/open/click/bounce/complaint) — nejrychlejší a nejviditelnější (infra existuje, jen se nevolá) + doplnit event destinations (SNS/SQS-like stream).
2. **Zákaznický SMTP submission relay** (port 587 + AUTH + SMTP credentials issuance) — druhá hlavní SES brána.
3. **Configuration sets** — pojmenovaný profil, na který se váže event routing + IP pool + suppression + TLS; přeznačit dnešní `message_stream` na plný config-set model.
4. **Zapojit per-org dedicated IP** (`pickIpForSend` → engine `sendingIp`), **auto-pause** z ingestion, **per-email metering** (`recordUsage`), **templated send** (`templateId` resolve) — vše „mrtvé dráty", které jen dopojit.
5. **Sandbox→production gate** + **per-second send-rate** + **VERP/custom MAIL FROM** — anti-abuse a deliverability infra.
6. **Raw MIME send**, **BYODKIM**, **inbound receipt rules (Mail Manager)**, **API-key scopes napříč**, **data residency enforce** — doplnění povrchu.

SES vs MF není „kdo umí lepší e-mail" — MF je funkčně širší. Je to **„MF má infra, ale posílá ji jen přes vlastní HTTP API a část event/IP/metering dráhy je odpojená."** Dopojení + SMTP relay + config sets = z ForgeMsg plnohodnotný SES konkurent.
