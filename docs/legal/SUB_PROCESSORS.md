# Sub-processor list

> Effective from: 2026-05-19
> Customer-facing — published at `/legal/sub-processors` once the
> public docs site (Phase UI 10) is live.
> Audience: data-protection officers at customer orgs reviewing
> Mailforge's processing chain under GDPR Art. 28(2) + Art. 28(4).

Mailforge ("processor") engages the sub-processors below to operate
the service for customers ("controllers"). All sub-processors are
contractually bound to data-protection obligations no less protective
than those between Mailforge and the customer.

Mailforge will give customers at least **30 days' notice** before
adding or replacing a sub-processor that processes personal data.
Notification channel: in-app banner + the email registered as the
account's data-protection contact. Customers may object in writing
within the notice window; we'll work in good faith to resolve, and
either party can terminate without penalty if no resolution emerges.

This list is the **complete** set of sub-processors as of the
effective date above. Storage and transmission of personal data
across Mailforge's own infrastructure (Postgres, ClickHouse, Redis,
Kafka) is **not** sub-processing — that is Mailforge's own processing.

---

## Active sub-processors

### Hetzner Online GmbH

- **Purpose**: Primary infrastructure (bare-metal MTA servers, Hetzner
  Cloud servers running api / workers / databases). Stores all
  contact records, campaign content, event logs.
- **Categories of personal data**: contact identifiers (email, phone,
  name), campaign-engagement events (open/click), behavioral metadata
  (IP, user-agent at email open).
- **Hosting region**: Falkenstein (DE) + Helsinki (FI). EU-only.
- **Transfer mechanism**: Intra-EU; no Art. 46 transfer mechanism needed.
- **Engagement contract**: Hetzner standard DPA + AVV
  (Auftragsverarbeitungsvertrag) under §28 BDSG.
- **DPO contact**: `datenschutz@hetzner.com`.

### Vercel Inc.

- **Purpose**: Frontend hosting for `apps/web` (Next.js). Receives
  HTTP request metadata (IP, user-agent) at edge when a logged-in
  user loads the dashboard. Does **not** process recipient personal
  data — recipients never visit Vercel-hosted URLs.
- **Categories of personal data**: logged-in admin/operator personal
  data only (IP, user-agent, optionally first-name surfaced in UI).
  Recipient data stays on Hetzner.
- **Hosting region**: Frankfurt edge node pinned via project config;
  Vercel may shift edge routing to other EU nodes (Stockholm, Dublin).
- **Transfer mechanism**: Vercel publishes Data Processing Addendum +
  EU SCCs covering any incidental US transfer (e.g. control-plane
  metadata).
- **Engagement contract**: Vercel standard DPA + EU SCCs.
- **DPO contact**: `privacy@vercel.com`.

### Cloudflare, Inc.

- **Purpose**: DNS (mailforge.io zone), CDN for static assets,
  Workers (tracking pixel + click redirect endpoints). Acts as a
  TLS-terminating proxy; receives recipient IP + user-agent when an
  email is opened or a link is clicked, forwards to Hetzner-hosted
  Mailforge endpoint for event logging.
- **Categories of personal data**: recipient IP address, user-agent
  string, tracking-token payload (orgId, campaignId, contactId).
- **Hosting region**: Cloudflare's global anycast network. Edge POPs
  serve from the geographically closest node to the recipient.
- **Transfer mechanism**: Cloudflare published DPA + EU SCCs. EU
  recipients are typically served from EU POPs (Frankfurt, Amsterdam).
- **Engagement contract**: Cloudflare standard DPA + EU SCCs.
- **DPO contact**: `dpo@cloudflare.com`.

### Anthropic, PBC

- **Purpose**: Powers the AI features (subject-line suggestions,
  copywriting assistance, accessibility audit, spam-score advice).
  Prompts pass through Anthropic's API and may include excerpts of
  campaign content authored by the customer.
- **Categories of personal data**: typically **none** — customers
  draft generic marketing copy; merge tags are not resolved before
  AI inference. If a customer pastes recipient-specific data into a
  prompt manually, that text flows through Anthropic.
- **Hosting region**: United States.
- **Transfer mechanism**: Anthropic published DPA + EU SCCs +
  Anthropic does not retain prompt content beyond the inference
  request unless the customer opts into trace retention (off by
  default at the Mailforge account level).
- **Engagement contract**: Anthropic standard DPA + EU SCCs.
- **DPO contact**: `privacy@anthropic.com`.

### Stripe Payments Europe Ltd.

- **Purpose**: Subscription billing for paid Mailforge plans.
  Customer-side payment data only — never receives recipient personal
  data from the customer's contact list.
- **Categories of personal data**: customer account billing identity
  (company name, billing email, billing address, card last-4,
  cardholder name). Recipients of campaigns are never sent to Stripe.
- **Hosting region**: Ireland (EU Stripe entity).
- **Transfer mechanism**: Intra-EU.
- **Engagement contract**: Stripe Data Processing Agreement.
- **DPO contact**: `dpo@stripe.com`.

### Bulkgate s.r.o.

- **Purpose**: SMS gateway (CZ/SK SMS delivery). Used only when the
  customer enables the SMS channel and a campaign sends SMS. Recipient
  phone number + message body are passed through.
- **Categories of personal data**: recipient phone number (E.164),
  SMS message body (may contain merge-tag-resolved personal data).
