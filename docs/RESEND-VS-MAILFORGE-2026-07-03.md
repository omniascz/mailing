# Resend vs ForgeMsg — code-verified parity audit (2026-07-03)

**Metoda:** trasování živých call-chainů v `apps/api/src`, `apps/workers/src`,
`apps/engine` (Go), `packages`. Žádné odhady — každé „hotovo" má citaci
`file:line` živého volání, každý „stub/dark" má důkaz mrtvého drátu. Klíčová
tvrzení byla nezávisle ověřena proti kódu (agentní audity dělají false-negativy).

## Send flow (ověřený, end-to-end)

```
POST /api/v1/emails
  → dispatchResendEmail            (routes/v1/emails.ts:296)
  → sendTransactionalEmail         (lib/queues.ts:149)
  → mtaOtherQueue.add              (lib/queues.ts:160)   [BullMQ, delay pro scheduled_at]
  → worker mta-sender.ts           → gRPC → Go engine (internal/smtp/sender.go)
  → recordEvent POST /internal/events (mta-sender.ts:146)
  → emitEmailEvent → dispatchEvent → org webhooks + pull stream
```

Resend-compat pluginy registrované v `apps/api/src/index.ts:522-527`
(emails, audiences, broadcasts, api-keys, domains).

---

## ✅ DONE-WIRED (zapojeno naživo)

### Core Email API
- **POST /emails** — Resend snake_case schéma: `from, to (string|array), subject,
  html, text, cc, bcc, reply_to, headers, tags, attachments, scheduled_at`
  (`emails.ts:61-89`). Navíc supersety `amp_html`, per-email `tracking`,
  `sandbox_mode`. Dispatch `emails.ts:296`. (`react` není body-field — řeší SDK
  adapter client-side, stejně jako Resend.)
- **POST /emails/batch (≤100)** — `emails.ts:91`, route `315-401`, dispatch per
  položku `385`.
- **GET /emails/:id** — `emails.ts:408-475`; dohydratuje poslední `email_events`
  řádek, vrací `last_event`/`last_event_at`. Bonus **GET /emails** list `481-522`.
- **Idempotency-Key** — Redis `SETEX` 24h, `emails.ts:178-201`; konzumace `251-253`
  (single) + `334-336` (batch).
- **scheduled_at (ISO)** — `z.string().datetime()` `emails.ts:81`; dispatch jako
  BullMQ delayed job `queues.ts:158,187` (`delay: max(0, scheduleAt-now)`).
- **Attachments (base64)** — `filename + content(base64) + content_type +
  content_id/inline` `emails.ts:44-52`, mapováno do MTA jobu `145-151`,
  přeneseno `queues.ts:86-93,183`.
- **Tags** — `name/value` `emails.ts:39-42`, uloženo do event metadata `278`,
  vráceno na GET/:id `469`.
- **Test mode (klíče)** — `fm_test_` prefix `webhooks/index.ts:56`; `apiKeyMode`
  v auth `plugins/auth.ts:77`; test send no-op před MTA `queues.ts:154`;
  `sandbox_mode` body flag ORuje. Reálný no-op (event se zapíše, nic se neodešle).

### Domény (`resend-compat/domains.ts`)
- **CRUD + verify s DKIM/SPF/DMARC** — `domains.ts:104-313`; verify dělá
  **reálné DNS** (`resolveTxt`/`resolveCname` v `services/domains/dns-records.ts:11-12,148-166`,
  `verifyDkimDns` `services/domains/dkim.ts:154`). Return-path record +
  `returnPathVerified` reálné sloupce `domains.ts:90-91,298`.

### API klíče (`resend-compat/api-keys.ts`)
- **Create (full_access/sending_access → scopes) + list + revoke** —
  `api-keys.ts:82-91` mapuje permission na `['emails:send']` vs `['*']`, předává
  `mode` pro test-klíče; raw token vrácen jednou `100`.

### Webhooky / eventy
- **Email lifecycle eventy fire** — `KIND_TO_EVENT` `services/webhooks/email-events.ts:28-41`
  (sent/delivered/opened/clicked/bounced/complained/delivery_delayed/unsubscribed/
  rejected/rendering_failed). Fire-sites: `internal/events.ts:77-84`,
  `tracking.ts:103,215`, `fbl-processor.ts:190`, `subscriptions.ts:466`,
  `topics/index.ts:138`. Enum `db/schema/webhooks.ts:31-44` má i
  `contact.created/updated/deleted`.
- **Podepsané payloady (HMAC)** — `signPayload` + `signPayloadWithTimestamp` na
  každé doručení `services/webhooks/index.ts:344-345`.
- **Managed pull stream** (nad Resend) — `GET /api/v1/events/stream?cursor=`
  (Redis Streams), consumer nemusí hostovat webhook.

### Audiences + Contacts (`resend-compat/audiences.ts`)
- **Audiences CRUD** — `audiences.ts:79-136` (nad `lists`).
- **Kontakty v audience (create/get/update/delete + unsubscribed)** —
  `audiences.ts:140-310`; `unsubscribed` ↔ contact status `71-73,291-293`.

### Broadcasts (`resend-compat/broadcasts.ts`)
- **Create/get/update/delete + send/schedule na audience** — `broadcasts.ts:64-235`
  (nad `campaigns`, `sendCampaign`/`scheduleCampaign` `228-230`).

### SMTP / infra / DX
- **SMTP relay** — Go submission server :587/:465, `AUTH LOGIN/PLAIN`, kredence
  přes API: `apps/engine/internal/submission/server.go:60-65,155-257` +
  `routes/v1/smtp-credentials.ts`.
