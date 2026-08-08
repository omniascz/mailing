/**
 * Unsubscribing writes one consistent state, and the send path honours it.
 *
 * Before this, fourteen paths each wrote their own subset of four stores. The
 * send path consulted exactly one of them — `suppressions` — so whether an
 * unsubscribe stuck depended entirely on which button the person pressed. Four
 * paths set `contacts.status` and nothing else, and those people kept getting
 * campaigns.
 *
 * The case that matters most here is the last one: a contact flagged
 * `unsubscribed` with no suppression row must not be sent to.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTrackingToken } from '@forgemsg/shared';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  campaigns,
  contactLists,
  contacts,
  emailEvents,
  lists,
  organizations,
  suppressions,
} from '../db/schema/index.js';
import { unsubscribeContact } from '../services/contacts/unsubscribe.js';

let app: FastifyInstance;
let orgId: string;
let campaignId: string;
let listA: string;
let listB: string;
const madeContacts: string[] = [];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'unsub itest', slug: `unsub-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const made = await db
    .insert(lists)
    .values([
      { orgId, name: `unsub-a ${randomUUID().slice(0, 6)}` },
      { orgId, name: `unsub-b ${randomUUID().slice(0, 6)}` },
    ])
    .returning({ id: lists.id });
  listA = made[0]!.id;
  listB = made[1]!.id;

  const [camp] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `unsub-itest ${randomUUID().slice(0, 8)}`,
      subject: 'Unsub probe',
      status: 'sending',
      type: 'email',
      listId: listA,
    })
    .returning({ id: campaigns.id });
  campaignId = camp!.id;
}, 120_000);

afterAll(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  await db.delete(campaigns).where(eq(campaigns.orgId, orgId));
  if (madeContacts.length > 0) {
    await db.delete(contactLists).where(inArray(contactLists.contactId, madeContacts));
  }
  await db.delete(suppressions).where(eq(suppressions.orgId, orgId));
  await db.delete(contacts).where(eq(contacts.orgId, orgId));
  await db.delete(lists).where(eq(lists.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app.close();
}, 60_000);

async function makeContact(onLists: string[] = [listA]): Promise<{ id: string; email: string }> {
  const email = `unsub-${randomUUID().slice(0, 10)}@test.local`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, status: 'active' })
    .returning({ id: contacts.id, email: contacts.email });
  madeContacts.push(c!.id);
  if (onLists.length > 0) {
    await db.insert(contactLists).values(onLists.map((listId) => ({ contactId: c!.id, listId })));
  }
  return { id: c!.id, email: c!.email! };
}

async function unsubEvents(contactId: string) {
  return db
    .select()
    .from(emailEvents)
    .where(and(eq(emailEvents.contactId, contactId), eq(emailEvents.eventType, 'unsubscribe')));
}

async function suppressionFor(email: string) {
  const [row] = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email.toLowerCase())));
  return row ?? null;
}

async function listRows(contactId: string) {
  return db
    .select({ listId: contactLists.listId, unsubscribedAt: contactLists.unsubscribedAt })
    .from(contactLists)
    .where(eq(contactLists.contactId, contactId));
}

describe('one-click unsubscribe writes one consistent state', () => {
  it('records the event with the campaign, the status and the suppression', async () => {
    const contact = await makeContact();
    // batch-sender has put campaignId in this payload since July; the decoder
    // was throwing it away, which is why no unsubscribe had a campaign.
    const token = createTrackingToken({
      type: 'unsub',
      orgId,
      contactId: contact.id,
      campaignId,
      ts: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe/${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(res.statusCode).toBe(204);

    const events = await unsubEvents(contact.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.campaignId).toBe(campaignId);
    expect((events[0]!.metadata as Record<string, unknown>).source).toBe('one_click');
    expect((events[0]!.metadata as Record<string, unknown>).scope).toBe('global');

    const [after] = await db
      .select({ status: contacts.status })
      .from(contacts)
      .where(eq(contacts.id, contact.id));
    expect(after!.status).toBe('unsubscribed');
    expect((await suppressionFor(contact.email))?.reason).toBe('unsubscribe');
  }, 60_000);

  it('a repeated one-click does not add a second event', async () => {
    const contact = await makeContact();
    const token = createTrackingToken({
      type: 'unsub',
      orgId,
      contactId: contact.id,
      campaignId,
      ts: Math.floor(Date.now() / 1000),
    });
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/unsubscribe/${token}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'List-Unsubscribe=One-Click',
      });

    expect((await post()).statusCode).toBe(204);
    expect((await post()).statusCode).toBe(204);
    expect((await post()).statusCode).toBe(204);

    // Gmail retries the one-click POST on timeout, and recipients click the
    // footer link twice. Counting those would inflate the one number mailbox
    // providers watch.
    expect(await unsubEvents(contact.id)).toHaveLength(1);
  }, 60_000);
});

describe('scope', () => {
  it('a per-list unsubscribe touches only that list', async () => {
    const contact = await makeContact([listA, listB]);

    const result = await unsubscribeContact(orgId, contact.id, {
      scope: { kind: 'list', listId: listA },
      source: 'preference_centre',
      reason: 'too many emails',
    });
    expect(result.changed).toBe(true);

    const rows = await listRows(contact.id);
    expect(rows.find((r) => r.listId === listA)!.unsubscribedAt).not.toBeNull();
    expect(rows.find((r) => r.listId === listB)!.unsubscribedAt).toBeNull();

    // Leaving one newsletter is not a refusal of everything.
    const [after] = await db
      .select({ status: contacts.status })
      .from(contacts)
      .where(eq(contacts.id, contact.id));
    expect(after!.status).toBe('active');
    expect(await suppressionFor(contact.email)).toBeNull();

    const events = await unsubEvents(contact.id);
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as Record<string, unknown>).scope).toBe('list');
    expect((events[0]!.metadata as Record<string, unknown>).wasLastList).toBe(false);
  }, 60_000);

  it('a global unsubscribe closes the per-list rows too', async () => {
    const contact = await makeContact([listA, listB]);

    const result = await unsubscribeContact(orgId, contact.id, {
      scope: { kind: 'global' },
      source: 'footer_link',
    });
    expect(result.changed).toBe(true);

    // Without this a later global resubscribe — which only lifts the
    // suppression — would quietly restore lists the contact had left.
    const rows = await listRows(contact.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.unsubscribedAt).not.toBeNull();

    expect((await suppressionFor(contact.email))?.reason).toBe('unsubscribe');
  }, 60_000);

  it('a repeated per-list unsubscribe changes nothing and adds no event', async () => {
    const contact = await makeContact([listA]);
    const opts = {
      scope: { kind: 'list' as const, listId: listA },
      source: 'preference_centre' as const,
    };

    expect((await unsubscribeContact(orgId, contact.id, opts)).changed).toBe(true);
    expect((await unsubscribeContact(orgId, contact.id, opts)).changed).toBe(false);
    expect(await unsubEvents(contact.id)).toHaveLength(1);
  }, 60_000);
});

describe('the send path honours contacts.status', () => {
  beforeEach(async () => {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  });

  it('a contact flagged unsubscribed with NO suppression is not returned as sendable', async () => {
    // This is the hole. Four paths — the contacts API, Resend-compat, the SMS
    // keyword handler, importers — set the status and nothing else, and the
    // send path only ever consulted `suppressions`, so these people kept
    // receiving campaigns.
    const contact = await makeContact();
    await db.update(contacts).set({ status: 'unsubscribed' }).where(eq(contacts.id, contact.id));

    expect(await suppressionFor(contact.email)).toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/contacts/batch',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      payload: { orgId, contactIds: [contact.id] },
    });
    expect(res.statusCode).toBe(200);

    // The endpoint still returns the row — it serves the transactional stream
    // too, where a receipt must reach someone who left the mailing list. What
    // it now carries is the status the batch-sender filters on.
    const rows = res.json().data as Array<{ id: string; status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('unsubscribed');
  }, 60_000);

  it('a bounced contact keeps the status it had — this change does not touch it', async () => {
    const contact = await makeContact();
    await db.update(contacts).set({ status: 'bounced' }).where(eq(contacts.id, contact.id));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/contacts/batch',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
      payload: { orgId, contactIds: [contact.id] },
    });
    const rows = res.json().data as Array<{ id: string; status: string }>;
    expect(rows[0]!.status).toBe('bounced');

    // Bounces and complaints get their suppression from mta-sender and
    // fbl-processor when they happen; the batch-sender filter deliberately
    // covers 'unsubscribed' only, so their behaviour is unchanged.
    expect(await suppressionFor(contact.email)).toBeNull();
    expect(await unsubEvents(contact.id)).toHaveLength(0);
  }, 60_000);
});
