/**
 * A reply by email lands in the ticket it answers.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * Every inbound email routed to the helpdesk called `openTicket`. Nothing
 * read In-Reply-To or References, and the first message's own Message-ID was
 * not stored on the ticket, so there was nothing to read them against. The
 * customer writes, the agent answers in the ticket, the customer answers the
 * agent — and that answer becomes a second ticket with one message, cut off
 * from the conversation it belongs to.
 *
 * ─── Whose thread ────────────────────────────────────────────────────────────
 *
 * Message-IDs are `<uuid@one-shared-domain>` for every org, so an id says
 * nothing about whose message it was. The lookup is scoped by the org the
 * inbound route resolved: an In-Reply-To naming another org's message finds
 * nothing and opens a new ticket here, and the other org's ticket is not
 * touched. That case asserts on the foreign ticket's messages, not just on
 * this org's ticket count.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "One ticket" is also what a receiver that drops every reply looks like. So
 * the thread case asserts all three bodies in order, and the cases below pin
 * that a first message still opens a ticket, a message without headers still
 * opens one, and a different sender without headers gets their own.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, contacts, inboundEmails } from '../db/schema/index.js';
import { helpdeskTickets, ticketMessages } from '../db/schema/helpdesk.js';
import type { InboundPayload, receiveInbound } from '../services/inbound-email/index.js';
import type { recordOutbound } from '../services/helpdesk/universal-inbox.js';

const madeOrgs: string[] = [];
const CUSTOMER = 'zakaznik@example.test';

async function makeOrg(withContact = true): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({ name: 'inbound-thread itest', slug: `inbound-thread-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  madeOrgs.push(o!.id);
  if (withContact) await db.insert(contacts).values({ orgId: o!.id, email: CUSTOMER });
  return o!.id;
}

const mid = () => `<${randomUUID()}@example.test>`;

/** The helpdesk route only exists with FEATURE_BEYOND_CORE on; env is read at import. */
async function withHelpdesk<T>(
  fn: (m: {
    receiveInbound: typeof receiveInbound;
    recordOutbound: typeof recordOutbound;
  }) => Promise<T>,
): Promise<T> {
  vi.resetModules();
  const prev = process.env.FEATURE_BEYOND_CORE;
  process.env.FEATURE_BEYOND_CORE = 'true';
  try {
    const { receiveInbound } = await import('../services/inbound-email/index.js');
    const { recordOutbound } = await import('../services/helpdesk/universal-inbox.js');
    return await fn({ receiveInbound, recordOutbound });
  } finally {
    if (prev === undefined) delete process.env.FEATURE_BEYOND_CORE;
    else process.env.FEATURE_BEYOND_CORE = prev;
  }
}

function mail(over: Partial<InboundPayload>): InboundPayload {
  return {
    from: `Jana Zákaznice <${CUSTOMER}>`,
    to: 'support@acme.test',
    subject: 'Nefunguje mi export',
    textBody: 'Dobrý den, potřebuji pomoc.',
    messageId: mid(),
    ...over,
  };
}

async function ticketsFor(org: string) {
  return db
    .select()
    .from(helpdeskTickets)
    .where(eq(helpdeskTickets.orgId, org))
    .orderBy(asc(helpdeskTickets.createdAt));
}

async function messagesOf(ticketId: string) {
  return db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));
}

afterAll(async () => {
  if (madeOrgs.length) {
    await db.delete(inboundEmails).where(inArray(inboundEmails.orgId, madeOrgs));
    await db.delete(helpdeskTickets).where(inArray(helpdeskTickets.orgId, madeOrgs));
    await db.delete(contacts).where(inArray(contacts.orgId, madeOrgs));
    await db.delete(organizations).where(inArray(organizations.id, madeOrgs));
  }
});

describe('a reply joins the ticket it answers', () => {
  it('customer → agent → customer is one ticket with three messages', async () => {
    const org = await makeOrg();
    const first = mid();
    const agentId = mid();

    await withHelpdesk(async ({ receiveInbound, recordOutbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'Q1 zákazník' }));

      // Not silently green: the first message still opens exactly one ticket.
      const opened = await ticketsFor(org);
      expect(opened).toHaveLength(1);

      await recordOutbound(org, opened[0]!.id, { body: 'A1 agent', externalMessageId: agentId });

      await receiveInbound(
        org,
        mail({
          subject: 'Re: Nefunguje mi export',
          textBody: 'Q2 zákazník',
          inReplyTo: agentId,
          headers: { References: `${first} ${agentId}` },
        }),
      );
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    const bodies = (await messagesOf(tickets[0]!.id)).map((m) => [m.sender, m.body]);
    expect(bodies).toEqual([
      ['customer', 'Q1 zákazník'],
      ['agent', 'A1 agent'],
      ['customer', 'Q2 zákazník'],
    ]);
  });

  it('References alone threads it, walking back past a parent we never stored', async () => {
    const org = await makeOrg();
    const first = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'root' }));
      await receiveInbound(
        org,
        mail({ textBody: 'reply', headers: { references: `${first} ${mid()}` } }),
      );
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    expect((await messagesOf(tickets[0]!.id)).map((m) => m.body)).toEqual(['root', 'reply']);
  });

  it('In-Reply-To without angle brackets (as the engine MX receiver posts it) still threads', async () => {
    const org = await makeOrg();
    const first = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first.slice(1, -1), textBody: 'root' }));
      await receiveInbound(org, mail({ textBody: 'reply', inReplyTo: first.slice(1, -1) }));
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    expect((await messagesOf(tickets[0]!.id)).map((m) => m.body)).toEqual(['root', 'reply']);
  });
});

