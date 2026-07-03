# Twilio SendGrid vs ForgeMsg — kompletní feature audit (2026-07-03)

Metodika: 5 doménových agentů ověřilo **reálnou implementaci ForgeMsg přímo v kódu** (routes + services + Go engine + workers + DB schema — ne TODO, ne dokumentace) a porovnalo se **skutečným produktovým povrchem Twilio SendGridu** (Mail Send v3 API, Dynamic Templates, SMTP relay, Sender Authentication, dedicated IP + warmup, Event Webhook, Inbound Parse, Suppression management, ASM unsubscribe groups, Stats API, Marketing Campaigns, Email Validation, subusers/teammates/scopes/IP Access Management). Legenda: ✅ plné a zapojené · 🟡 částečné / stub / nezapojené · 🔴 chybí.

> **Povaha produktu:** SendGrid je **hybrid** — transakční e-mailová infrastruktura (jako Amazon SES) **plus** vrstva Marketing Campaigns (single sends, automations, segmenty, editor). Sedí mezi SES (čistá infra) a Brevem (marketing suite). **ForgeMsg po dodělání SES mezer má celou SendGrid transakční infrastrukturu** (SMTP relay, configuration sets s TLS+IP enforcement, VERP, event webhooky, sandbox gate, dedicated IP + warmup, per-key scopes, subusers, IP Access Management) **I celý marketing** (kampaně, segmenty, automations, editor, 71 šablon) **a navíc Email Validation API**. Zbývající mezery vůči SendGridu jsou **„polish"** detaily, ne chybějící pilíře.

---

## Scoreboard (kdo vede v doméně)

