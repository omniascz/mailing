/**
 * mta-sender run again on the same job writes no ending twice (Z138).
 *
 * Measured on master in the Z138 probe: a delivered job processed again stored
 * a second `deliver`; a blocked one a second block bounce; a soft bounce on the
 * last attempt a second soft bounce; a transport failure a second `failed`. The
 * API now keeps one of each per message and recipient (and bounce type), and
 * the second post is a no-op. What legitimately repeats is kept: a message
 * greylisted twice and then delivered has two `deferred`, one `send`, one
 * `deliver`.
 *
 * The job's real code against the real API and a stub engine. The second run
 * is the processor called again with the same job data — what a stalled job's
 * reprocessing does; BullMQ's own stall detection is not exercised.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processMtaSend } from '../jobs/mta-sender.js';
import type { MtaSendJobData } from '../queues/index.js';

// Each address answers from its own script, the last entry repeating.
const engine = vi.hoisted(() => ({ codes: new Map<string, Array<number | 'net'>>() }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    const script = engine.codes.get(msg.toEmail) ?? [250];
    const code = script.length > 1 ? script.shift()! : script[0]!;
    if (code === 'net') {
      return {
        success: false,
        messageId: '',
        smtpCode: 0,
        smtpMessage: '',
        error: 'dial timeout',
        durationMs: '1',
        sendingIp: '',
      };
    }
    return {
      success: code === 250,
      messageId: 'm',
      smtpCode: code,
      smtpMessage: code === 250 ? 'OK' : code === 554 ? '5.7.1 blocked by policy' : '4.2.0 later',
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

async function message(codes: Array<number | 'net'>): Promise<MtaSendJobData> {
  const to = `ending-${randomUUID().slice(0, 8)}@test.local`;
  engine.codes.set(to, codes);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status) VALUES (${org}, ${to}, 'active') RETURNING id
  `;
  return {
    campaignId,
    orgId: org,
    contactId: c!.id,
    messageId: `<ending-${randomUUID()}@forgemsg>`,
    fromEmail: `news@ending-${tag}.test`,
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

/** One run; a throw (a retry is due) is reported, not raised. */
function run(data: MtaSendJobData, attemptsMade: number, attempts: number) {
  return processMtaSend({
    id: `ending-${randomUUID()}`,
    data,
    opts: { attempts },
    attemptsMade,
    log: async () => {},
    updateData: async () => {},
  } as unknown as Job<MtaSendJobData>).then(
    (r) => (r as { status: string }).status,
    (e: Error) => `threw ${e.message.split(':')[0]}`,
  );
}

async function rows(messageId: string) {
  const r = await sql<{ t: string; n: number }[]>`
    SELECT CASE WHEN bounce_type IS NULL THEN event_type::text
                ELSE event_type::text || ':' || bounce_type::text END AS t,
           count(*)::int AS n
    FROM email_events WHERE org_id = ${org} AND message_id = ${messageId}
    GROUP BY 1 ORDER BY 1
  `;
  return Object.fromEntries(r.map((x) => [x.t, x.n]));
}

beforeAll(async () => {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`ending ${tag}`}, ${`ending-w-${tag}`}) RETURNING id
  `;
  org = o!.id;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name) VALUES (${org}, ${`ending ${tag}`}) RETURNING id
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

describe('mta-sender processed again writes no ending twice', () => {
  it('delivered', async () => {
    const d = await message([250]);
    expect([await run(d, 0, 3), await run(d, 0, 3)]).toEqual(['sent', 'sent']);
    expect(await rows(d.messageId)).toEqual({ deliver: 1, send: 1 });
  });

  it('blocked', async () => {
    const d = await message([554]);
    expect([await run(d, 0, 3), await run(d, 0, 3)]).toEqual(['blocked', 'blocked']);
    expect(await rows(d.messageId)).toEqual({ 'bounce:block': 1 });
  });

  it('a soft bounce on the last attempt', async () => {
    const d = await message([450]);
    await run(d, 0, 1);
    await run(d, 0, 1);
    expect(await rows(d.messageId)).toEqual({ 'bounce:soft': 1 });
  });

  it('a transport failure on the last attempt', async () => {
    const d = await message(['net']);
    await run(d, 1, 2);
    await run(d, 1, 2);
    expect(await rows(d.messageId)).toEqual({ failed: 1 });
  });

  it('greylisted twice, then delivered: every deferral is kept, the delivery once', async () => {
    const d = await message([450, 450, 250]);
    expect([await run(d, 0, 3), await run(d, 1, 3), await run(d, 2, 3)]).toEqual([
      'threw Soft bounce (450)',
      'threw Soft bounce (450)',
      'sent',
    ]);
    expect(await rows(d.messageId)).toEqual({ deferred: 2, deliver: 1, send: 1 });
  });
});
