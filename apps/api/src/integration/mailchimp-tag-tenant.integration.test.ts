/**
 * A migrated tag belongs to the org that ran the migration.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * The tag loop resolved each Mailchimp tag by name alone:
 *
 *     .from(tagsTable).where(eq(tagsTable.name, mcTag.name))
 *
 * `tags` is UNIQUE on (org_id, name), so a bare name is not a key — it names
 * one row per org, and the query took whichever came back. Finding another
 * org's "vip" meant the `if (!tag)` branch never ran, so the migrating org
 * never got a tag of its own, and the foreign tag id was then written into
 * `contact_tags`, which has no org_id at all (db/schema/tags.ts:33-45): it is
 * (contact_id, tag_id) and nothing else.
 *
 * The result is a contact in org A wearing a tag row owned by org B. Org A's
 * tag list does not contain it, so nobody in org A can see or remove it, and
 * org A's `has_tag` segment rules match it by name
 * (services/segments/query-builder.ts:111-114 compares `t.name` without an
 * org), so it silently changes who org A's segments select.
 *
 * ─── What it is NOT ──────────────────────────────────────────────────────────
 *
 * It is not a cross-tenant recipient leak. Both audience resolvers filter the
 * contact by org before any tag subquery runs — `eq(contacts.orgId, orgId)` at
 * campaigns/channel-dispatch.ts:58 and `c."org_id" = ${orgId}` at
 * campaigns/auto-resend.ts:209 — so org B cannot mail org A's people through a
 * shared tag name. The damage stays inside org A's own targeting.
 *
 * ─── Why the network is stubbed and the database is not ──────────────────────
 *
 * `startMailchimpMigration` reaches Mailchimp through the global `fetch`, which
 * is replaced with canned responses. Everything below it — the tags it
 * resolves, creates and attaches — is the real code against the real Postgres.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, contactTags, tags, migrationJobs } from '../db/schema/index.js';
import { startMailchimpMigration } from '../services/migrations/mailchimp.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let bTagId: string;
const TAG = `vip-${randomUUID().slice(0, 8)}`;
const MEMBER = `tag-${randomUUID().slice(0, 8)}@tenant.test`;
const realFetch = globalThis.fetch;

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.106.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `tag-${tag}@example.test`,
      password: 'TagTenant1234!',
      name: 'Tag Tenant',
      orgName: `Tag Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const id = (res.json() as { user?: { orgId?: string } }).user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

/** Canned Mailchimp: one audience, one member, carrying one tag. */
function stubMailchimp(memberEmail: string, tagName: string, listName: string) {
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
            tags: [{ id: 1, name: tagName }],
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

/**
 * startMailchimpMigration returns once the job row exists and does the work in
 * a fire-and-forget promise (mailchimp.ts:131), so the assertions wait for the
 * row to settle rather than for the call to return.
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

const tagRow = (id: string) => db.select().from(tags).where(eq(tags.id, id)).limit(1);
const linksForTag = (id: string) => db.select().from(contactTags).where(eq(contactTags.tagId, id));

beforeAll(async () => {
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  // Only org B has the tag. Org A is the one migrating.
  const [row] = await db.insert(tags).values({ orgId: orgB, name: TAG }).returning({ id: tags.id });
  bTagId = row!.id;
}, 120_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  await app?.close();
});

describe('a migrated tag belongs to the org that ran the migration', () => {
  it("does not attach org B's tag to org A's contact", async () => {
    const tagBefore = (await tagRow(bTagId))[0];
    const linksBefore = await linksForTag(bTagId);

    stubMailchimp(MEMBER, TAG, `MC Tags ${randomUUID().slice(0, 6)}`);
    await runMigration(orgA);

    const aContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, MEMBER)));
    expect(aContacts.length, 'the migration created no contact to check against').toBe(1);

    const leaked = await db
      .select({ tagId: contactTags.tagId })
      .from(contactTags)
      .where(
        and(
          eq(contactTags.tagId, bTagId),
          inArray(
            contactTags.contactId,
            aContacts.map((c) => c.id),
          ),
        ),
      );
    expect(
      leaked,
      "org A's contact was given org B's tag row — the tag lookup matched on name alone, and " +
        'tags is UNIQUE on (org_id, name), so a bare name names one row per org rather than one row',
    ).toEqual([]);

    // Org B's tag and every link it already had, unchanged field for field.
    expect((await tagRow(bTagId))[0]).toEqual(tagBefore);
    expect(await linksForTag(bTagId)).toEqual(linksBefore);
  }, 180_000);

  it('creates the tag under org A and attaches THAT one', async () => {
    const [mine] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, orgA), eq(tags.name, TAG)))
      .limit(1);
    expect(mine, 'org A ran the migration but got no tag of its own').toBeDefined();
    expect(mine!.id).not.toBe(bTagId);

    const [aContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, MEMBER)))
      .limit(1);

    const link = await db
      .select({ tagId: contactTags.tagId })
      .from(contactTags)
      .where(and(eq(contactTags.contactId, aContact!.id), eq(contactTags.tagId, mine!.id)));
    expect(link.length, 'org A’s contact never got org A’s own tag').toBeGreaterThan(0);
  }, 120_000);
});

describe('negative control — the migration reuses the org’s own tag', () => {
  it('does not create a second tag when org A already has the name', async () => {
    const name = `own-${randomUUID().slice(0, 8)}`;
    const email = `tagown-${randomUUID().slice(0, 8)}@tenant.test`;
    const [own] = await db.insert(tags).values({ orgId: orgA, name }).returning({ id: tags.id });

    stubMailchimp(email, name, `MC Tags ${randomUUID().slice(0, 6)}`);
    await runMigration(orgA);

    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, orgA), eq(tags.name, name)));
    expect(
      rows.map((r) => r.id),
      'the filter must narrow the lookup, not make every migration mint a fresh tag',
    ).toEqual([own!.id]);

    const [aContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)))
      .limit(1);
    const link = await db
      .select({ tagId: contactTags.tagId })
      .from(contactTags)
      .where(and(eq(contactTags.contactId, aContact!.id), eq(contactTags.tagId, own!.id)));
    expect(link.length, 'the existing tag was not attached').toBeGreaterThan(0);
  }, 180_000);
});