- **Hosting region**: Czech Republic.
- **Transfer mechanism**: Intra-EU.
- **Engagement contract**: Bulkgate standard DPA under CZ data
  protection law + GDPR Art. 28.
- **DPO contact**: `info@bulkgate.com`.

### Twilio Inc. (used only for voice + non-CZ/SK SMS)

- **Purpose**: AI voice robot calling (Phase 8 feature); fallback
  SMS gateway for routes Bulkgate doesn't cover. Used only when the
  customer enables voice/SMS and a campaign sends a call/SMS to a
  recipient routed via Twilio.
- **Categories of personal data**: recipient phone number, voice
  call transcript (when the customer enables transcription),
  optionally call recording (off by default).
- **Hosting region**: Ireland (Twilio EU entity for EU traffic).
- **Transfer mechanism**: Twilio EU entity handles EU recipient
  traffic. EU SCCs for any control-plane US transfer.
- **Engagement contract**: Twilio standard DPA + EU SCCs.
- **DPO contact**: `privacy@twilio.com`.

### Deepgram, Inc. (voice STT — Phase 8+)

- **Purpose**: Real-time speech-to-text for the AI voice robot.
  Audio stream passes through during a live call.
- **Categories of personal data**: recipient voice audio + resulting
  transcript text.
- **Hosting region**: United States. Mailforge will move to an EU
  alternative (Aalto / Speechmatics EU) once volume justifies the
  contract, target end of 2027.
- **Transfer mechanism**: Deepgram published DPA + EU SCCs.
- **Engagement contract**: Deepgram standard DPA + EU SCCs.
- **DPO contact**: `privacy@deepgram.com`.

### ElevenLabs, Inc. (voice TTS — Phase 8+)

- **Purpose**: Text-to-speech voice synthesis for the AI voice robot.
  Synthesised audio is streamed back to the customer's recipient.
- **Categories of personal data**: usually none — the prompt is a
  script the customer authored. Merge tags resolve **before** the
  prompt leaves Mailforge, so the recipient's first name (etc.)
  reaches ElevenLabs as part of the synthesis input.
- **Hosting region**: United States.
- **Transfer mechanism**: ElevenLabs published DPA + EU SCCs.
- **Engagement contract**: ElevenLabs standard DPA + EU SCCs.
- **DPO contact**: `privacy@elevenlabs.io`.

### Better Stack (Logtail) by Better Stack s.r.o.

- **Purpose**: Application logs + uptime monitoring. Application logs
  may contain operator identifiers but not recipient personal data
  (we log structurally and redact PII at the source).
- **Categories of personal data**: operator user IDs, request IDs,
  IP addresses tied to admin operations.
- **Hosting region**: Czech Republic + EU edge.
- **Transfer mechanism**: Intra-EU.
- **Engagement contract**: Better Stack standard DPA.
- **DPO contact**: `gdpr@betterstack.com`.

### Sentry (Functional Software, Inc.)

- **Purpose**: Frontend + backend error tracking. Stack traces +
  request metadata at the moment of an exception.
- **Categories of personal data**: when an exception happens during
  request processing, the IP + user-agent of the originating request
  are captured along with operator/user IDs. Recipient personal data
  is **not** in stack traces.
- **Hosting region**: Frankfurt (Sentry EU deployment).
- **Transfer mechanism**: Sentry SaaS EU instance — intra-EU.
- **Engagement contract**: Sentry standard DPA + EU SCCs (covers
  the residual US control-plane).
- **DPO contact**: `privacy@sentry.io`.

### Grafana Labs (Grafana Cloud)

- **Purpose**: Metrics + log aggregation (Prometheus, Loki, Tempo)
  for infrastructure observability. Sees server metrics + system
  logs only.
- **Categories of personal data**: typically none — system metrics
  are aggregate counters/histograms. Logs may incidentally carry
  user IDs in audit-style entries.
- **Hosting region**: EU stack (Frankfurt) pinned via Grafana Cloud
  org settings.
- **Transfer mechanism**: Intra-EU.
- **Engagement contract**: Grafana Cloud standard DPA + EU SCCs.
- **DPO contact**: `privacy@grafana.com`.

---

## Customer-controlled sub-processors

If the customer enables a third-party integration on their Mailforge
account (Shopify / Shoptet / Klaviyo migration source / Sklik / Meta
audience sync / Google Ads / etc.), that integration's provider
becomes a sub-processor under the **customer's** own controller
relationship — not Mailforge's. Mailforge facilitates the data flow
on the customer's instruction; the customer remains the controller
for that flow.

Mailforge does not list those integrations here because the customer
chooses them on a per-account basis, and the legal relationship runs
customer ↔ third party directly.

---

## How we notify of changes

When we add, remove, or replace a sub-processor we:

1. Publish the change to this page (Git-versioned — every diff is
   reviewable).
2. Trigger an in-app banner for org admins, persistent until
   acknowledged.
3. Send an email to the registered data-protection contact at each
   active account (the role-based address configured in account
   settings; we fall back to the owner email).

The 30-day notice window begins on the date of email delivery.
Customers may object by responding to that email; Mailforge will
respond within 5 business days to either propose an alternative or,
in cases where no alternative is feasible, accept termination
without penalty.

---

*Owner: Mailforge legal + DPO team*
*Last updated: 2026-05-19*
*Sub-processor change log: `/legal/sub-processors/CHANGELOG.md` (TBD
once the docs site is live).*
