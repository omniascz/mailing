/**
 * Webhook delivery service (task 6.2).
 *
 * - Webhooks subscribe to named events.
 * - dispatchEvent() finds matching webhooks and queues a delivery job.
 * - deliverWebhook() signs the payload and POSTs it, recording the result.
 * - Failed deliveries are retried with exponential back-off (max 5 attempts).
 *
 * Signature format (compatible with GitHub / Stripe):
 *   X-ForgeMsg-Signature: sha256=<hex(HMAC-SHA256(secret, JSON_payload))>
 *   X-ForgeMsg-Event:     <event_type>
 *   X-ForgeMsg-Delivery:  <delivery_id>
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import { AppError } from '../../lib/app-error.js';
import { db } from '../../db/client.js';
import {
  webhooks,
  webhookDeliveries,
  apiKeys,
  type Webhook,
  type WebhookEvent,
} from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import type { WebhookEventPayloads } from './payloads.js';
import { safeFetch, BlockedUrlError } from '../../lib/safe-fetch.js';
import {
  signPayload,
  signPayloadWithTimestamp,
  verifySignature,
  verifyTimestampedSignature,
  generateWebhookSecret,
} from '@shared/webhooks';

// Re-export signing functions for consumers (SDK verify, route handlers)
export { signPayload, signPayloadWithTimestamp, verifySignature, verifyTimestampedSignature };

// ─── API key management ───────────────────────────────────────────────────────

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export async function createApiKey(
  orgId: string,
  userId: string,
  name: string,
  scopes: string[] = [],
  expiresAt?: Date,
  mode: 'live' | 'test' = 'live',
  /** Public (publishable) key for browser embedding — prefixed `fm_pub_` and
   *  rejected on every secret route (see authenticatePublic). */
  isPublic = false,
): Promise<{ apiKey: typeof apiKeys.$inferSelect; rawKey: string }> {
  const prefix = isPublic ? 'fm_pub_' : mode === 'test' ? 'fm_test_' : 'fm_live_';
  const raw = `${prefix}${randomBytes(24).toString('hex')}`;
  const keyHash = hashApiKey(raw);
  const keyPrefix = raw.slice(0, 12);

  const [key] = await db
    .insert(apiKeys)
    .values({ orgId, userId, name, keyHash, keyPrefix, scopes, expiresAt, mode, isPublic })
    .returning();

  if (!key) throw AppError.internal('Failed to create API key');
  return { apiKey: key, rawKey: raw };
}

export async function lookupApiKey(rawKey: string): Promise<typeof apiKeys.$inferSelect | null> {
  const keyHash = hashApiKey(rawKey);

  // Redis cache (TTL 60s) to avoid a DB hit on every request
  const cached = await redis.get(`apikey:${keyHash}`);
  if (cached === 'null') return null;
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.active, true)))
    .limit(1);

  if (!key || (key.expiresAt && key.expiresAt < new Date())) {
    await redis.setex(`apikey:${keyHash}`, 60, 'null');
    return null;
  }

  await redis.setex(`apikey:${keyHash}`, 60, JSON.stringify(key));

  // Update last_used_at async
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => {});

  return key;
}

export async function listApiKeys(orgId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      active: apiKeys.active,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: string, orgId: string): Promise<void> {
  const [key] = await db
    .update(apiKeys)
    .set({ active: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)))
    .returning({ id: apiKeys.id, keyHash: apiKeys.keyHash });

  if (!key) throw AppError.notFound('ApiKey');

  // Invalidate cache
  await redis.del(`apikey:${key.keyHash}`).catch(() => {});
}

// ─── Webhook CRUD ─────────────────────────────────────────────────────────────

/** Per-org webhook limit (raised from 10 to 50 for #280) */
export const MAX_WEBHOOKS_PER_ORG = 50;

