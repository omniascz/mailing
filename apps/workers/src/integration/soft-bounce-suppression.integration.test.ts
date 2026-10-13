/**
 * A message that the receiving server refused with a 4xx on every attempt has
 * definitively failed, and its address is suppressed then — on the last
 * attempt, not on any deferral before it (Z139).
 *
 * ─── What was wrong (measured on master) ─────────────────────────────────────
 *
 * The last 4xx attempt stored a soft bounce and suppressed nothing, so an
 * address that refused every attempt stayed mailable. The policy the code
 * named — shouldSuppressAfterSoftBounces, "suppress after 3 soft bounces" —
 * was called by nothing but its own unit test; it was deleted.
 *
 * ─── What holds now ──────────────────────────────────────────────────────────
 *
 *  - 4xx on the last attempt: `bounce` soft, the address on the hard_bounce
 *    list (SendGrid's "bounces", where a soft bounce out of retries ends up),
 *    the contact bounced.
 *  - 4xx and then a delivery: deferrals, a delivery, nothing suppressed.
 *  - A transport failure to the end (no SMTP reply at all): `failed`, nothing
 *    suppressed — nothing was said about the address.
 *  - A real hard bounce (550) and a block (554) behave as before.
 *
 * The job's real code against the real API and a stub engine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processMtaSend } from '../jobs/mta-sender.js';
import type { MtaSendJobData } from '../queues/index.js';

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
    const text =
      code === 250
        ? 'OK'
        : code === 554
          ? '5.7.1 rejected by policy'
          : code >= 500
            ? '5.1.1 user unknown'
            : '4.2.1 try again later';
    return {
      success: code === 250,
      messageId: 'm',
      smtpCode: code,
      smtpMessage: text,
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
  const to = `soft-${randomUUID().slice(0, 8)}@test.local`;
  engine.codes.set(to, codes);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, status) VALUES (${org}, ${to}, 'active') RETURNING id
  `;
  return {
    campaignId,
    orgId: org,
    contactId: c!.id,
    messageId: `<soft-${randomUUID()}@forgemsg>`,
    fromEmail: `news@soft-${tag}.test`,
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

/** Every attempt of the job, as BullMQ would run them, until one does not throw. */
async function attempts(data: MtaSendJobData, max: number): Promise<string[]> {
  const out: string[] = [];
  for (let made = 0; made < max; made++) {
    const r = await processMtaSend({
      id: `soft-${randomUUID()}`,
      data,
      opts: { attempts: max },
      attemptsMade: made,
      log: async () => {},
      updateData: async () => {},
    } as unknown as Job<MtaSendJobData>).then(
      (x) => (x as { status: string }).status,
      () => 'retry',
    );
    out.push(r);
    if (r !== 'retry') break;
  }
  return out;
}

async function after(data: MtaSendJobData) {
  const r = await sql<{ t: string; n: number }[]>`
    SELECT CASE WHEN bounce_type IS NULL THEN event_type::text
                ELSE event_type::text || ':' || bounce_type::text END AS t,
           count(*)::int AS n
    FROM email_events WHERE org_id = ${org} AND message_id = ${data.messageId}
    GROUP BY 1 ORDER BY 1
  `;
  const s = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${org} AND email = ${data.toEmail}
  `;
  const [c] = await sql<
    { status: string }[]
  >`SELECT status FROM contacts WHERE id = ${data.contactId}`;
  return {
    rows: Object.fromEntries(r.map((x) => [x.t, x.n])),
    suppressions: s.map((x) => x.reason),
    contact: c!.status,
  };
}

beforeAll(async () => {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`soft ${tag}`}, ${`soft-${tag}`}) RETURNING id
  `;
  org = o!.id;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name) VALUES (${org}, ${`soft ${tag}`}) RETURNING id
  `;
  campaignId = c!.id;
});

afterAll(async () => {
  if (org) {
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM suppressions WHERE org_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql.end();
});

describe('a definitive soft failure suppresses the address', () => {
  it('4xx on every attempt: deferrals, then a soft bounce and the suppression', async () => {
    const d = await message([450]);
    expect(await attempts(d, 3)).toEqual(['retry', 'retry', 'retry']);
    expect(await after(d)).toEqual({
      rows: { 'bounce:soft': 1, deferred: 2 },
      suppressions: ['hard_bounce'],
      contact: 'bounced',
    });
  });

  it('4xx three times, then delivered: nothing suppressed', async () => {
    const d = await message([450, 450, 450, 250]);
    expect(await attempts(d, 4)).toEqual(['retry', 'retry', 'retry', 'sent']);
    expect(await after(d)).toEqual({
      rows: { deferred: 3, deliver: 1, send: 1 },
      suppressions: [],
      contact: 'active',
    });
  });

  it('no SMTP reply to the end: failed, nothing suppressed', async () => {
    const d = await message(['net']);
    expect(await attempts(d, 2)).toEqual(['retry', 'retry']);
    expect(await after(d)).toEqual({
      rows: { deferred: 1, failed: 1 },
      suppressions: [],
      contact: 'active',
    });
  });

  it('a hard bounce and a block, as before', async () => {
    const hard = await message([550]);
    expect(await attempts(hard, 3)).toEqual(['hard_bounce']);
    expect(await after(hard)).toEqual({
      rows: { 'bounce:hard': 1 },
      suppressions: ['hard_bounce'],
      contact: 'bounced',
    });
    const block = await message([554]);
    expect(await attempts(block, 3)).toEqual(['blocked']);
    expect(await after(block)).toEqual({
      rows: { 'bounce:block': 1 },
      suppressions: [],
      contact: 'active',
    });
  });
});
