/**
 * A Mailchimp migration builds the running org's audience, not somebody else's.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * The member loop resolved each address with `where(eq(contacts.email, email))`
 * and no org. When another tenant already held the address, the migration took
 * the "already exists" branch, counted it as `skipped` — and then carried that
 * FOREIGN contact id into the org's own join tables:
 *
 *     insert(contactLists).values({ contactId, listId: forgeListId })
 *     insert(contactTags).values({ contactId, tagId })
 *
 * `contact_lists` has no `org_id` of its own (db/schema/lists.ts:28-38);
 * membership is implied by the list, and the list was created under the running
 * org. So another tenant's contact became a member of this org's list and wore
 * this org's tags — and list membership is what campaign audiences resolve
 * from, so that person would have received this org's mail.
 *
 * ─── Why the network is stubbed and the database is not ──────────────────────
 *
 * `startMailchimpMigration` reaches Mailchimp through the global `fetch`, so
 * `fetch` is replaced with canned responses for the three endpoints it calls.
 * Everything below the network — the lists it creates, the contacts it resolves
 * and the join rows it writes — is the real code against the real Postgres,
 * which is where the defect lives.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, contactLists, lists, migrationJobs } from '../db/schema/index.js';
import { startMailchimpMigration } from '../services/migrations/mailchimp.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let bContactId: string;
const SHARED = `mc-${randomUUID().slice(0, 8)}@tenant.test`;
const realFetch = globalThis.fetch;

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.105.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `mc-${tag}@example.test`,
      password: 'McTenant1234!',
      name: 'Mc Tenant',
      orgName: `Mc Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const id = (res.json() as { user?: { orgId?: string } }).user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

/** Canned Mailchimp: one audience holding one member. */
function stubMailchimp(memberEmail: string, listName: string) {
  const json = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

  globalThis.fetch = ((url: string | URL) => {
    const u = String(url);
    if (u.includes('/ping')) return json({ health_status: "Everything's Chimpy!" });
    if (u.includes('/templates')) return json({ templates: [], total_items: 0 });
    if (u.includes('/members')) {
      return json({
        members: [
          {
            id: 'm1',
            email_address: memberEmail,
            status: 'subscribed',
            merge_fields: { FNAME: 'Ada', LNAME: 'Lovelace' },
            tags: [],
          },
        ],
        total_items: 1,
      });
    }
    if (u.includes('/lists')) {
      return json({
        lists: [{ id: 'mc1', name: listName, stats: { member_count: 1 } }],
        total_items: 1,
      });
    }
    return json({});
  }) as typeof globalThis.fetch;
}

const contactRow = (id: string) => db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

/**
 * startMailchimpMigration returns as soon as the job row exists and does the
 * work in a fire-and-forget promise (mailchimp.ts:131), so the assertions have
 * to wait for the row to settle rather than for the call to return.
 */
async function runMigration(orgId: string): Promise<void> {
  const job = await startMailchimpMigration(orgId, 'key-us1');
  for (let i = 0; i < 200; i++) {
    const [row] = await db
      .select({ status: migrationJobs.status })
      .from(migrationJobs)
      .where(eq(migrationJobs.id, job.id))
      .limit(1);
    if (row?.status === 'completed' || row?.status === 'failed') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('migration job never settled');
}

/** Every list this org owns, so membership can be checked without guessing ids. */
async function orgListIds(orgId: string): Promise<string[]> {
  const rows = await db.select({ id: lists.id }).from(lists).where(eq(lists.orgId, orgId));
  return rows.map((r) => r.id);
}

beforeAll(async () => {
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  const [row] = await db
    .insert(contacts)
    .values({ orgId: orgB, email: SHARED, firstName: 'Belongs', lastName: 'ToB' })
    .returning({ id: contacts.id });
  bContactId = row!.id;
}, 120_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  await app?.close();
});

describe('a Mailchimp migration builds the running org’s audience', () => {
  it("does not put org B's contact into org A's list", async () => {
    const before = (await contactRow(bContactId))[0];
    stubMailchimp(SHARED, `MC Audience ${randomUUID().slice(0, 6)}`);

    await runMigration(orgA);

    const aLists = await orgListIds(orgA);
    expect(aLists.length, 'the migration created no list to check against').toBeGreaterThan(0);

    const leaked = await db
      .select({ contactId: contactLists.contactId })
      .from(contactLists)
      .where(and(eq(contactLists.contactId, bContactId), inArray(contactLists.listId, aLists)));
    expect(
      leaked,
      "org B's contact was made a member of org A's list — the member lookup has no org " +
        'filter, so the migration carried another tenant’s contact id into this org’s join ' +
        'tables, and list membership is what campaign audiences resolve from',
    ).toEqual([]);

    // Org B's own row is untouched, field for field.
    expect((await contactRow(bContactId))[0]).toEqual(before);
  }, 180_000);

  it('creates the contact under org A and puts THAT one in the list', async () => {
    const [mine] = await db
      .select({ id: contacts.id, source: contacts.source, firstName: contacts.firstName })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, SHARED)))
      .limit(1);

    expect(mine, 'org A ran the migration but got no contact of its own').toBeDefined();
    expect(mine!.source).toBe('mailchimp_migration');
    expect(mine!.firstName).toBe('Ada');

    const aLists = await orgListIds(orgA);
    const member = await db
      .select({ contactId: contactLists.contactId })
      .from(contactLists)
      .where(and(eq(contactLists.contactId, mine!.id), inArray(contactLists.listId, aLists)));
    expect(member.length, 'org A’s own contact never joined org A’s list').toBeGreaterThan(0);
  }, 120_000);
});

describe('negative control — the migration reuses the org’s own contact', () => {
  it('does not create a second contact when org A already has the address', async () => {
    const email = `mcown-${randomUUID().slice(0, 8)}@tenant.test`;
    const [own] = await db
      .insert(contacts)
      .values({ orgId: orgA, email, firstName: 'Already', lastName: 'Here' })
      .returning({ id: contacts.id });

    stubMailchimp(email, `MC Audience ${randomUUID().slice(0, 6)}`);
    await runMigration(orgA);

    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)));
    expect(
      rows.map((r) => r.id),
      'the filter must narrow the lookup, not make every migration insert a fresh copy',
    ).toEqual([own!.id]);

    const aLists = await orgListIds(orgA);
    const member = await db
      .select({ contactId: contactLists.contactId })
      .from(contactLists)
      .where(and(eq(contactLists.contactId, own!.id), inArray(contactLists.listId, aLists)));
    expect(
      member.length,
      'the existing contact was not added to the imported list',
    ).toBeGreaterThan(0);
  }, 180_000);
});
