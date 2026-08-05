# Webhook events

Every event MailForge can send you, when it fires, and what it carries.

Subscribe by passing event names to `POST /api/v1/webhooks`:

```json
{ "url": "https://example.com/hooks/forgemsg", "events": ["contact.created", "email.opened"] }
```

`GET /api/v1/webhooks/events` returns the same list this page documents.

## Envelope

Every delivery has the same outer shape. The event-specific fields are always
under `data`.

```json
{
  "event": "contact.created",
  "orgId": "7d568e5a-386a-4d72-83ee-f07492575f0e",
  "timestamp": "2026-08-05T09:41:12.004Z",
  "data": { "...": "see below" }
}
```

`timestamp` is when the event was raised, not when this delivery attempt was
made — retries carry the original. Use `X-ForgeMsg-Delivery` as the
idempotency key; see [verifying-signatures.md](./verifying-signatures.md) for
the headers.

Fields are nullable rather than absent when the underlying value can be
missing: a contact may genuinely have no email, and `"email": null` says so,
whereas a missing key would be indistinguishable from a bug on our side.

---

## Contacts

### `contact.created`

A contact was created, one at a time.

```json
{
  "id": "0f6c…",
  "email": "jana@example.com",
  "firstName": "Jana",
  "lastName": "Nováková",
  "phone": null,
  "status": "active",
  "createdAt": "2026-08-05T09:41:11.882Z",
  "source": "signup_form"
}
```

`source` is one of `api`, `zapier`, `signup_form`, `sms_keyword`, `inbox`,
`ticketing`, `lead_ad`, `calendly`, `cdp`.

**Bulk imports do not emit this event.** CSV import, the Mailchimp / Klaviyo /
Ecomail / SmartEmailing migrations, e-shop and CRM sync (Shoptet, Upgates,
HubSpot, Raynet, Salesforce), CDP source sync and sandbox seeding all create
contacts without emitting. A 100 000-row import would otherwise mean 100 000
HTTP deliveries to your endpoint, which helps nobody. If you need to react to
an import, poll `GET /api/v1/contacts` with a `createdAt` cursor.

### `contact.updated`

A contact's fields changed. Same shape as `contact.created`, with `changed`
instead of `source`:

```json
{
  "id": "0f6c…",
  "email": "jana@example.com",
  "firstName": "Jana",
  "lastName": "Nováková",
  "phone": null,
  "status": "active",
  "createdAt": "…",
  "changed": ["firstName", "status"]
}
```

`changed` lists the field names the update touched. It fires for the VIP
toggle, archive and unarchive too, since those are updates.

### `contact.deleted`

A contact was deleted. Deletion is soft — the row is retained with `deletedAt`
set — so only the identifiers are carried; everything else is no longer
current information.

```json
{ "id": "0f6c…", "email": "jana@example.com" }
```

---

## Campaigns

### `campaign.sent`

A campaign finished sending: emitted when the campaign is marked `sent`, which
happens after the last batch completes.

```json
{
  "campaignId": "a41e…",
  "name": "Srpnový newsletter",
  "subject": "Novinky ze srpna",
  "type": "email",
  "recipientCount": 12480,
  "sentAt": "2026-08-05T09:40:58.113Z"
}
```

**Caveat on SMS, WhatsApp and push.** Those channels mark a campaign `sent` as
soon as the messages are queued rather than delivered, so on those channels the
event is early. That is a lifecycle bug in the channel dispatcher, not
something the event can correct; it is documented here rather than hidden.

---

## Email lifecycle

Twelve events, all carrying the same field set. Which fields are populated
depends on what the sending path knew:

| Field        | Meaning                                           |
| ------------ | ------------------------------------------------- |
| `messageId`  | Our message id, matching the `Message-ID` header. |
| `contactId`  | The recipient, when the send was contact-scoped.  |
| `campaignId` | The campaign, when the send was part of one.      |
| `email`      | The recipient address.                            |

Providers attach extras on top — `bounceType` on a bounce, `url` on a click,
`feedbackId` on a complaint, `topicId` on a group (un)subscribe.

| Event                     | Fires when                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `email.sent`              | We handed the message to the MTA.                               |
| `email.delivered`         | The receiving server accepted it.                               |
| `email.opened`            | The tracking pixel was loaded.                                  |
| `email.clicked`           | A tracked link was followed.                                    |
| `email.bounced`           | Delivery failed permanently or the receiver rejected it.        |
| `email.unsubscribed`      | The recipient unsubscribed.                                     |
| `email.complained`        | A feedback loop reported it as spam.                            |
| `email.rejected`          | We refused to send — the address is on your suppression list.   |
| `email.rendering_failed`  | The template could not be rendered, so nothing was sent.        |
| `email.delivery_delayed`  | The receiving server deferred; we will keep trying.             |
| `email.group_unsubscribe` | The recipient left one subscription topic rather than all mail. |
| `email.group_resubscribe` | The recipient rejoined a topic.                                 |

```json
{
  "messageId": "01J…",
  "contactId": "0f6c…",
  "campaignId": "a41e…",
  "email": "jana@example.com",
  "bounceType": "hard"
}
```

---

## SMS

### `sms.delivered` / `sms.failed`

Emitted when a provider delivery report reaches us and reports a terminal
outcome. Intermediate states (`queued`, `sent`) are not events — the contract
has no name for them.

```json
{
  "providerMessageId": "SM8f…",
  "provider": "twilio",
  "to": "+420777123456",
  "contactId": "0f6c…",
  "campaignId": null
}
```

`sms.failed` carries one more field, `reason`, which is the provider's own
message where one was supplied and `null` otherwise.

Delivery reports arrive from Bulkgate (`/api/v1/sms/webhooks/bulkgate/dlr`) and
Twilio (`/api/v1/sms/webhooks/twilio/status`); both vocabularies are normalised
before the event is raised, so you see `delivered`/`failed` regardless of
provider.

---

## Workflows

### `workflow.completed`

A workflow run reached its end.

```json
{
  "workflowId": "88ab…",
  "runId": "c910…",
  "contactId": "0f6c…",
  "completedAt": "2026-08-05T09:39:02.771Z"
}
```

A run that errors out is **not** reported. There is no `workflow.failed` in the
contract, and emitting `completed` for a failure would be a lie.

---

## Billing

### `usage.alert`

Plan usage crossed a threshold — 80 %, 95 % or 100 % of your monthly send or
contact allowance. Deduplicated per billing period, so each threshold fires
once.

```json
{ "metric": "sends", "threshold": 80, "pctUsed": 82.4, "current": 41200, "limit": 50000 }
```

---

## How this list stays honest

Two checks, both enforced by CI:

- **Every event has a payload type.** `WebhookEventPayloads` in
  `apps/api/src/services/webhooks/payloads.ts` is keyed by the event name, and
  `dispatchEvent` is generic over it, so an emitter that sends the wrong shape
  does not compile. A type-level assertion fails the build if the map and
  `WEBHOOK_EVENTS` ever diverge.
- **Every event has an emitter.**
  `apps/api/src/services/webhooks/event-coverage.test.ts` parses `src/` with
  the TypeScript compiler and fails if any event in `WEBHOOK_EVENTS` is never
  passed to `dispatchEvent` or `emitWebhookEvent`.

The second check exists because six of these events — `contact.updated`,
`contact.deleted`, `campaign.sent`, `sms.delivered`, `sms.failed`,
`workflow.completed` — were subscribable for the whole life of the feature and
never fired once.
