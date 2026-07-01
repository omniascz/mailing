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
import { and, eq, lte, desc, sql } from 'drizzle-orm';
import { AppError } from '../../lib/app-error.js';
import { db } from '../../db/client.js';
import {
  webhooks,
  webhookDeliveries,
  apiKeys,
  type Webhook,
  type WebhookEvent,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import {
  signPayload,
  signPayloadWithTimestamp,
  verifySignature,
  verifyTimestampedSignature,
  generateWebhookSecret,
  retryDelaySec,
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
  const [row] = await db
    .update(webhooks)
    .set({ ...data, events: data.events as string[] | undefined, updatedAt: new Date() })
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
export async function dispatchEvent(
  orgId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
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
    timestamp: new Date().toISOString(),
    data: payload,
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

/** Maximum number of delivery attempts before giving up */
const MAX_ATTEMPTS = 5;

/** Mailforge retry config: 30s base, 2× multiplier, 600s cap, 5 attempts */
const MAILFORGE_RETRY_CONFIG = {
  maxRetries: MAX_ATTEMPTS,
  initialDelaySec: 30,
  maxDelaySec: 600,
  backoffMultiplier: 2,
  autoDisableThreshold: 0,
} as const;

/**
 * Executes a single webhook delivery attempt.
 * Called by the BullMQ worker in apps/workers.
 */
export async function deliverWebhook(deliveryId: string): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) return;

  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, delivery.webhookId))
    .limit(1);

  if (!webhook || !webhook.active) {
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed' })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
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
  let success = false;

  try {
    const res = await fetch(webhook.url, {
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
      signal: AbortSignal.timeout(15_000),
    });

    statusCode = res.status;
    responseBody = await res.text().catch(() => undefined);
    success = res.ok;
  } catch (err) {
    responseBody = (err as Error).message;
  }

  const now = new Date();

  if (success) {
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

    // Update webhook stats
    await db
      .update(webhooks)
      .set({
        totalDeliveries: webhook.totalDeliveries + 1,
        lastDeliveredAt: now,
        updatedAt: now,
      })
      .where(eq(webhooks.id, webhook.id));
  } else if (attempts >= MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed', statusCode, responseBody, attempts, nextRetryAt: null })
      .where(eq(webhookDeliveries.id, deliveryId));

    await db
      .update(webhooks)
      .set({ failedDeliveries: webhook.failedDeliveries + 1, updatedAt: now })
      .where(eq(webhooks.id, webhook.id));
  } else {
    const nextRetry = new Date(
      now.getTime() + retryDelaySec(attempts, MAILFORGE_RETRY_CONFIG) * 1000,
    );
    await db
      .update(webhookDeliveries)
      .set({ status: 'retrying', statusCode, responseBody, attempts, nextRetryAt: nextRetry })
      .where(eq(webhookDeliveries.id, deliveryId));
  }
}

/**
 * Picks up retrying deliveries whose nextRetryAt <= now.
 * Called by the scheduler (every 30s).
 */
export async function processRetryQueue(): Promise<{ queued: number }> {
  const now = new Date();
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, 'retrying'), lte(webhookDeliveries.nextRetryAt, now)))
    .limit(100);

  const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
  for (const d of due) {
    if (queues) {
      await (
        queues as Record<string, { add: (n: string, data: unknown) => Promise<unknown> }>
      ).webhook
        ?.add('webhook-deliver', { deliveryId: d.id })
        .catch(() => {});
    }
  }

  return { queued: due.length };
}

/**
 * Sends a test delivery (payload with synthetic data) to the webhook URL.
 */
export async function testWebhook(
  id: string,
  orgId: string,
): Promise<{ success: boolean; statusCode?: number }> {
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
    const res = await fetch(webhook.url, {
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
      signal: AbortSignal.timeout(10_000),
    });
    return { success: res.ok, statusCode: res.status };
  } catch (_err) {
    return { success: false };
  }
}

export async function listDeliveries(webhookId: string, orgId: string, limit = 50) {
  return db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.webhookId, webhookId), eq(webhookDeliveries.orgId, orgId)))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}
