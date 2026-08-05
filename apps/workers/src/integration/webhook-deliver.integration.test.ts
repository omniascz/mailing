/**
 * Webhook delivery through the real queue: real Postgres, real Redis, real API
 * process, real Worker.
 *
 * The API-side tests can prove deliverWebhook produces the right outcome for a
 * given receiver response. They cannot prove the worker exists, that the queue
 * name matches, that the job reaches the internal route, or that BullMQ
 * actually retries — which matters more than usual here, because the defect
 * being fixed was precisely a queue with no consumer. Deleting the Worker from
 * webhook-deliver.ts leaves every API-side test green.
 *
 * ─── What this file deliberately does NOT do ────────────────────────────────
 *
 * It does not deliver to a receiver that answers 200. It cannot: a test server
 * can only bind to loopback (or, on a CI runner, a private address), and the
 * SSRF guard refuses both — correctly. Relaxing the guard to make a test pass
 * would be the wrong trade, so the response-classification and signature cases
 * live in the API-side suite, where safeFetch's address policy can be replaced
 * without weakening anything that ships.
 *
 * What is left here is exactly what only this level can show: that the queue
 * has a consumer, that a throwing job is retried by BullMQ and recorded as
 * exhausted, and that the guard holds on the delivery path too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { Queue, type Worker } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { startWebhookDeliverWorker } from '../jobs/webhook-deliver.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false });

const SECRET = 'wi-webhook-secret-0123456789abcdef';

let orgId: string;
let worker: Worker;
let queue: Queue;

async function seedDelivery(url: string, event = 'contact.created') {
  const [wh] = await sql<{ id: string }[]>`
    INSERT INTO webhooks (org_id, url, secret, events, active)
    VALUES (${orgId}, ${url}, ${SECRET}, ARRAY[${event}]::text[], true)
    RETURNING id
  `;
  const [d] = await sql<{ id: string }[]>`
    INSERT INTO webhook_deliveries (webhook_id, org_id, event, payload, status)
    VALUES (${wh!.id}, ${orgId}, ${event},
            ${sql.json({ event, orgId, timestamp: new Date().toISOString(), data: { probe: true } })},
            'pending')
    RETURNING id
  `;
  return { webhookId: wh!.id, deliveryId: d!.id };
}

async function delivery(id: string) {
  const [row] = await sql<
    { status: string; status_code: number | null; attempts: number; response_body: string | null }[]
  >`
    SELECT status, status_code, attempts, response_body FROM webhook_deliveries WHERE id = ${id}
  `;
  return row!;
}

async function webhookRow(id: string) {
  const [row] = await sql<
    { active: boolean; consecutive_failures: number; disabled_reason: string | null }[]
  >`
    SELECT active, consecutive_failures, disabled_reason FROM webhooks WHERE id = ${id}
  `;
  return row!;
}

/** Poll until the delivery row settles, then report what it actually said. */
async function waitForStatus(deliveryId: string, wanted: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = await delivery(deliveryId);
  while (Date.now() < deadline) {
    last = await delivery(deliveryId);
    if (wanted.includes(last.status)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `delivery ${deliveryId} never reached ${wanted.join('|')} — last status "${last.status}" ` +
      `after ${last.attempts} attempts, body: ${last.response_body ?? '(none)'}`,
  );
}

describe('webhook delivery worker (real queue + DB + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    queue = new Queue(QUEUE_NAMES.WEBHOOK, { connection });
    await queue.obliterate({ force: true }).catch(() => {});
    worker = startWebhookDeliverWorker();
    await worker.waitUntilReady();
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    await sql`DELETE FROM webhooks WHERE org_id = ${orgId} AND secret = ${SECRET}`;
    await sql.end({ timeout: 5 });
  });

  it('has a consumer for the queue the API produces into', async () => {
    // The whole defect in one assertion. The API has enqueued onto 'webhook'
    // since the feature was built; nothing was ever listening on that name.
    expect(QUEUE_NAMES.WEBHOOK).toBe('webhook');
    expect(await queue.getWorkersCount()).toBeGreaterThan(0);
  }, 30_000);

  it('retries a failing delivery and records exhaustion', async () => {
    // A link-local URL fails at the transport layer, which classifies as
    // retryable — the same path a receiver timeout takes. Short backoff so the
    // test does not wait out the production 30/60/120/240 s schedule; that
    // schedule is asserted from BullMQ's own formula in the API unit tests.
    const { webhookId, deliveryId } = await seedDelivery('http://169.254.169.254/meta-data/');
    await queue.add(
      'webhook-deliver',
      { deliveryId },
      { attempts: 3, backoff: { type: 'fixed', delay: 300 } },
    );

    const row = await waitForStatus(deliveryId, ['failed'], 90_000);
    expect(row.status).toBe('failed');
    expect(row.attempts, 'BullMQ must have re-run the job, not settled on the first try').toBe(3);

    const wh = await webhookRow(webhookId);
    expect(wh.consecutive_failures).toBe(1);
    expect(wh.active, 'one exhausted delivery is not enough to disable').toBe(true);
  }, 120_000);

  it('the SSRF guard holds on the delivery path, not only at registration', async () => {
    // Written straight to the table, the way a webhook stored before the guard
    // existed — or a hostname that resolved publicly at registration and
    // privately by delivery time — would look.
    const { deliveryId } = await seedDelivery('http://127.0.0.1:3001/api/v1/internal/contacts');
    await queue.add(
      'webhook-deliver',
      { deliveryId },
      { attempts: 2, backoff: { type: 'fixed', delay: 200 } },
    );

    const row = await waitForStatus(deliveryId, ['failed'], 90_000);
    expect(row.status_code, 'nothing answered, so there is no status to record').toBeNull();
    expect(row.response_body).toMatch(/Blocked|public internet address/i);
  }, 120_000);
});