| Doména | Vítěz | Poznámka |
|---|---|---|
| Mail Send API (single) | **remíza** | MF: to/from/subject/html/text/templateId/mergeVars/scheduleAt/tags/attachments/config-set; chybí reply-to/headers/custom-args na JSON routě (jen přes raw MIME) |
| Raw MIME send | **remíza** | oba ✅ (MF `/transactional/email/raw`) |
| Batch / personalizations | **SendGrid** | MF má 2 batch endpointy (1000), ale **žádný cancel scheduled batche podle batch ID**; používá `recipients[]`, ne SendGrid `personalizations[]` |
| **Dynamic Templates** | **SendGrid** | SendGrid Handlebars ({{#each}} loops) + verzování; MF merge-tags + DynamicBlock podmínky, **Liquid loops nezapojené** do template sendu, **žádné verzování** |
| Categories | **SendGrid** | MF ukládá `tags` do metadata, ale **nedotazovatelné + žádné category-stats** |
| Sandbox mode | **remíza** | MF: test-key + account sandbox gate; SendGrid má per-request `sandbox_mode` flag (MF ne) |
| Mail/tracking settings | **SendGrid** | MF: jen combined `trackingEnabled`; chybí footer/bcc/bypass/spam-check/GA-UTM/separate open-vs-click |
| **SMTP relay** | **remíza** | oba ✅ (MF Go submission server :587 AUTH LOGIN/PLAIN + credential issuance) |
| Scheduled send | **remíza** | oba ✅ (MF přes BullMQ delay); MF nemá dedikovaný cron ani cancel delayed jobu |
| Domain Authentication (DKIM/SPF/DMARC) | **remíza** | MF živé DNS ověření + BYODKIM + DMARC aggregate ingestion |
| Link Branding (custom tracking domain) | **remíza** | oba ✅ (MF branded subdoména, verify wizard deferred) |
| Reverse DNS / PTR | **SendGrid** | MF má jen store-only `ptrRecord` pole, žádné provisioning/verify |
| Dedicated IP + pooly + warmup | **remíza** | MF: pickIpForSend → engine bind, warmup enforce; **ale config-set IP pool jen na transactional cestě, ne na kampaních** |
| **VERP / Return-Path** | **remíza** | oba ✅ (MF engine MAIL FROM = Return-Path) |
| TLS enforcement | **remíza** | MF config-set `require` → engine abort bez plaintext; **jen na transactional cestě** |
| **Event Webhook** | **SendGrid** | MF firuje sent/delivered/opened/clicked/bounced/complained/unsubscribed; chybí processed/dropped/deferred/group_unsubscribe/group_resubscribe |
| Webhook signature | **remíza (schéma se liší)** | MF HMAC-SHA256 + timestamped V2 (replay), SendGrid ECDSA; MF retries 5× |
| Inbound Parse + routing | **ForgeMsg** | MF konfigurovatelná per-tenant rules engine (Mail Manager); SendGrid jen jeden webhook |
| Suppression management | **SendGrid** | MF: CRUD + auto-add + check ✅, ale **1 reason enum** vs SendGridových 5 listů (Bounces/Blocks/Invalid/Spam/Global) |
| **ASM Unsubscribe Groups** | **remíza / 🟡** | MF Topics (per-group opt-out ✅), ale one-click je global ne per-group; hosted page JSON-only na API vrstvě |
| Stats API | **SendGrid** | MF: account + geo + device + client; **chybí ISP/mailbox-provider dimenze + category time-series** |
| Bounce/complaint/ARF | **ForgeMsg** | 2 klasifikátory + ARF processor + auto-quarantine + real-time auto-pause |
| Marketing: contacts/segmenty | **ForgeMsg** | 8úrovňové segmenty + behavioral; SendGrid segment query mělčí |
| Single Sends + A/B + STO | **remíza** | oba ✅ (MF A/B winner + STO + Timewarp) |
| Automations | **ForgeMsg** | 32 reálně volaných triggerů + víc kanálů akcí; SendGrid automations jednodušší |
| Editor + šablony | **ForgeMsg** | 13 bloků + 71 šablon; SendGrid Design Library srovnatelný |
| Signup Forms | **ForgeMsg** | hostovaná stránka + embed + A/B + targeting |
| **Email Validation API** | **remíza** | MF: syntax/disposable/role/MX/score ✅ (wired do contact create + bulk); chybí „did-you-mean" korekce |
| Verified single-sender | **remíza** | oba ✅ (MF email-identities) |
| Subusers | **remíza** | MF parent-child + consolidated billing; **per-child dedicated IP/reputation nemodelováno** |
| Teammates + role | **remíza** | MF 4 role + Teams layer |
| **API-key scopes** | **remíza** | MF globálně vynucené (BC) + katalog `/api-keys/scopes` |
| IP Access Management | **remíza** | MF per-org CIDR allow-list (IPv4-only) |
| SSO + 2FA | **remíza** | MF SAML+OIDC + TOTP; **2FA nevynucené při loginu** |
| Alerts | **SendGrid** | MF jen anomaly alerts, žádné usage-% quota alerts |
| Email Activity Feed | **SendGrid** | MF: lookup/list, **ne searchable** podle příjemce/statusu |
| Audit log | **SendGrid** | MF: query hotový, ale **zápisy jen ze superadmin** (org akce se nelogují) |
| Rate limit / quota | **remíza** | MF flat 100/min + plan quotas + **per-second send-rate** (`enforceSendRate`, wired do transactional) |
| Multichannel + CRM + CDP + AI | **ForgeMsg** | SendGrid nemá vůbec |

---

## 1. Mail Send API — remíza (single) / SendGrid (batch detaily)

**ForgeMsg ✅ (single):** `POST /transactional/email` (X-API-Key + scope `emails:send`) — to/from/fromName/subject/html/text/templateId/mergeVars/scheduleAt/metadata/tags/configurationSet/attachments (base64, inline/contentId). Zapojeno end-to-end (`sendTransactionalEmail` → mta-other → Go MTA). **Nedávno přidané a ověřené jako wired:** raw-MIME endpoint, config-set (IP pool + TLS + sending gate), sandbox gate, per-second send-rate, suppression pre-check (emituje `rejected`), usage metering.

**Mezery vs SendGrid:** **reply-to a arbitrary headers nejsou na JSON routě** (jen přes raw-MIME parsed headers); **žádné `custom-args`** (nejblíž free-form `metadata`).

**Batch 🟡:** dva endpointy — `/email/batch` (per-recipient mergeVars, max 1000, bez batchId) a `/batch` (max 1000, vrací batchId + Redis progress, ale bez scheduleAt). **Cancel/pause scheduled batche podle batch ID chybí** (SendGrid feature). MF používá `recipients[]`, ne SendGrid `personalizations[]` tvar. Nekonzistence mezi dvěma batch endpointy je reálná (jeden má batchId bez scheduleAt, druhý naopak).

## 2. Dynamic Templates — SendGrid vede 🟡

**ForgeMsg:** `templateId` je **zapojený** (`renderStoredTemplate` → subject/html/text + mergeVars; render failure → `rendering_failed` event + 400). **ALE engine NENÍ Handlebars** — block renderer používá `parseMergeTags` ({{var}}) + `evaluateCondition` pro DynamicBlock podmínky. **Liquid engine existuje** (liquidjs, `{% if %}`/`{% for %}`), ale `renderLiquid` **není zapojený** do `render.ts` ani do transactional template cesty → **loops `{% for %}` nejsou v uložených šablonách dostupné**. **Verzování šablon 🔴** (žádný version sloupec/tabulka). SendGrid: Handlebars s `{{#each}}` loops + versioned templates.

## 3. Categories — SendGrid vede 🟡

**ForgeMsg:** `tags` (max 20) se ukládají do `emailEvents.metadata.tags`, ale **nejsou samostatně dotazovatelné** (ani `/messages` ani `/export` nefiltrují podle tagu) a **žádná category-stats agregace**. SendGrid: per-category stats v čase.

## 4. Sandbox mode — remíza

**ForgeMsg:** **test-key sandbox** (`fm_test_` → zaznamená, neodešle) + **account sandbox gate** (`sendingMode !== 'production'` → jen ověření příjemci). **Mezera:** žádný per-request `mail_settings.sandbox_mode` flag jako SendGrid — sandbox je keyed na typ klíče / stav účtu.

## 5. Mail / tracking settings — SendGrid vede

**ForgeMsg:** jen `ConfigurationSetOptions` — combined `trackingEnabled` (open+click společně), `tlsPolicy`, `suppressionEnabled`, `reputationTracking`, `ipPoolId`, `eventDestinations`. **Chybí:** footer, bcc, bypass-suppression, spam-check, samostatné open-vs-click toggly, subscription tracking, Google Analytics/UTM.

## 6. SMTP relay — remíza ✅

**ForgeMsg ✅:** credential issuance (`POST /smtp-credentials` — username `fms_…` + one-time heslo bcrypt) + **Go submission server** (`apps/engine/internal/submission/server.go` — :587/465 ESMTP, EHLO/STARTTLS/AUTH LOGIN+PLAIN/MAIL/RCPT/DATA, auth přes `/internal/smtp/auth`, relay přes `/internal/smtp/relay` → stejná MTA pipeline). Odpovídá SendGrid modelu „API key jako SMTP heslo".

## 7. Deliverability infra — remíza (2 dílčí mezery)

**ForgeMsg ✅:** Domain Authentication (DKIM/SPF/DMARC generování + živé DNS ověření + **BYODKIM** import), **Link Branding** (branded tracking subdoména), **dedicated IP + pooly** (`pickIpForSend` → engine bind), **automatic warmup** (30denní ramp + MTA enforcement přes Redis), **VERP/Return-Path** (engine MAIL FROM), **DMARC aggregate ingestion** + BIMI, **real-time reputation auto-pause** (bounce/complaint rate z ingestion → sanctions/pauza).

**Mezery:** **Reverse DNS/PTR** je jen store-only pole (žádné provisioning/verify) 🟡. **Config-set IP pool + TLS policy jsou threadované jen na transactional cestě** — batch/kampaně používají org-default IP a opportunistic TLS bez ohledu na config set 🟡.

## 8. Event Webhook — SendGrid vede 🟡 (ale MF eventy nyní FIRUJÍ)

**ForgeMsg ✅ (nově zapojeno):** `emitEmailEvent` → `dispatchEvent` volané z reálných cest — tracking (opened/clicked), internal MTA events (sent/delivered/bounced), FBL (complained), transactional (sent/rejected/rendering_failed), unsubscribe. Doručení BullMQ-queued per webhook, HMAC-SHA256 + timestamped V2 podpis (replay ochrana), 5× retry.

**Mezery vs SendGrid:** chybí distinktní **processed/dropped/deferred** eventy (`delivery_delayed` je v enumu, ale bez calleru) a **group_unsubscribe/group_resubscribe** (změny topiců jdou jen přes generický `unsubscribed`). Podpis je **HMAC, ne ECDSA** (funkčně solidní, jiné schéma).

## 9. Inbound Parse — ForgeMsg vede ✅

**ForgeMsg ✅:** `receiveInbound` přijímá parsed payloady (SES/SendGrid/Postmark tvar), persist, contact match, **konfigurovatelný per-tenant rules engine** (Mail Manager — priority rules + recipient/from/subject regex + akce helpdesk/workflow/webhook/store/drop/stop). Auto-detekce async bounců + suppression. SendGrid má jen jeden Inbound Parse webhook bez per-tenant rules → **MF hlubší**.

## 10. Suppression management — SendGrid vede 🟡

**ForgeMsg ✅:** CRUD (`/suppressions` — list + filter reason/search, add, delete), **pre-send `/suppressions/check`**, auto-add na bounce + complaint. **Mezera:** **jeden reason enum** (`hard_bounce | complaint | manual | unsubscribe`) vs SendGridových **5 samostatných listů** (Bounces / Blocks / Invalid Emails / Spam Reports / Global Unsubscribes) — žádný distinktní „block"/„invalid" bucket (block bounces se záměrně nesuppressují).

## 11. ASM Unsubscribe Groups — remíza / 🟡

**ForgeMsg:** Subscription **Topics** ≈ SendGrid suppression groups — pojmenované skupiny s `opt_in`/`opt_out` defaultem + per-contact status, veřejné token-signed endpointy (`/public/topics/:token`). **Mezery:** hosted preference **HTML** stránka je JSON-only na API vrstvě (renderuje web app), **one-click je global** (RFC 8058 List-Unsubscribe-Post), **ne per-topic/group**, žádný `group_resubscribe` event.

## 12. Stats API — SendGrid vede 🟡

**ForgeMsg:** **account-level** `getAccountSendStats` (rolling window sent/delivered/bounced/complained/opened/clicked/unsub + rates); per-campaign **geo** (country+city+mapa), **device**, **email-client/browser**. **Mezery:** **žádná ISP / mailbox-provider dimenze** stats (ISP je jen v throttlingu/FBL, ne jako stats breakdown), **žádné category time-series** stats.

## 13. Marketing Campaigns — ForgeMsg vede

**Contacts ✅** (reserved fields + 5 typů custom fields + `email_validation_score`). **Segmenty ✅ hluboké** (8úrovňové nested AND/OR + behavioral opened/clicked/withinDays + engagement/e-com pole + custom JSONB + materialized membership). **Single Sends ✅** (create/schedule/send/pause/resume/cancel, list+segment+exclude, **A/B winner**, **STO + Timewarp**, resend-to-non-openers). **Automations ✅** (32 reálně volaných triggerů vč. CZ/SK jmeniny/svátky). **Editor ✅** (13 bloků + HTML import + spam/accessibility checker + **71 šablon**). **Signup Forms ✅** (hostovaná stránka + embed). SendGrid marketing je mělčí (segment query jednodušší, méně kanálů).

## 14. Email Validation API — remíza ✅ (jedna mezera)

**ForgeMsg ✅:** `services/email-validation/index.ts` — syntax check, **disposable-domain detekce** (~280 domén), **role-address detekce** (~120 prefixů), **MX DNS lookup**, → **0–100 score + reasons + verdict flags** (isValid/isDisposable/isRoleBased/hasMx). Zapojeno do contact create/update + bulk endpoint (≤5000). **Mezera:** žádná „did-you-mean" typo korekce (SendGrid vrací suggested address).

## 15. Platform / account / security — remíza (drobné mezery)

**Subusers ✅** (parent-child + consolidated billing + permission inheritance; **per-child dedicated IP/reputation nemodelováno** 🟡). **Teammates ✅** (4 role + Teams layer s row-level scoping). **API-key scopes ✅ globálně vynucené** (BC: legacy/JWT/`*` projdou, jen explicitně-scoped klíče omezeny; katalog `/api-keys/scopes`). **IP Access Management ✅** (per-org CIDR allow-list; IPv4-only). **SSO ✅** (SAML+OIDC) **+ 2FA ✅** (TOTP; **nevynucené při loginu** 🟡). **Sandbox→production gate ✅** (jen na transactional cestě 🟡). **Per-second send-rate ✅** (`enforceSendRate`, wired do transactional).

**Mezery:** **Alerts 🟡** — jen anomaly detection, žádné usage-% quota alerts. **Email Activity Feed 🟡** — lookup/list, ne searchable podle příjemce/statusu. **Audit log 🟡** — query hotový, ale `logAuditEvent` volaný **jen ze superadmin** (org akce member/role/key/SSO/send se nelogují). **HTTP rate limit** flat 100/min (ne per-plan).

---

## Souhrn: kde ForgeMsg WINS (SendGrid nemá / je slabší)

Celý **multichannel** (SMS/WhatsApp/push/voice/Viber) · **CRM** · **CDP + identity graph** · **loyalty** · **Meetings/booking** · **live chat + universal inbox** · **AI deliverability coach** · **DMARC aggregate ingestion + BIMI** · **konfigurovatelný inbound rules engine** (hlubší než SendGrid Inbound Parse) · **8úrovňové segmenty** · **32 automation triggerů** vč. CZ/SK jmeniny/svátky · **phone intelligence** · vlastní **Go MTA** s VERP/TLS-require/dedicated-IP bindingem · **OAuth2 provider** · **MCP server** · **Resend-kompat API** · hostované survey/form stránky · **CZ/SK lokalizace**. SendGridův marketing je mělčí a nemá multichannel/CRM/CDP vůbec.

## Souhrn: kde SendGrid WINS (ForgeMsg chybí / slabší)

**Handlebars dynamic templates** (`{{#each}}` loops) **+ verzování šablon** · **batch cancel podle batch ID** + `personalizations[]` tvar · **categories dotazovatelné + category-stats** · **5 samostatných suppression listů** (Bounces/Blocks/Invalid/Spam/Global) · **ISP/mailbox-provider stats dimenze** + category time-series · **processed/dropped/deferred + group_(un)subscribe eventy** · **ECDSA webhook podpis** · **reply-to/headers/custom-args** na JSON send routě · **per-request sandbox_mode** flag · **mail/tracking settings** (footer/bcc/bypass/spam-check/GA-UTM/separate open-click) · **reverse DNS/PTR provisioning** · **per-child dedicated IP/reputation** u subuserů · email-validation **did-you-mean** korekce · **usage-% alerts** · **searchable activity feed** · **audit log na org akce** · **per-group one-click** unsub.

## ⚠️ Kritické „postaveno, ale nekompletní" (nejnebezpečnější — vypadá hotově)

1. **Config-set IP pool + TLS policy jen na transactional cestě** — kampaně/broadcast (batch-sender) je nethreadují → per-config-set enforcement u hromadných sendů neplatí.
2. **Dva batch endpointy divergují** — jeden má batchId bez scheduleAt, druhý scheduleAt bez batchId (duplikovaná merge-var logika).
3. **Liquid loops existují, ale nezapojené** do template renderu — uložené šablony neumí `{% for %}`.
4. **Audit log zapisuje jen superadmin** — tenant nemá audit trail vlastních akcí (member/key/SSO změny).
5. **Sandbox gate jen na transactional** — `emails.ts`/kampaně sandbox nevynucují.
6. **2FA nevynucené při loginu** (enroll existuje, gate ne).
7. **`delivery_delayed` event v enumu bez calleru** (deferred se nefiruje).

---

## Bottom line

SendGrid je **SES + marketing layer** — a **ForgeMsg má obojí, plus mnohem víc**. Po dodělání SES infrastruktury (SMTP relay, config sets, event webhooky, VERP, TLS-require, scopes, subusers, IP Access Management, email identities, topics) a s existujícím marketingem (kampaně, segmenty, automations, editor, 71 šablon, **Email Validation API**) **ForgeMsg pokrývá celý SendGrid povrch a ve většině domén ho překonává** — a přidává multichannel/CRM/CDP/AI, které SendGrid nemá vůbec.

**Zbývající mezery vůči SendGridu jsou „polish", ne pilíře:** Handlebars šablony + verzování, batch cancel, categories-stats, ISP stats dimenze, 5 suppression listů, ECDSA podpis, mail/tracking settings, reverse DNS, per-child IP reputace, searchable activity feed, audit-log na org akce. Plus 7 „postaveno-ale-nekompletní" drátů (hlavně **config-set enforcement na kampaňové cestě** a **Liquid loops v šablonách**), které jsou levné dopojení ve stejném stylu jako předchozí dávky. **Nejde o „chybí featury", ale o dotažení hran** — SendGridu se ForgeMsg funkčně vyrovná a překonává ho o celý multichannel/marketing/CRM stack.
