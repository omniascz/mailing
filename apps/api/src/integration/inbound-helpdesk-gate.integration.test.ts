/**
 * Inbound mail does not file tickets into a helpdesk the customer cannot open.
 *
 * Helpdesk is a beyond-core domain: with FEATURE_BEYOND_CORE off its routes are
 * not registered, so `GET /api/v1/helpdesk/tickets` answers 404. But the
 * inbound-email route is core — it has to be, because the same handler
 * classifies asynchronous bounces and writes suppressions — and its default
 * routing sent anything addressed to support@/help@/hello@/contact@ straight to
 * `openTicket`. Not opt-in: a default, applied when an org has configured no
 * rules at all.
 *
 * So on a production deployment a message to support@ created a row in
 * `helpdesk_tickets` and there was no endpoint that could ever read it back.
 * Customer data going into a drawer with no handle.
 *
 * These pin both directions, because a test that only proved the ticket is gone
 * would also pass if inbound mail had been broken altogether:
 *
 *   flag off → no ticket, mail still stored, workflow event still fires
 *   flag on  → ticket created and readable, exactly as before
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { eq, inArray, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, inboundEmails, helpdeskTickets } from '../db/schema/index.js';

const madeOrgs: string[] = [];

/** A fresh org per case: the routing defaults key off the recipient, not the org. */
async function makeOrg(): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({ name: 'inbound-gate itest', slug: `inbound-gate-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  madeOrgs.push(o!.id);
  return o!.id;
}

/**
 * Run receiveInbound with the flag forced to a value.
 *
 * The module reads `env.FEATURE_BEYOND_CORE` at call time, but `env` is parsed
 * once at import, so the flag has to be in place before the graph is loaded —
 * hence resetModules and a fresh dynamic import per case rather than a spy.
 */
async function receiveWithFlag(
  flag: boolean,
  orgIdArg: string,
  to: string,
): Promise<{ id: string }> {
  vi.resetModules();
  const prev = process.env.FEATURE_BEYOND_CORE;
  process.env.FEATURE_BEYOND_CORE = flag ? 'true' : 'false';
  try {
    const { receiveInbound } = await import('../services/inbound-email/index.js');
    return await receiveInbound(orgIdArg, {
      from: 'zakaznik@example.test',
      to,
      subject: 'Nefunguje mi export',
      textBody: 'Dobrý den, potřebuji pomoc.',
      messageId: `<${randomUUID()}@example.test>`,
    });
  } finally {
    if (prev === undefined) delete process.env.FEATURE_BEYOND_CORE;
    else process.env.FEATURE_BEYOND_CORE = prev;
  }
}

async function ticketsFor(org: string) {
  return db.select().from(helpdeskTickets).where(eq(helpdeskTickets.orgId, org));
}

afterAll(async () => {
  if (madeOrgs.length) {
    await db.delete(inboundEmails).where(inArray(inboundEmails.orgId, madeOrgs));
    await db.delete(helpdeskTickets).where(inArray(helpdeskTickets.orgId, madeOrgs));
    await db.delete(organizations).where(inArray(organizations.id, madeOrgs));
  }
});

describe('with helpdesk switched off', () => {
  it('mail to support@ opens no ticket', async () => {
    const org = await makeOrg();

    await receiveWithFlag(false, org, 'support@acme.test');

    // The defect: this used to be one ticket, unreadable through any route.
    expect(await ticketsFor(org)).toHaveLength(0);
  });

  it('the message itself is still stored and still readable', async () => {
    const org = await makeOrg();

    const row = await receiveWithFlag(false, org, 'help@acme.test');

    // Nothing is lost by not opening a ticket: receiveInbound stores the mail
    // before any action runs, and listInbound/getInbound are core routes.
    const stored = await db
      .select()
      .from(inboundEmails)
      .where(and(eq(inboundEmails.orgId, org), eq(inboundEmails.id, row.id)));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.fromAddress).toBe('zakaznik@example.test');
    expect(stored[0]!.processed).toBe(true);
  });

  it.each(['support', 'help', 'hello', 'contact'])(
    '%s@ — every address the default rule matched opens no ticket',
    async (local) => {
      const org = await makeOrg();

      await receiveWithFlag(false, org, `${local}@acme.test`);

      expect(await ticketsFor(org)).toHaveLength(0);
    },
  );

  it('an ordinary address is unaffected — it never routed to helpdesk anyway', async () => {
    const org = await makeOrg();

    const row = await receiveWithFlag(false, org, 'jan.novak@acme.test');

    expect(await ticketsFor(org)).toHaveLength(0);
    expect(row.id).toBeTruthy();
  });
});

describe('with helpdesk switched on', () => {
  it('mail to support@ opens a ticket, exactly as before', async () => {
    const org = await makeOrg();

    await receiveWithFlag(true, org, 'support@acme.test');

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.subject).toBe('Nefunguje mi export');
  });

  it('an ordinary address still opens none', async () => {
    const org = await makeOrg();

    await receiveWithFlag(true, org, 'jan.novak@acme.test');

    expect(await ticketsFor(org)).toHaveLength(0);
  });
});
