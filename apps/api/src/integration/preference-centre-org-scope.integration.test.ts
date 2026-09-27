/**
 * The preference centre only touches lists of the organisation in its token.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * POST /p/center/:token takes list ids in the JSON body. `resubscribeToLists`
 * inserted a contact_lists row for whatever id it was given — so a token issued
 * by organisation A put A's contact on organisation B's list. The signed token
 * proves who the contact is; it says nothing about the list ids beside it.
 * Measured in Z90: 200, one row on B's list. Recorded as known-open in
 * scripts/org-scope-write-allowlist.json until now.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A route that refused everything would pass the cross-org case. So every
 * refusal is followed by the legitimate case on the contact's own list, which
 * must change a row: leave it, and rejoin it.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The HTML form path of the same route; it only ever names the contact's own
 *   lists, and preference-centre-page (workers) covers it end to end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, lists, contactLists } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let contactId: string;
let ownList: string;
let foreignList: string;
let token: string;

async function post(body: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url: `/p/center/${token}`, payload: body });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { data: { listChanges: { listId: string; subscribed: boolean }[] } };
}

/** This contact's rows on organisation B's list — the number that must stay 0. */
async function rowsOnForeignList(): Promise<number> {
  const rows = await db
    .select({ listId: contactLists.listId })
    .from(contactLists)
    .innerJoin(lists, eq(lists.id, contactLists.listId))
    .where(and(eq(contactLists.contactId, contactId), eq(lists.orgId, orgB)));
  return rows.length;
}

async function ownListSubscribed(): Promise<boolean> {
  const [row] = await db
    .select({ unsubscribedAt: contactLists.unsubscribedAt })
    .from(contactLists)
    .where(and(eq(contactLists.contactId, contactId), eq(contactLists.listId, ownList)));
  return row !== undefined && row.unsubscribedAt === null;
}

describe('POST /p/center/:token stays inside the token’s organisation', () => {
  beforeAll(async () => {
    app = await createTestApp();
    const [a] = await db
      .insert(organizations)
      .values({ name: 'pref scope A', slug: `pref-scope-a-${tag}` })
      .returning({ id: organizations.id });
    const [b] = await db
      .insert(organizations)
      .values({ name: 'pref scope B', slug: `pref-scope-b-${tag}` })
      .returning({ id: organizations.id });
    orgA = a!.id;
    orgB = b!.id;

    const [c] = await db
      .insert(contacts)
      .values({ orgId: orgA, email: `pref-scope-${tag}@test.local` })
      .returning({ id: contacts.id });
    contactId = c!.id;

    const [la] = await db
      .insert(lists)
      .values({ orgId: orgA, name: `A list ${tag}` })
      .returning({ id: lists.id });
    const [lb] = await db
      .insert(lists)
      .values({ orgId: orgB, name: `B list ${tag}` })
      .returning({ id: lists.id });
    ownList = la!.id;
    foreignList = lb!.id;
    await db.insert(contactLists).values({ contactId, listId: ownList });

    token = createTrackingToken({
      type: 'pref',
      orgId: orgA,
      contactId,
      ts: Math.floor(Date.now() / 1000),
    });
  }, 120_000);

  afterAll(async () => {
    await db.delete(contactLists).where(eq(contactLists.contactId, contactId));
    await db.delete(contacts).where(eq(contacts.id, contactId));
    await db.delete(lists).where(inArray(lists.id, [ownList, foreignList]));
    await db.execute(dsql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`);
    await app.close();
  }, 120_000);

  it('does not put the contact on another organisation’s list', async () => {
    const res = await post({ resubscribeToLists: [foreignList] });
    expect(await rowsOnForeignList(), 'the contact landed on organisation B’s list').toBe(0);
    expect(res.data.listChanges).toEqual([]);
  });

  it('still lets the contact leave their own list', async () => {
    const res = await post({ unsubscribeFromLists: [ownList] });
    expect(res.data.listChanges).toEqual([{ listId: ownList, subscribed: false }]);
    expect(await ownListSubscribed()).toBe(false);
  });

  it('a mixed request rejoins the own list and ignores the foreign one', async () => {
    const res = await post({ resubscribeToLists: [ownList, foreignList] });
    expect(res.data.listChanges).toEqual([{ listId: ownList, subscribed: true }]);
    expect(await ownListSubscribed()).toBe(true);
    expect(await rowsOnForeignList()).toBe(0);
  });

  it('an unsubscribe naming the foreign list changes nothing there and still works for its own', async () => {
    const res = await post({ unsubscribeFromLists: [foreignList, ownList] });
    expect(res.data.listChanges).toEqual([{ listId: ownList, subscribed: false }]);
    expect(await rowsOnForeignList()).toBe(0);
  });
});
