# MailForge vs Resend

> Source content for `mailforge.io/vs/resend`. Pure markdown — the
> marketing-site renderer pulls headings + tables + code blocks
> directly. Update here and the site picks it up on next deploy.

## TL;DR

Resend is the best-in-class transactional API for developers. MailForge
is everything Resend gives you plus marketing automation, workflows,
multi-channel (SMS + WhatsApp + voice), AI features, and CZ/SK
localisation — at the same transactional price tier.

If you only ever send `password_reset` + `welcome` emails, Resend is a
great choice. If you might one day need broadcasts, segments, workflows,
or non-email channels, MailForge gets you both.

## 30-second comparison

|                                                  | **MailForge**                      | **Resend**               |
| ------------------------------------------------ | ---------------------------------- | ------------------------ |
| Transactional API                                | ✅ Resend-compatible shape         | ✅                       |
| React Email support                              | ✅ via `@forgemsg/react-email`     | ✅                       |
| Next.js SDK                                      | ✅ `@forgemsg/next`                | ✅ `resend`              |
| Idempotency-Key                                  | ✅                                 | ✅                       |
| Batch send (≤ 100/request)                       | ✅                                 | ✅                       |
| Attachments                                      | ✅                                 | ✅                       |
| Scheduled send                                   | ✅                                 | ✅                       |
| Webhooks (delivered/bounce/complaint/open/click) | ✅                                 | ✅                       |
| Domain verification (SPF/DKIM/DMARC)             | ✅                                 | ✅                       |
| Custom tracking domain                           | ✅                                 | ✅                       |
| Marketing campaigns                              | ✅ Full builder                    | ⚠️ Basic broadcasts      |
| Drag-and-drop block editor                       | ✅                                 | ❌                       |
| Workflows / automation                           | ✅ React Flow canvas               | ❌                       |
| Segments (boolean + behavioural)                 | ✅                                 | ❌                       |
| RFM + CLV + churn prediction                     | ✅                                 | ❌                       |
| Engagement Score                                 | ✅ proprietary                     | ❌                       |
| Channel Scoring per recipient                    | ✅                                 | ❌                       |
| Cross-channel frequency cap                      | ✅                                 | ❌                       |
| SMS                                              | ✅ pass-through Twilio + 2× markup | ❌                       |
| WhatsApp Business                                | ✅                                 | ❌                       |
| Voice agent (Claude + ElevenLabs)                | ✅                                 | ❌                       |
| AI features (subject, body, sentiment, NL→SQL)   | ✅ Claude included                 | ❌                       |
| Shoptet / Upgates / Shopify                      | ✅ native                          | ❌                       |
| Czech / Slovak localisation                      | ✅ vokativ + jmeniny + ISDOC       | ❌                       |
| EU data residency default                        | ✅ Frankfurt                       | ⚠️ via region            |
| Free tier                                        | 500 contacts / 2 500 emails        | 3 000 emails / 100 a day |
| Transactional 50K emails                         | €19 / mo (Send Starter)            | $20 / mo                 |
| Marketing 50K contacts                           | €129 / mo (Business)               | not offered              |

## Drop-in code migration

The shape of `emails.send` is identical. Replace the import:

```diff
- import { Resend } from 'resend';
- const resend = new Resend(process.env.RESEND_API_KEY);
+ import { mailforge as resend } from '@forgemsg/next';
```

Everything else — `from`, `to`, `subject`, `html`, `text`, `cc`, `bcc`,
`reply_to`, `headers`, `tags`, `attachments`, `scheduled_at`,
`Idempotency-Key` header — keeps the same names and behaviours.

### React Email