export async function createWebhook(
  orgId: string,
  data: {
    url: string;
    events: WebhookEvent[];
    description?: string;
    priority?: number;
    batchSize?: number;
    batchFlushSeconds?: number;
  },
): Promise<Webhook & { rawSecret: string }> {
  // Enforce per-org limit
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(webhooks)
    .where(and(eq(webhooks.orgId, orgId), eq(webhooks.active, true)));
  const count = row?.count ?? 0;
  if (Number(count) >= MAX_WEBHOOKS_PER_ORG) {
    throw AppError.badRequest(`Maximum ${MAX_WEBHOOKS_PER_ORG} active webhooks per organisation`);
  }

  const rawSecret = generateWebhookSecret();

  const [webhook] = await db
    .insert(webhooks)
    .values({
      orgId,
      url: data.url,
      secret: rawSecret,
      events: data.events as string[],
      description: data.description,
      priority: data.priority ?? 5,
      batchSize: Math.min(data.batchSize ?? 1, 100),
      batchFlushSeconds: data.batchFlushSeconds ?? 30,
    })
    .returning();

  if (!webhook) throw AppError.internal('Failed to create webhook');
  return { ...webhook, rawSecret };
}

export async function listWebhooks(orgId: string): Promise<Omit<Webhook, 'secret'>[]> {
  const rows = await db
    .select({
      id: webhooks.id,
      orgId: webhooks.orgId,
      url: webhooks.url,
      events: webhooks.events,
      description: webhooks.description,
      active: webhooks.active,
      totalDeliveries: webhooks.totalDeliveries,
      failedDeliveries: webhooks.failedDeliveries,
      lastDeliveredAt: webhooks.lastDeliveredAt,
      // Why the events stopped. `active: false` on its own cannot distinguish
      // "the customer switched it off" from "we switched it off after it kept
      // failing", and the second one is the case where they need an
      // explanation rather than a boolean.
      consecutiveFailures: webhooks.consecutiveFailures,
      disabledAt: webhooks.disabledAt,
      disabledReason: webhooks.disabledReason,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks)
    .where(eq(webhooks.orgId, orgId))
    .orderBy(desc(webhooks.createdAt));
  return rows as unknown as Omit<Webhook, 'secret'>[];
}

export async function updateWebhook(
  id: string,
  orgId: string,
  data: Partial<{ url: string; events: WebhookEvent[]; description: string; active: boolean }>,
): Promise<Omit<Webhook, 'secret'>> {
  // Turning a webhook back on clears the auto-disable state. Without this the
  // reason would linger on a working webhook, and the failure streak would
  // carry over so the next single failure could disable it again immediately.
  const reEnable =
    data.active === true ? { disabledAt: null, disabledReason: null, consecutiveFailures: 0 } : {};

  const [row] = await db
    .update(webhooks)
    .set({
      ...data,
      ...reEnable,
      events: data.events as string[] | undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
    .returning();

  if (!row) throw AppError.notFound('Webhook');
  const { secret: _s, ...safe } = row;
  return safe;
}

export async function deleteWebhook(id: string, orgId: string): Promise<void> {
  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
    .returning({ id: webhooks.id });

  if (!row) throw AppError.notFound('Webhook');
}

// ─── Dispatch & delivery ──────────────────────────────────────────────────────

/**
 * Called by API handlers / services whenever a notable event occurs.
 * Creates delivery rows and queues BullMQ jobs.
 */
export async function dispatchEvent<E extends WebhookEvent>(
  orgId: string,
  event: E,
  payload: WebhookEventPayloads[E],
): Promise<void> {
  const timestamp = new Date().toISOString();

  // Managed pull stream: append EVERY event to the org's durable Redis stream,
  // independent of whether any HTTP webhook is configured. Consumers can pull
  // via GET /events/stream without hosting a receiver. Fire-and-forget.
  void import('./event-stream.js')
    .then(({ publishToStream }) =>
      publishToStream(orgId, event, payload as unknown as Record<string, unknown>, timestamp),
    )
    .catch(() => {});

  // Find active webhooks subscribed to this event
  const subs = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.orgId, orgId), eq(webhooks.active, true)));

  const matching = subs.filter((w) => {
    const events = w.events as string[];
    return events.includes(event) || events.includes('*');
  });

  if (matching.length === 0) return;

  const fullPayload: Record<string, unknown> = {
    event,
    orgId,
    timestamp,
    data: payload as unknown as Record<string, unknown>,
  };

  for (const webhook of matching) {
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        webhookId: webhook.id,
        orgId,
        event,
        payload: fullPayload,
        status: 'pending',
        nextRetryAt: new Date(),
      })
      .returning({ id: webhookDeliveries.id });

    if (!delivery) continue;

    // Queue via BullMQ
    const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
    if (queues) {
      await (
        queues as unknown as Record<string, { add: (n: string, d: unknown) => Promise<unknown> }>
      ).webhook
        ?.add('webhook-deliver', { deliveryId: delivery.id })
        .catch(() => {});
    }
  }
}

