# Migration Cutover Guide

> Audience: org admins switching to Mailforge from Mailchimp, Klaviyo,
> Ecomail, SmartEmailing, or Brevo.
> Status: customer-facing reference, lives at `/docs/migrations/cutover`
> once the docs site (Phase UI 10) ships. Until then, internal/CSM use.

Migrating an active sender is not "click import → send next campaign."
Doing it wrong can sink your deliverability for weeks. This guide walks
through the order of operations we recommend and the rails Mailforge
puts in place to keep your sender reputation intact.

---

## 1. Pre-cutover checklist (T-7 to T-2 days)

Run through these **before** touching anything in production. Most
problems we see come from skipping this list.

### Account state
- [ ] List of every sender domain currently in use (look at the **From:**
      headers on the last 30 days of sends).
- [ ] Note your current daily / monthly send volume from the source
      platform's reporting. Mailforge will need to warm up to match.
- [ ] Export the most recent suppression list (hard bounces + spam
      complaints + manual unsubscribes) as a CSV. **Do not skip this.**
      Re-emailing previously suppressed contacts is the single fastest
      way to torch your reputation.
- [ ] Document any active automation flows that will need to be
      re-built in Mailforge (or paused during cutover).
- [ ] Identify the 3–5 highest-value transactional sends (password
      reset, order confirmation, etc.) — these get cut over **last**,
      not first.

### Compliance + audit
- [ ] Verify your privacy policy + cookie banner references the new
      processor (Mailforge) before any consent-bearing forms are
      switched over.
- [ ] If you operate under GDPR / CCPA / CAN-SPAM, confirm your DPA
      with Mailforge is signed. Imported contacts retain their original
      `consent_at` timestamp on `customFields.imported_consent_at` so
      the audit trail survives the move.

