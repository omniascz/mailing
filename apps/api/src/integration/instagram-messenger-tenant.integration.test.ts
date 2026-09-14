/**
 * Whose helpdesk an Instagram DM or a Messenger message lands in.
 *
 *     async function resolveOrgByInstagramPage(_pageId: string) {
 *       // Stub: in production, look up ecommerce_connections or a meta_pages
 *       // table by page_id. For now, fall back to env variable for single-org
 *       // deployments.
 *       return process.env.DEFAULT_ORG_ID ?? null;
 *     }
 *
 * The page id is not merely unused — the parameter is named `_pageId` to say
 * so. Every inbound DM to every connected page therefore opened a ticket in one
 * organisation: whichever DEFAULT_ORG_ID names. Messenger had the same function
 * without even the comment (routes/v1/webhooks/messenger.ts).
 *
 * The table the stub asks for exists. meta_page_mappings is unique on
 * (page_id, channel) — globally, not per organisation — and #181 made
 * routes/v1/webhooks/meta.ts resolve exactly this way. Registering a page is
 * already an authenticated admin action (POST /api/v1/meta/pages), so nothing
 * new has to be configured for it: the mapping is where a page's owner is
 * declared.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * These endpoints answer 200 {"received": true} to everything they accept,
 * before and after, so "no ticket in the wrong org" is also what a rejected
 * signature or a dead handler look like. The case that matters asserts the
 * ticket field by field in the organisation that registered the page, and the
 * unmapped case is followed by one that must still file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, metaPageMappings } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-igfb-tenant-${tag}`;

/** Registered by the owner org; DEFAULT_ORG_ID points at the other one. */
const IG_PAGE = `ig${tag}`;
const FB_PAGE = `fb${tag}`;
/** Registered by nobody. */
const IG_PAGE_UNKNOWN = `igx${tag}`;
const FB_PAGE_UNKNOWN = `fbx${tag}`;

const sender = (what: string) => `s-${what}-${tag}`;

let app: FastifyInstance;
/** The organisation DEFAULT_ORG_ID names — the one that used to collect everything. */
let fallbackOrg: string;
/** The organisation that registered the pages. */
let ownerOrg: string;

const ticketsFor = async (orgId: string, externalThreadId: string) =>
  db
    .select()
    .from(helpdeskTickets)
    .where(
      and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.externalThreadId, externalThreadId)),
    );

const anyTicketFor = async (externalThreadId: string) =>
  db.select().from(helpdeskTickets).where(eq(helpdeskTickets.externalThreadId, externalThreadId));

const allTicketsOf = async (orgId: string) =>
  db
    .select({ id: helpdeskTickets.id })
    .from(helpdeskTickets)
    .where(eq(helpdeskTickets.orgId, orgId));

/** Processing is dispatched with .catch(), so rows are waited for. */
async function waitForTicket(
  externalThreadId: string,
  timeoutMs = 4000,
): Promise<Array<{ [k: string]: unknown }>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await anyTicketFor(externalThreadId)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const event = (object: 'instagram' | 'page', pageId: string, senderId: string) => ({
  object,
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: senderId },
          recipient: { id: pageId },
          timestamp: Date.now(),
          message: { mid: `mid-${senderId}`, text: 'dobry den' },
        },
      ],
    },
  ],
});

const post = async (channel: 'instagram' | 'messenger', pageId: string, senderId: string) => {
  const payload = JSON.stringify(
    channel === 'instagram'
      ? event('instagram', pageId, senderId)
      : event('page', pageId, senderId),
  );
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/webhooks/${channel}`,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`,
    },
    payload,
  });
  return { statusCode: res.statusCode, body: res.body };
};

const prev = {
  ig: process.env.ENABLE_INSTAGRAM_WEBHOOK,
  fb: process.env.ENABLE_MESSENGER_WEBHOOK,
  secret: process.env.META_APP_SECRET,
  defaultOrg: process.env.DEFAULT_ORG_ID,
};