/**
 * Response bodies are stored so a customer can debug their own receiver. They
 * are NOT a channel for reading arbitrary responses out of our network, so the
 * stored copy is capped: 2 KB holds an error page or a JSON error envelope and
 * is far too little to exfiltrate anything useful.
 */
export const MAX_RESPONSE_BODY_BYTES = 2048;

function truncateResponseBody(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return text.length <= MAX_RESPONSE_BODY_BYTES
    ? text
    : text.slice(0, MAX_RESPONSE_BODY_BYTES) + '… [truncated]';
}

/**
 * Consecutive exhausted deliveries before we turn a webhook off.
 *
 * Counted per DELIVERY, not per attempt: one increment already means five
 * tries spread over about seven and a half minutes, so ten of them in a row is
 * an endpoint that has been broken for a long time, not a blip. Ten is also
 * few enough that a low-volume org does not lose weeks of events before we
 * stop trying.
 *
 * A 410 Gone bypasses the counter entirely — see classifyOutcome.
 */
export const AUTO_DISABLE_AFTER_CONSECUTIVE_FAILURES = 10;

/**
 * Retry policy lives in BullMQ now (see webhookQueue in lib/queues.ts):
 * attempts 5, exponential from 30 s → 30/60/120/240 s between tries.
 *
 * This module used to compute `nextRetryAt` itself and write status
 * 'retrying'. Nothing ever read it back: processRetryQueue was the only
 * re-enqueuer and it had no caller, so a delivery that failed once sat in
 * 'retrying' forever. deliverWebhook now THROWS on a retryable failure and
 * lets the queue own the schedule; webhook_deliveries is audit only.
 */
export type DeliveryOutcome = 'success' | 'failed';

/** Thrown when the attempt should be repeated — BullMQ turns this into a retry. */
export class RetryableDeliveryError extends Error {
  constructor(
    readonly deliveryId: string,
    readonly statusCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'RetryableDeliveryError';
  }
}

/**
 * Is this failure worth trying again?
 *
 * A 4xx means the receiver understood us and said no: a wrong URL, a revoked
 * token, a deleted endpoint. Repeating that five times changes nothing and
 * costs the receiver four more requests, so it is terminal. The exceptions are
 * the two 4xx codes that explicitly mean "later": 408 Request Timeout and 429
 * Too Many Requests.
 *
 * 410 Gone is terminal AND permanent — it is the code a receiver returns for an
 * endpoint that has been deleted, which is exactly what Zapier answers once a
 * Zap is removed. Counting to ten on that is pointless; the webhook is dead.
 */
export function classifyOutcome(statusCode: number | undefined): {
  outcome: DeliveryOutcome | 'retry';
  disableNow: boolean;
} {
  // No status at all: timeout, DNS failure, connection refused, TLS error, or
  // a URL the SSRF guard refused. All transport-level, all worth retrying —
  // a blocked URL will still be blocked next time and will simply exhaust.
  if (statusCode === undefined) return { outcome: 'retry', disableNow: false };

  if (statusCode >= 200 && statusCode < 300) return { outcome: 'success', disableNow: false };
  if (statusCode === 410) return { outcome: 'failed', disableNow: true };
  if (statusCode === 408 || statusCode === 429) return { outcome: 'retry', disableNow: false };
  if (statusCode >= 400 && statusCode < 500) return { outcome: 'failed', disableNow: false };
  return { outcome: 'retry', disableNow: false };
}

/**
 * Executes a single webhook delivery attempt.
 * Called by the BullMQ worker in apps/workers.
 */
