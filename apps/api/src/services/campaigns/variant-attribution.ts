import { sql } from 'drizzle-orm';

/**
 * Which A/B variant a contact was sent, looked up from the send event.
 *
 * Opens and clicks arrive as a signed token carrying orgId, campaignId and
 * contactId — no variant, and no room to add one without changing a token
 * format that is already in recipients' mailboxes. Bounces and complaints have
 * no token at all; they come back over SMTP and FBL.
 *
 * But the send row knows. `campaign-splitter` tags each batch with its variant,
 * batch-sender threads it to the MTA job, and mta-sender puts it on the `send`
 * event. So the variant is recoverable from (campaign_id, contact_id) for every
 * later event about the same message, and this is the scalar subquery that does
 * it — inlined into the INSERT so recording an open stays one round trip.
 *
 * Returns NULL when there is no send row (a non-A/B campaign, or an event that
 * arrived before the send was recorded). NULL is the pre-existing behaviour, so
 * the failure mode is the status quo rather than a broken write.
 *
 * Measured against 2 million email_events rows: 0.069 ms, 4 shared buffers, via
 * `email_events_contact_id_idx`. See the PR for the plan.
 */
export function abVariantForContact(campaignId: string, contactId: string) {
  return sql<string | null>`(
    SELECT prior."ab_variant_id"
    FROM "email_events" prior
    WHERE prior."campaign_id" = ${campaignId}::uuid
      AND prior."contact_id" = ${contactId}::uuid
      AND prior."ab_variant_id" IS NOT NULL
    LIMIT 1
  )`;
}