- **Rate limiting (429)** — `@fastify/rate-limit` 100/min podle `x-api-key`/IP,
  `plugins/rate-limit.ts:5-12`, registrace `index.ts:344`.
- **React Email** — `packages/react-email-adapter` `sendReactEmail` (Resend `react:`
  drop-in). AMP render `services/editor/amp-renderer` (emails.ts:245).
- **Observability** — per-email detail `GET /emails/:id` (`last_event`), list, log
  přes `email_events`.
- **Data residency (region)** — org-level `data_region` + region-correct endpointy
  `services/data-residency/index.ts:33-47`.
- **Dedikované IP** — route `index.ts:432`, service `services/dedicated-ips/index.ts`
  (pooling/PTR/subaccount); `sendingIp`/`tlsPolicy` přes MTA job + config-sets.

---

## ⚠️ STUB-DARK (route/pole existuje, drát je mrtvý)

- **PATCH /emails/:id (reschedule)** — `emails.ts:529-587` mění jen
  `metadata.scheduledAt` na `email_events`. BullMQ delayed job byl zařazen už při
  POST (`queues.ts:187`) s náhodným názvem `txn-<uuid>` (`queues.ts:160`, **bez
  stabilního jobId**) → není co dohledat; `changeDelay()` nikde. Odeslání proběhne
  v původním čase. **Ověřeno: 0 výskytů `changeDelay/getJob/remove` v emails.ts.**
- **Cancel** — implementováno jako **DELETE /emails/:id** (`emails.ts:594-642`),
  ne Resend `POST /emails/:id/cancel`. Nastaví `metadata.cancelled=true`, ale nic
  to nekonzumuje (grep `cancelled` v `apps/workers` = 0) a delayed job se neodstraní
  → „zrušený" scheduled email se stejně odešle.
- **Per-domain open/click toggle** — PATCH přijme `open_tracking`/`click_tracking`
  a zahodí (`domains.ts:208-212`, `void body`, komentář „We don't persist"). 200
  jen pro SDK kontrakt.
- **Per-domain region** — create přijme `region`, ale natvrdo vrací `eu-fra-1`
  (`domains.ts:69`, `137`).
- **Per-email `tracking` flag** — uložen do event metadata `emails.ts:285`, ale
  `dispatchResendEmail` ho nepředává do MTA jobu → na této cestě negatuje
  open/click injekci.

## ❌ MISSING (ověřeno ≥2 synonymy)

- **scheduled_at v přirozeném jazyce** („in 1 hour"/„tomorrow") — jen ISO
  `z.string().datetime()`. Žádný NL parser (grep `chrono|natural|tomorrow` = nic;
  test `editor.test.ts:158` naopak ověřuje, že `'tomorrow'` je odmítnuto).
- **Test sink adresy** (`delivered@ / bounced@ / complained@resend.dev` co simulují
  výsledek) — grep `resend.dev|delivered@|bounced@|simulateBounce` = nic. Test mode
  je jen key-based no-op; sink adresy nesimulují bounce/complaint webhook.
- **Remote attachments přes `path`/URL** — schéma `emails.ts:44-52` má jen base64
  `content`, žádný `path`/`url` ani fetch.
- **Filtr emailů podle tagu** — tagy se ukládají/vrací, ale `GET /emails` nemá
  `?tags=` filtr.

## 🔒 NON-CODE (kódem nedoženeš)

- Alokace/warmup dedikovaných IP **v objemu** + reputace IP/domén — scaffolding je
  (dedicated-ips, `internal/warmup`), ale reálná reputace + inventář IP jsou
  provozní věc, ne kód.
- SOC 2 / ISO, SLA, pricing, šíře a idiomatičnost first-party SDK, hosted svix
  verifier, polished dashboard/logy, dokumentace.

---

## Kde ForgeMsg reálně zaostává za Resendem (ověřeno)

1. **Lifecycle naplánovaného odeslání je dark** — reschedule (PATCH) i cancel
   (DELETE) mění DB řádek, ale nikdy nesáhnou na zařazený BullMQ job (chybí
   stabilní jobId) → ani nepřeplánují, ani nezastaví. **Nejmateriálnější funkční
   mezera.**
2. **Tvar cancel endpointu** — DELETE `/emails/:id` vs Resend `POST
   /emails/:id/cancel`; Resend SDK cancel netrefí.
3. **Bez NL `scheduled_at`** — jen ISO.
4. **Bez sink-adres** (`*@resend.dev`) — nelze nacvičit bounce/complaint webhook.
5. **Bez remote (`path`) attachmentů** — jen base64.
6. **Webhook podpis je custom `sha256=` HMAC, ne svix** — Resend SDK verifier
   nevalidne out-of-the-box.
7. **Per-domain tracking toggle se neukládá** (kosmetické 200).

## Kde ForgeMsg Resend výrazně převyšuje

Resend je transactional-first + lehký marketing. ForgeMsg má navíc: plný
omnichannel (SMS/WhatsApp/RCS/Viber/push/voice), CRM/CDP, workflows/automation,
segmenty, loyalty, ticketing, deliverability tooling (seed testy, reputace,
warmup), config sets, VERP, Ed25519 DKIM, managed pull event stream — nic z toho
Resend nedělá.

**Závěr:** Resend-compat vrstva je široká a skutečně zapojená. Reálné mezery jsou
úzké a soustředěné do **lifecyclu naplánovaného odeslání** (bod 1–2) + několika DX
detailů (3–7). Zbytek Resend náskoku je non-code (SDK, docs, svix, reputace).