beforeAll(async () => {
  process.env.ENABLE_INSTAGRAM_WEBHOOK = 'true';
  process.env.ENABLE_MESSENGER_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

  const [fb] = await db
    .insert(organizations)
    .values({ name: 'igfb fallback', slug: `igfb-fb-${tag}` })
    .returning({ id: organizations.id });
  fallbackOrg = fb!.id;

  const [own] = await db
    .insert(organizations)
    .values({ name: 'igfb owner', slug: `igfb-own-${tag}` })
    .returning({ id: organizations.id });
  ownerOrg = own!.id;

  // The single-tenant leftover, pointed at the organisation that does NOT own
  // the pages — which is what it becomes the moment a second tenant exists.
  process.env.DEFAULT_ORG_ID = fallbackOrg;

  await db.insert(metaPageMappings).values([
    { orgId: ownerOrg, pageId: IG_PAGE, channel: 'instagram', pageName: `ig ${tag}`, active: true },
    { orgId: ownerOrg, pageId: FB_PAGE, channel: 'messenger', pageName: `fb ${tag}`, active: true },
  ]);

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  for (const orgId of [fallbackOrg, ownerOrg]) {
    if (!orgId) continue;
    const ids = (
      await db
        .select({ id: helpdeskTickets.id })
        .from(helpdeskTickets)
        .where(eq(helpdeskTickets.orgId, orgId))
    ).map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(ticketMessages).where(inArray(ticketMessages.ticketId, ids));
    }
    await db.delete(helpdeskTickets).where(eq(helpdeskTickets.orgId, orgId));
    await db.delete(metaPageMappings).where(eq(metaPageMappings.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_INSTAGRAM_WEBHOOK: prev.ig,
    ENABLE_MESSENGER_WEBHOOK: prev.fb,
    META_APP_SECRET: prev.secret,
    DEFAULT_ORG_ID: prev.defaultOrg,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

const CASES = [
  { channel: 'instagram' as const, page: IG_PAGE, unknownPage: IG_PAGE_UNKNOWN },
  { channel: 'messenger' as const, page: FB_PAGE, unknownPage: FB_PAGE_UNKNOWN },
];

for (const { channel, page, unknownPage } of CASES) {
  describe(`an inbound ${channel} message belongs to the org that registered the page`, () => {
    it('the ticket is opened in the owner organisation, not in DEFAULT_ORG_ID', async () => {
      const who = sender(`${channel}-owned`);
      const fallbackBefore = await allTicketsOf(fallbackOrg);

      const res = await post(channel, page, who);
      expect(res.statusCode, `body: ${res.body}`).toBe(200);

      const rows = await waitForTicket(who);
      expect(rows, 'the handler never reached the ticket insert').toHaveLength(1);
      expect(rows[0]!.orgId, 'the ticket was opened in the wrong organisation').toBe(ownerOrg);
      expect(rows[0]!.channel).toBe(channel);
      expect(rows[0]!.externalThreadId).toBe(who);
      expect(rows[0]!.externalIdentity).toBe(who);
      expect(rows[0]!.status).toBe('open');
      expect((rows[0]!.channelMetadata as { page_id?: string }).page_id).toBe(page);

      const msgs = await db
        .select()
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, rows[0]!.id as string));
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.body).toBe('dobry den');
      expect(msgs[0]!.direction).toBe('inbound');

      // And the organisation the env variable names is exactly as it was.
      expect(await ticketsFor(fallbackOrg, who)).toHaveLength(0);
      expect((await allTicketsOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
        fallbackBefore.map((r) => r.id).sort(),
      );
    });

    it('a page nobody registered files nothing, anywhere, and the answer still comes', async () => {
      const who = sender(`${channel}-unknown`);
      const fallbackBefore = await allTicketsOf(fallbackOrg);
      const ownerBefore = await allTicketsOf(ownerOrg);

      const res = await post(channel, unknownPage, who);
      // Still 200: Meta retries anything else, and eventually disables the
      // subscription — which would cost the messages that do resolve.
      expect(res.statusCode, `body: ${res.body}`).toBe(200);
      expect(res.body).toContain('received');

      expect(
        await waitForTicket(who, 1500),
        'a stranger’s message opened a ticket under DEFAULT_ORG_ID',
      ).toHaveLength(0);
      expect((await allTicketsOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
        fallbackBefore.map((r) => r.id).sort(),
      );
      expect((await allTicketsOf(ownerOrg)).map((r) => r.id).sort()).toEqual(
        ownerBefore.map((r) => r.id).sort(),
      );
    });
  });
}