```diff
- import { Resend } from 'resend';
- const resend = new Resend(process.env.RESEND_API_KEY);
+ import { mailforge } from '@forgemsg/next';
+ import { sendReactEmail } from '@forgemsg/react-email';
import OrderReceipt from './emails/order-receipt';

- await resend.emails.send({
-   from: 'orders@your.com',
-   to: 'jane@example.com',
-   subject: 'Your receipt',
-   react: <OrderReceipt orderId="123" />,
- });
+ await sendReactEmail(mailforge, {
+   from: 'orders@your.com',
+   to: 'jane@example.com',
+   subject: 'Your receipt',
+   react: <OrderReceipt orderId="123" />,
+ });
```

Same templates, same components, same output. Idempotency keys, batch
send, attachments — all unchanged.

## When Resend is the better pick

- You only ever send transactional email — no broadcasts, no automation.
- You're hard-bound to Resend's React Email ecosystem and don't want a
  wrapper.
- You don't care about CZ/SK localisation, multi-channel, or AI features.
- You have an existing volume contract with Resend and re-negotiation
  isn't worth the migration time.

For those teams, Resend is excellent and we won't try to convert you.

## When MailForge is the better pick

- You send transactional **and** want broadcasts / drips later — no
  second tool to integrate.
- You'd like predictive churn / CLV / engagement scores on the same
  contacts you message.
- You need SMS, WhatsApp, or voice as part of the customer journey.
- You're EU-headquartered and need data residency without an upsell.
- You serve the Czech / Slovak market.
- You want Claude included in the price, not an add-on.

## Pricing comparison at common volumes

| Monthly emails | **MailForge Send Starter** | **Resend Pro** |
| -------------- | -------------------------- | -------------- |
| 10 000         | €9 (Send Lite)             | $20            |
| 50 000         | €19 (Send Starter)         | $20            |
| 200 000        | €59 (Send Growth)          | $90 (Business) |
| 1 000 000      | €189 (Send Pro)            | $200 (Scale)   |

If you also want marketing features (contacts, segments, workflows),
MailForge's contact-based plans include them at no extra cost.
Resend doesn't offer that combination.

## Reliability story

- Both run multi-region, multi-cloud.
- Both publish DKIM + SPF + DMARC tooling.
- Both have FBL setup for major ISPs.
- MailForge runs its own Go MTA — `apps/engine` in the open-source
  repo, dedicated /29 subnet per data centre, CZ-specific buckets for
  Seznam / Volný / Centrum.
- Resend builds on top of AWS SES.

Different architectures, both proven. Use whichever you can audit more
easily.

## Migration tools

- `mailforge.io/migrate-from-resend` — one-click contact + suppression
  import via Resend's API key.
- `@forgemsg/react-email` — drop-in adapter so existing templates work
  without changes.
- Side-by-side mode: keep Resend live for current senders while
  migrating new traffic to MailForge over 14 days.

## What you can't easily migrate

- Resend Broadcasts → MailForge Campaigns: the data model is richer on
  our side (segments, A/B, throttling) so we re-import as templates and
  let you re-author. ~30 min of work for a typical 20-broadcast account.
- Per-sub-account API keys: if you have a multi-tenant Resend setup,
  contact us — we have a specific migration path.

## FAQ

**Is `emails.send` actually 1:1 with Resend?**
Yes. Same field names (`reply_to`, `scheduled_at` etc.), same
`Idempotency-Key` header, same `{ id, from, to, subject, created_at }`
return shape. If you find a divergence, it's a bug — file an issue.

**Will Resend customers feel the migration?**
Only the import statement changes. We tested with the top-50 React
Email components and they render byte-identical to Resend's pipeline.

**What about Resend's audience / contacts API?**
We have a richer one (`@forgemsg/sdk` exposes `client.contacts`).
Existing Resend audience exports import in one call.

**Is the pricing actually fair at scale?**
We publish the maths. SES has gross pricing of $0.10/1k emails; we sit
above that for the engineering layer + AI included. At 1M emails/mo
our Send Pro tier ($210 USD-equivalent) is competitive with Resend
Scale ($200) and beats it once you factor in workflows + segments.
