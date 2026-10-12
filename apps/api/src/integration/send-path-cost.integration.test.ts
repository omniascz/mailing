/**
 * What one transactional send costs, in database queries and Redis commands
 * (Z135).
 *
 * Counts, not times: a time budget wobbles on a CI runner, a count does not.
 * Measured in Z135 (and listed in its report): one POST /transactional/email
 * for one recipient on a verified domain, after a warm-up request. If this
 * fails because a number went UP, a query or a command was added to the hot
 * path of every transactional message — find it in the printed list, and either
 * take it back out or raise the number here in the same change, saying why.
 * If it went DOWN, lower the number: the list shows what was saved.
 *
 * Queries are seen through the SQL explain guard (on in every integration run,
 * see vitest.integration.config.ts), Redis commands by wrapping sendCommand on
 * the two clients the path uses: the shared one (session, request rate limit,
 * usage alerts, event stream) and the MTA queue's.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { apiKeys, emailEvents, organizations, sendingDomains } from '../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { mtaOtherQueue } from '../lib/queues.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const FROM = `team@cost-${tag}.test`;
let org: string;
let key: string;

type Cmd = { name: string; args: unknown[] };

/** Every command a client sends while `run` runs, by wrapping its sendCommand. */
async function commandsDuring<T>(clients: Redis[], run: () => Promise<T>): Promise<[T, Cmd[]]> {
  const seen: Cmd[] = [];
  const originals = clients.map((c) => c.sendCommand.bind(c));
  clients.forEach((c, i) => {
    c.sendCommand = ((cmd: { name: string; args: unknown[] }, ...rest: unknown[]) => {
      seen.push({ name: cmd.name, args: cmd.args });
      return (originals[i] as (...a: unknown[]) => unknown)(cmd, ...rest);
    }) as Redis['sendCommand'];
  });
  try {
    return [await run(), seen];
  } finally {
    clients.forEach((c, i) => {
      c.sendCommand = originals[i] as Redis['sendCommand'];
    });
  }
}

const send = () =>
  app.inject({
    method: 'POST',
    url: '/api/v1/transactional/email',
    headers: { 'x-api-key': key },
    payload: {
      to: `cost-${randomUUID().slice(0, 8)}@example.test`,
      from: FROM,
      subject: 'Order confirmed',
      html: '<p>Thank you.</p>',
    },
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [o] = await db
    .insert(organizations)
    .values({
      name: `cost ${tag}`,
      slug: `cost-${tag}`,
      plan: 'pro',
      settings: { maxSendRate: 1000 },
    })
    .returning({ id: organizations.id });
  org = o!.id;
  await db.insert(sendingDomains).values({
    orgId: org,
    domain: `cost-${tag}.test`,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: true,
  });
  key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: org,
    name: `cost ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  // Warm-up: first-use work (module imports, Lua scripts loaded into Redis,
  // the API key's first lookup before it is cached) is not the steady state.
  expect((await send()).statusCode).toBe(202);
  expect((await send()).statusCode).toBe(202);
  // ...and their metering, which lands after the reply, out of the way.
  await new Promise((resolve) => setTimeout(resolve, 500));
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('one transactional send', () => {
  it('makes the measured number of database queries and Redis commands', async () => {
    const queue = (await mtaOtherQueue.client) as unknown as Redis;
    const queries: string[] = [];
    const stop = observeQueries((q) => queries.push(q.replace(/\s+/g, ' ').slice(0, 120)));
    let commands: Cmd[] = [];
    try {
      const [res, cmds] = await commandsDuring([redis, queue], async () => {
        const r = await send();
        // Metering and the webhook are fire-and-forget after the reply.
        await new Promise((resolve) => setTimeout(resolve, 300));
        return r;
      });
      commands = cmds;
      expect(res.statusCode, res.body).toBe(202);
    } finally {
      stop();
    }
    console.log(
      `[z135] one send: ${queries.length} queries\n  ${queries.join('\n  ')}\n` +
        `[z135] ${commands.length} Redis commands\n  ${commands
          .map((c) => `${c.name} ${String(c.args[0] ?? '').slice(0, 60)}`)
          .join('\n  ')}`,
    );
    expect(queries.length, queries.join('\n')).toBe(EXPECTED_QUERIES);
    expect(commands.length, commands.map((c) => c.name).join(' ')).toBe(EXPECTED_REDIS_COMMANDS);
  });
});

/**
 * Pinned from the Z135 measurement; see the header for what a change means.
 *
 * 14 → 13 in Z136: the plan step read the subscription's period start and then
 * COUNTed this period's `send` rows in email_events — two queries, the second
 * growing with every send. It now reads one counter row keyed by
 * plan_period_start(), which looks the subscription up inside the same query.
 * The counter is kept by a trigger on the email_events insert (migration
 * 0029), and a trigger's statements are not separate queries from here: that
 * work is inside the `insert into "email_events"` line, not missing.
 */
const EXPECTED_QUERIES = 13;
const EXPECTED_REDIS_COMMANDS = 5;