export async function deliverWebhook(deliveryId: string): Promise<{
  outcome: DeliveryOutcome;
  statusCode?: number;
}> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) return { outcome: 'failed' };

  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, delivery.webhookId))
    .limit(1);

  if (!webhook || !webhook.active) {
    // Not retryable: an inactive webhook does not become active by waiting.
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed', responseBody: 'Webhook is not active' })
      .where(eq(webhookDeliveries.id, deliveryId));
    return { outcome: 'failed' };
  }

  const body = JSON.stringify(delivery.payload);
  // Two signatures so consumers can pick what they support:
  //   X-ForgeMsg-Signature      legacy `sha256=hex` over the body
  //   X-ForgeMsg-Signature-V2   Stripe-style `t=epoch,v1=hex` — timestamp
  //                             is bound into the HMAC so replays past
  //                             the verifier's tolerance window fail.
  //   X-ForgeMsg-Timestamp      same epoch in seconds, exposed plain so
  //                             consumers can age-check without parsing
  //                             the v2 envelope.
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(webhook.secret, body);
  const signatureV2 = signPayloadWithTimestamp(webhook.secret, body, timestamp);
  const attempts = delivery.attempts + 1;

  let statusCode: number | undefined;
  let responseBody: string | undefined;

  try {
    // safeFetch, not fetch: the URL is customer-supplied, so every hop is
    // checked against the resolved address at connect time. See lib/safe-fetch.
    const res = await safeFetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ForgeMsg-Signature': signature,
        'X-ForgeMsg-Signature-V2': signatureV2,
        'X-ForgeMsg-Timestamp': String(timestamp),
        'X-ForgeMsg-Event': delivery.event,
        'X-ForgeMsg-Delivery': deliveryId,
      },
      body,
      timeoutMs: 15_000,
      maxBytes: MAX_RESPONSE_BODY_BYTES,
    });

    statusCode = res.status;
    responseBody = truncateResponseBody(res.body);
  } catch (err) {
    responseBody = truncateResponseBody(
      err instanceof BlockedUrlError ? 'Blocked: ' + err.message : (err as Error).message,
    );
  }

  const now = new Date();
  const { outcome, disableNow } = classifyOutcome(statusCode);

  if (outcome === 'success') {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'success',
        statusCode,
        responseBody,
        attempts,
        deliveredAt: now,
        nextRetryAt: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    // A success clears the failure streak — a webhook that recovers must not
    // be disabled later by failures it has already come back from.
    await db
      .update(webhooks)
      .set({
        totalDeliveries: webhook.totalDeliveries + 1,
        lastDeliveredAt: now,
        consecutiveFailures: 0,
        updatedAt: now,
      })
      .where(eq(webhooks.id, webhook.id));

    return { outcome: 'success', statusCode };
  }

  if (outcome === 'retry') {
    // Audit only. The schedule belongs to BullMQ; throwing is what asks for it.
    await db
      .update(webhookDeliveries)
      .set({ status: 'pending', statusCode, responseBody, attempts })
      .where(eq(webhookDeliveries.id, deliveryId));

    throw new RetryableDeliveryError(
      deliveryId,
      statusCode,
      statusCode === undefined
        ? `Delivery ${deliveryId} failed at the transport layer: ${responseBody ?? 'unknown'}`
        : `Delivery ${deliveryId} got HTTP ${statusCode}`,
    );
  }

  // Terminal on the first try — a 4xx will say the same thing five times.
  await markDeliveryFailed(deliveryId, {
    statusCode,
    responseBody,
    attempts,
    disableNow,
  });
  return { outcome: 'failed', statusCode };
}

/**
 * Record a delivery as finally failed and take the webhook down if it has now
 * failed too many times in a row.
 *
 * Called from two places: deliverWebhook, when the very first attempt is
 * terminal, and the exhausted-attempts route, when BullMQ has given up. Both
 * must land in the same state, so the logic lives here rather than twice.
 */