### Technical
- [ ] Mailforge admin account created, organization configured.
- [ ] You have **write** access to the DNS zone for every sender domain.
      (CNAME / TXT / MX edits aren't optional — if you can't change DNS
      you can't migrate.)
- [ ] You have **export** access on the source platform's API. Klaviyo
      and Mailchimp throttle aggressively at the free tier; for large
      lists you may need a paid plan for the duration of the migration.

---

## 2. Day-of plan (T-0)

### Hour 0 — Import
1. Open Mailforge → Migrations → "Start import from {source}".
2. Paste your source-platform API key (Mailchimp / Klaviyo / Ecomail /
   SmartEmailing). For SmartEmailing, also supply the account username.
3. Background job runs `GET /lists` → per-list paginated `GET /subscribers`,
   ingesting up to ~10K contacts/minute depending on source API limits.
4. While it runs, the migration page shows progress per list and a
   running tally of `imported` / `skipped` / `errors`.

What Mailforge **automatically** does at import:
- Lower-cases + trims every email so dedup works across CRMs.
- Drops `hard_bounce` and `spam_complaint` records before they ever
  reach the contacts table.
- Preserves the original consent timestamp on the contact under
  `customFields.imported_consent_at` (audit-traceable).
- Maps source-side status to Mailforge state — `subscribed` /
  `confirmed` → `active`, everything else → `unsubscribed`.

What it **does not** do (you do these next):
- Re-subscribe `NEVER_SUBSCRIBED` profiles. Never assume implicit consent.
- Import templates. (Sprint C scope is contacts + lists only; the
  template-import endpoint lands in a follow-up sprint.)
- Import campaigns. Send history lives on the source platform.

### Hour 1 — Suppression list

This is the step orgs most often skip. **Don't.**

1. Export the suppression list from your source platform as CSV (one
   email per row, with a reason if available).
2. Mailforge → Suppressions → Import → upload CSV.
3. Mailforge inserts each row into `suppressions` with `reason: 'imported'`.
4. The batch sender now treats these emails as hard-bounced for all
   future sends — exactly as your old platform did.

If you re-import contacts later (e.g. nightly Shopify sync), the
suppression list still wins. Suppressions are per-org and survive
contact deletes.

### Hour 2 — Sender domain authentication

You have two strategies; pick one before sending anything.

**Strategy A — Branded subdomain (recommended).**
Your customers see `mail.your-domain.com` in From and Return-Path; your
brand benefits from any reputation Mailforge builds on shared IPs.

1. Mailforge → Domains → Add → `your-domain.com`.
2. Mailforge generates DKIM keypair + selector (`fm1` default), spits out
   four DNS records: SPF include, DKIM TXT, DMARC TXT, Return-Path CNAME.
3. Add the records to your DNS provider. Wait 5–15 minutes for propagation.
4. Click "Verify" — Mailforge polls DNS until all four flip green.
5. Optional: configure `mailSubdomain` (e.g. `mail.your-domain.com`) and
   verify it too. Mailforge then signs from that subdomain and routes
   tracking pixels + click redirects through it — your recipients see
   `your-domain.com` everywhere, not `mailforge.io`.

**Strategy B — Mailforge-hosted subdomain.**
Faster setup but `forgemsg.com` shows in some headers. Fine for early
beta sends; revisit when you have time for DNS.

### Hour 3 — Send a test batch

1. Pick a small **friendly** segment (10–50 contacts you know
   personally). **Not** a real list.
2. Build one Regular campaign. Send.
3. Confirm:
   - Inbox placement: Gmail Promotions tab is fine; Spam folder is not.
   - DKIM-signed (check via "Show original" in Gmail).
   - Click + open tracking fire (open the email, click a link, refresh
     the Mailforge campaign report — events arrive within 60s).
4. Only if all three pass, move to Hour 4.

If something doesn't pass, **stop**. Don't keep sending. Open a support
ticket with the exact rendered HTML and one of the test recipients'
emails — we'll triage same-day.

### Hour 4–48 — IP warmup

New sender on a new platform = unknown reputation. Mailforge applies
hourly token-bucket throttles per ISP that gradually relax over your
first 7–14 days of sending. You don't have to do anything — the
default schedule is conservative.

For high-volume orgs (>500K sends/day on the source), email
`support@mailforge.io` after Hour 3 — we'll allocate a dedicated IP
and schedule a managed warm-up against your historical volume.

---

## 3. Parallel sending (the 7–14 day window)

The cleanest cutover is **not** a clean cutover. For 1–2 weeks after
you migrate, keep the source platform's contract active and send half
your campaigns from each side. Why:

- ISP filters watch for sudden sender-platform changes. A gradual ramp
  on Mailforge while the old platform tapers off looks natural; a 100%
  switch on Day 0 looks suspicious.
- You get an apples-to-apples deliverability comparison. If Mailforge
  underperforms your old platform on Gmail or Outlook, the parallel
  window is when you'd catch it.
- Rollback is trivial: if anything goes wrong, just keep sending from
  the old platform while we diagnose.

Practical pattern:
- Days 1–3: 10% of broadcasts on Mailforge, 90% on the old platform.
- Days 4–7: 30/70.
- Days 8–10: 50/50.
- Days 11–14: 70/30.
- Day 15+: 100% Mailforge if reports look good.

Transactional sends (receipts, password resets) stay on the **old
platform until last** — they have the highest engagement rate and
killing them hurts your sender reputation more than killing marketing.
Cut transactional over only after Day 15+ when marketing is stable.

---

## 4. Rollback

If the cutover goes sideways within 24 hours, Mailforge supports a
one-click rollback of any completed migration:

```
POST /api/v1/migrations/{jobId}/rollback
Body: {}
```

What it does:
- Soft-deletes every contact this job introduced (filtered by
  `customFields.imported_from = {source}` AND createdAt within the job
  window — a later re-import from the same source isn't touched).
- Contacts that already received a campaign send are **skipped by
  default** (orphaning analytics is worse than the rollback win).
  Override with `{ "includeSent": true }` during the same campaign run.
- Job row flips to `rolled_back` so the decision is audit-traceable;
  progress.rollback annotated with deleted count + timestamp.

**Limits:**
- Window: 24 hours after `completedAt`. Pass `{ "force": true }` to
  override (admin/owner role required).
- Only `completed` and `failed` jobs are eligible. A running job must
  be `cancelled` first (separate endpoint, follow-up sprint).
- Lists are **not** rolled back. They're cheap to keep, and the user
  may want them empty for future imports. Delete manually if not.

---

## 5. Common pitfalls

### "My open rates dropped 50% on Day 1"
Almost always Apple Mail Privacy Protection (MPP) timing, not real
engagement loss. Mailforge logs both raw opens and bot-filtered opens
(MPP-aware) on every campaign — compare the second metric across
platforms for a real signal.

### "Gmail puts everything in Promotions"
Expected for marketing sends during the first 30 days on a new
sending pattern. Engagement (opens + clicks + replies) over the
warm-up period is what moves you out. Don't fight it by changing
subject lines daily; consistency wins.

### "Some contacts came in as 'unsubscribed' but they're active in {source}"
Check `customFields.imported_consent_status` on the contact in
Mailforge — it's the verbatim string from the source. The most common
cause is Klaviyo's `NEVER_SUBSCRIBED` profiles (people who landed in
the account via behavioral tracking but never explicitly opted in).
We import them as `unsubscribed` deliberately; you can re-opt them in
with a permission-pass campaign.

### "Missing DKIM signature on test sends"
Mailforge only signs once the sending domain's `dkimVerified` flag
flips true (after DNS propagation). Until then, sends go out unsigned
and Gmail will reject them silently after a few hours. Verify the
domain before sending more than a friendly test batch.

### "My automation in {source} isn't running in Mailforge"
Sprint C scope is contacts + lists. Automation translation is a
separate sprint (Sprint D + UI). For now: re-build flows manually in
Mailforge → Workflows, or pause them in the source platform until we
ship the auto-translator.

### "I re-imported and now I have duplicate contacts"
You shouldn't — every connector uses `ON CONFLICT (org_id, email) DO
UPDATE`. If you see duplicates check the **case** of the email: the
mapper lowercases on import, but if a contact was added manually
elsewhere with `Mixed.Case@Example.cz`, the older row may live with
the original casing. The list-hygiene tool (`/api/v1/list-hygiene/
duplicates`) finds these.

---

## 6. Day 15+ ongoing health

Once you're 100% on Mailforge:
- **Daily**: glance at Domains → Reputation panel. Gmail's domain
  reputation score is the leading indicator; if it dips below "High,"
  pause new campaigns and audit recent sends.
- **Weekly**: review `/api/v1/deliverability/insights` — Mailforge's
  rules engine surfaces specific issues (rising soft-bounce rate,
  DMARC alignment failures) with explicit fix instructions per rule.
- **Monthly**: rotate DKIM keys (`fm1` → `fm2`). Sprint B.4 + B.6
  shipped the rotation primitives; the wizard ships in Phase UI.

---

## 7. When to call support

- Any test batch lands in the spam folder consistently.
- Domain verification stuck on one record for >2 hours after DNS edit
  (TTL caching usually catches up in 15min, sometimes 4–6h on cold
  resolvers; longer suggests a typo).
- Mailforge support catches a `volume_spike` or `list_quality_low`
  signal on your account — these auto-throttle by default, and the
  email walks through how to release.
- You're attempting cutover for >500K contacts or >50K daily sends.
  Managed cutover is included on Pro+ plans.

---

*Owner: Mailforge CSM team*
*Last updated: 2026-05-19*
*Source corpus: MAILFORGE_FINDING_REPORT §60, EMAIL_DEEP_ANALYSIS §C.13,
data/60_Migration_Scenarios.md*
