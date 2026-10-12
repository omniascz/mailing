/**
 * The plan send counter (Z136) counts a campaign message once, however many
 * times mta-sender runs its job.
 *
 * mta-sender writes a campaign message's `send` row (through the API's
 * /internal/events) when the engine accepts it. Two ways the same message is
 * processed more than once:
 *  - a BullMQ retry: an attempt that ends in a soft bounce throws, and the next
 *    attempt delivers — one `send` row, written by the attempt that delivered;
 *  - reprocessing: a job whose worker died after the engine accepted the
 *    message but before BullMQ recorded the job as done is picked up again as
 *    stalled, and runs the success path a second time with the same messageId.
 *    Until Z137 that stored a second `send` row (the counter skipped it, every
 *    other reader counted it); now the API keeps one `send` row per message
 *    and recipient, and the second post is a no-op.
 * Both must leave one `send` row and the counter one higher, equal to the
 * truth, with the job's real code against the real API and a stub engine.
 *
 * WHAT THIS FILE CANNOT SEE
 * - BullMQ's own stall detection: the second run is the processor called again
 *   with the same job data, which is what a stalled job's reprocessing does.
 * - The Go engine and SMTP.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processMtaSend } from '../jobs/mta-sender.js';
import type { MtaSendJobData } from '../queues/index.js';

// Each address answers from its own script of SMTP codes, last one repeating.
const engine = vi.hoisted(() => ({ codes: new Map<string, number[]>() }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    const script = engine.codes.get(msg.toEmail) ?? [250];
    const code = script.length > 1 ? script.shift()! : script[0]!;
    return {
      success: code === 250,
      messageId: 'm',
      smtpCode: code,
      smtpMessage: code === 250 ? 'OK' : '4.2.0 try again later',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
let org: string;
let campaignId: string;

async function measure(): Promise<{ counter: number; truth: number; rows: number }> {
  const [r] = await sql<{ counter: number; truth: number; rows: number }[]>`
    SELECT coalesce((SELECT sends FROM plan_send_counters
                     WHERE org_id = ${org} AND period_start = plan_period_start(${org})), 0)::int AS counter,
           plan_send_truth(${org}, plan_period_start(${org})) AS truth,
           (SELECT count(*)::int FROM email_events WHERE org_id = ${org} AND event_type = 'send') AS rows
  `;
  return r!;
}

async function message(codes: number[]): Promise<MtaSendJobData> {
  const to = `retry-${randomUUID().slice(0, 8)}@test.local`;
  engine.codes.set(to, codes);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status) VALUES (${org}, ${to}, 'active') RETURNING id
  `;
  return {
    campaignId,
    orgId: org,
    contactId: c!.id,
    messageId: `<retry-${randomUUID()}@forgemsg>`,
    fromEmail: `news@retry-${tag}.test`,
    fromName: '',
    toEmail: to,
    toName: '',
    subject: 'Novinky',
    htmlBody: '<p>x</p>',
    textBody: '',
    replyTo: '',
    customHeaders: {},
    stream: 'broadcast',
  } as unknown as MtaSendJobData;
}

function run(data: MtaSendJobData, attemptsMade: number) {
  return processMtaSend({
    id: `retry-${randomUUID()}`,
    data,
    opts: { attempts: 3 },
    attemptsMade,
    log: async () => {},
    updateData: async () => {},
  } as unknown as Job<MtaSendJobData>);
}

beforeAll(async () => {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`retry ${tag}`}, ${`plan-retry-${tag}`}) RETURNING id
  `;
  org = o!.id;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name) VALUES (${org}, ${`retry ${tag}`}) RETURNING id
  `;
  campaignId = c!.id;
});

afterAll(async () => {
  if (org) {
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql.end();
});

describe('plan send counter under job retries', () => {
  it('a soft bounce retried to delivery is one send', async () => {
    const before = await measure();
    const data = await message([450, 250]);
    await expect(run(data, 0)).rejects.toThrow(/Soft bounce/);
    expect(await measure()).toEqual(before);
    const out = (await run(data, 1)) as { status: string };
    expect(out.status).toBe('sent');
    const after = await measure();
    expect(after.rows - before.rows).toBe(1);
    expect(after.counter - before.counter).toBe(1);
    expect(after.counter).toBe(after.truth);
  });

  it('a delivered job processed again is one row and one send', async () => {
    const before = await measure();
    const data = await message([250]);
    expect(((await run(data, 0)) as { status: string }).status).toBe('sent');
    expect(((await run(data, 0)) as { status: string }).status).toBe('sent');
    const after = await measure();
    expect(after.rows - before.rows).toBe(1);
    expect(after.counter - before.counter).toBe(1);
    expect(after.counter).toBe(after.truth);
  });
});