describe('another org’s thread', () => {
  it('a foreign In-Reply-To opens a new ticket and writes nothing into the foreign one', async () => {
    const victim = await makeOrg();
    const attacker = await makeOrg();
    const victimMsg = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(victim, mail({ messageId: victimMsg, textBody: 'victim original' }));
      await receiveInbound(
        attacker,
        mail({
          textBody: 'cizí odpověď',
          inReplyTo: victimMsg,
          headers: { References: victimMsg },
        }),
      );
    });

    const victimTickets = await ticketsFor(victim);
    expect(victimTickets).toHaveLength(1);
    expect((await messagesOf(victimTickets[0]!.id)).map((m) => m.body)).toEqual([
      'victim original',
    ]);

    const own = await ticketsFor(attacker);
    expect(own).toHaveLength(1);
    expect((await messagesOf(own[0]!.id)).map((m) => m.body)).toEqual(['cizí odpověď']);
  });

  it('a message id held by a Meta ticket of the same org is not an email thread', async () => {
    const org = await makeOrg();
    const metaId = mid();
    const [meta] = await db
      .insert(helpdeskTickets)
      .values({ orgId: org, subject: 'IG', channel: 'instagram' })
      .returning();
    await db.insert(ticketMessages).values({
      ticketId: meta!.id,
      sender: 'ig-user',
      body: 'instagram',
      externalMessageId: metaId.slice(1, -1),
    });

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ textBody: 'email', inReplyTo: metaId }));
    });

    expect((await messagesOf(meta!.id)).map((m) => m.body)).toEqual(['instagram']);
    expect(await ticketsFor(org)).toHaveLength(2);
  });
});

describe('what must not break the thread', () => {
  it('a different sender replying is appended and marked, the owner is not marked', async () => {
    const org = await makeOrg();
    const first = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'owner' }));
      await receiveInbound(
        org,
        mail({ from: 'kolega@example.test', textBody: 'colleague', inReplyTo: first }),
      );
      await receiveInbound(org, mail({ textBody: 'owner again', inReplyTo: first }));
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    const msgs = await messagesOf(tickets[0]!.id);
    expect(msgs.map((m) => [m.body, m.metadata])).toEqual([
      ['owner', { fromAddress: CUSTOMER }],
      ['colleague', { fromAddress: 'kolega@example.test', senderNotOnTicket: true }],
      ['owner again', { fromAddress: CUSTOMER }],
    ]);
  });

  it('without a contact, the first sender owns the ticket', async () => {
    const org = await makeOrg(false);
    const first = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'a' }));
      await receiveInbound(org, mail({ textBody: 'b', inReplyTo: first }));
      await receiveInbound(
        org,
        mail({ from: 'jiny@example.test', textBody: 'c', inReplyTo: first }),
      );
    });

    const [t] = await ticketsFor(org);
    expect((await messagesOf(t!.id)).map((m) => m.metadata.senderNotOnTicket ?? false)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('a reply to a closed ticket reopens it', async () => {
    const org = await makeOrg();
    const first = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'a' }));
      const [t] = await ticketsFor(org);
      await db
        .update(helpdeskTickets)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(helpdeskTickets.id, t!.id));
      await receiveInbound(org, mail({ textBody: 'b', inReplyTo: first }));
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.status).toBe('open');
    expect(tickets[0]!.closedAt).toBeNull();
    expect((await messagesOf(tickets[0]!.id)).map((m) => m.body)).toEqual(['a', 'b']);
  });

  it('a redelivered reply with the same Message-ID is stored once', async () => {
    const org = await makeOrg();
    const first = mid();
    const reply = mid();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ messageId: first, textBody: 'a' }));
      await receiveInbound(org, mail({ messageId: reply, textBody: 'b', inReplyTo: first }));
      await receiveInbound(org, mail({ messageId: reply, textBody: 'b', inReplyTo: first }));
    });

    const [t] = await ticketsFor(org);
    expect((await messagesOf(t!.id)).map((m) => m.body)).toEqual(['a', 'b']);
  });
});

describe('what still opens a ticket', () => {
  it('a message with no thread headers opens its own ticket', async () => {
    const org = await makeOrg();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ textBody: 'one' }));
      await receiveInbound(org, mail({ textBody: 'two', messageId: undefined }));
    });

    expect(await ticketsFor(org)).toHaveLength(2);
  });

  it('a different sender without headers gets their own ticket', async () => {
    const org = await makeOrg();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ textBody: 'mine' }));
      await receiveInbound(org, mail({ from: 'jiny@example.test', textBody: 'theirs' }));
    });

    const tickets = await ticketsFor(org);
    expect(tickets).toHaveLength(2);
    expect((await messagesOf(tickets[1]!.id)).map((m) => m.body)).toEqual(['theirs']);
  });

  it('an In-Reply-To that matches nothing opens a ticket', async () => {
    const org = await makeOrg();

    await withHelpdesk(async ({ receiveInbound }) => {
      await receiveInbound(org, mail({ textBody: 'orphan', inReplyTo: mid() }));
    });

    expect(await ticketsFor(org)).toHaveLength(1);
  });
});