export async function markDeliveryFailed(
  deliveryId: string,
  opts: {
    statusCode?: number;
    responseBody?: string;
    attempts?: number;
    disableNow?: boolean;
  } = {},
): Promise<{ disabled: boolean; consecutiveFailures: number }> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery) return { disabled: false, consecutiveFailures: 0 };

  const now = new Date();
  await db
    .update(webhookDeliveries)
    .set({
      status: 'failed',
      statusCode: opts.statusCode ?? delivery.statusCode,
      responseBody: truncateResponseBody(opts.responseBody) ?? delivery.responseBody,
      attempts: opts.attempts ?? delivery.attempts,
      nextRetryAt: null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, delivery.webhookId))
    .limit(1);
  if (!webhook) return { disabled: false, consecutiveFailures: 0 };

  const consecutiveFailures = webhook.consecutiveFailures + 1;
  const disable =
    opts.disableNow === true || consecutiveFailures >= AUTO_DISABLE_AFTER_CONSECUTIVE_FAILURES;

  await db
    .update(webhooks)
    .set({
      failedDeliveries: webhook.failedDeliveries + 1,
      consecutiveFailures,
      updatedAt: now,
      ...(disable && webhook.active
        ? {
            active: false,
            disabledAt: now,
            disabledReason:
              opts.disableNow === true
                ? `Disabled automatically: the endpoint returned 410 Gone, which means it no longer exists.`
                : `Disabled automatically after ${consecutiveFailures} consecutive failed deliveries.`,
          }
        : {}),
    })
    .where(eq(webhooks.id, webhook.id));

  return { disabled: disable && webhook.active, consecutiveFailures };
}

/**
 * Sends a test delivery (payload with synthetic data) to the webhook URL.
 */
export async function testWebhook(
  id: string,
  orgId: string,
): Promise<{ success: boolean; statusCode?: number; blocked?: string }> {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
    .limit(1);

  if (!webhook) throw AppError.notFound('Webhook');

  const body = JSON.stringify({
    event: 'webhook.test',
    orgId,
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test delivery from ForgeMsg' },
  });

  const testTimestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(webhook.secret, body);
  const signatureV2 = signPayloadWithTimestamp(webhook.secret, body, testTimestamp);

  try {
    const res = await safeFetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ForgeMsg-Signature': signature,
        'X-ForgeMsg-Signature-V2': signatureV2,
        'X-ForgeMsg-Timestamp': String(testTimestamp),
        'X-ForgeMsg-Event': 'webhook.test',
        'X-ForgeMsg-Delivery': 'test',
      },
      body,
      timeoutMs: 10_000,
      maxBytes: MAX_RESPONSE_BODY_BYTES,
    });
    return { success: res.status >= 200 && res.status < 300, statusCode: res.status };
  } catch (err) {
    // A refused URL says so, because that is actionable for the customer.
    // Everything else stays a bare `success: false` — this endpoint must not
    // become a probe that tells apart "port closed" from "host unreachable".
    if (err instanceof BlockedUrlError) return { success: false, blocked: err.message };
    return { success: false };
  }
}

/**
 * Delivery log for a webhook.
 *
 * `response_body` is deliberately NOT projected. It is the response our server
 * received from a URL the customer chose, which makes returning it a read
 * primitive: point a webhook at something, read what it said. The SSRF guard
 * makes that hard to aim at anything interesting, but defence in depth is
 * cheaper than betting the guard is perfect — and the status code, which IS
 * returned, is what a customer debugging their own receiver actually needs.
 *
 * The body is still stored (capped at MAX_RESPONSE_BODY_BYTES) so support can
 * read it out of the database when a customer asks why their endpoint failed.
 */
export async function listDeliveries(webhookId: string, orgId: string, limit = 50) {
  return db
    .select({
      id: webhookDeliveries.id,
      webhookId: webhookDeliveries.webhookId,
      orgId: webhookDeliveries.orgId,
      event: webhookDeliveries.event,
      payload: webhookDeliveries.payload,
      status: webhookDeliveries.status,
      statusCode: webhookDeliveries.statusCode,
      attempts: webhookDeliveries.attempts,
      nextRetryAt: webhookDeliveries.nextRetryAt,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.webhookId, webhookId), eq(webhookDeliveries.orgId, orgId)))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}
