/**
 * No click is recorded, and no contact changed, on an identifier nobody signed.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * GET /t/click/:linkId took the organisation and the contact from the query
 * string — `oid`, `cid` — with no signature, recorded a click for them in
 * email_events, ran whatever "click action" the `action` parameter decoded to
 * (add or remove a tag, overwrite a contact field, fire a workflow event) and
 * redirected to any `dest`. Anyone who knew or guessed two ids could write to
 * any organisation.
 *
 * Nothing in the product ever produced such a link. The route and its link
 * builder (services/campaigns/click-actions.ts, wrapLinkWithAction) arrived
 * together in the first commit and the builder never had a caller — and even
 * it did not put `oid` or `cid` in the URL. So no email ever carried one, and
 * the route is removed rather than secured.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A route that recorded nothing at all would pass the refusal. So it is
 * followed by the signed click path, /track/c/:token, for the same contact,
 * which must redirect to its URL and leave exactly one click row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, emailEvents, tags, contactTags } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
const TAG_NAME = `pwned-${tag}`;
const EVIL = 'https://evil.example.invalid/landing';
const SHOP = `https://shop.example.cz/produkt-${tag}`;

let app: FastifyInstance;
let orgId: string;
let contactId: string;

async function clicks(): Promise<number> {
  const rows = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
        eq(emailEvents.eventType, 'click'),
      ),
    );
  return rows.length;
}

async function tagged(): Promise<boolean> {
  const rows = await db
    .select({ tagId: contactTags.tagId })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(contactTags.contactId, contactId), eq(tags.name, TAG_NAME)));
  return rows.length > 0;
}

describe('the unsigned /t/click route is gone; the signed click path still works', () => {
  beforeAll(async () => {
    app = await createTestApp();
    const [o] = await db
      .insert(organizations)
      .values({ name: 'unsigned click victim', slug: `unsigned-click-${tag}` })
      .returning({ id: organizations.id });
    orgId = o!.id;
    const [c] = await db
      .insert(contacts)
      .values({ orgId, email: `unsigned-click-${tag}@test.local` })
      .returning({ id: contacts.id });
    contactId = c!.id;
  }, 120_000);

  afterAll(async () => {
    await db.delete(emailEvents).where(eq(emailEvents.contactId, contactId));
    await db.delete(contactTags).where(eq(contactTags.contactId, contactId));
    await db.delete(tags).where(eq(tags.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.id, contactId));
    await db.execute(dsql`DELETE FROM organizations WHERE id = ${orgId}`);
    await app.close();
  }, 120_000);

  it('a click forged from the query records nothing, changes no contact and redirects nowhere', async () => {
    const action = Buffer.from(JSON.stringify({ type: 'add_tag', tag: TAG_NAME })).toString(
      'base64url',
    );
    const res = await app.inject({
      method: 'GET',
      url:
        `/t/click/anything?oid=${orgId}&cid=${contactId}` +
        `&action=${action}&dest=${encodeURIComponent(EVIL)}`,
    });

    // Actions run detached from the request; give a stray one time to land.
    await new Promise((r) => setTimeout(r, 300));

    expect(res.headers.location ?? '', 'still an open redirect').not.toBe(EVIL);
    expect(await clicks(), 'a click was recorded on a stranger’s word').toBe(0);
    expect(await tagged(), 'the contact was tagged on a stranger’s word').toBe(false);
  });

  it('the signed click for the same contact is recorded and redirects to its URL', async () => {
    const token = createTrackingToken({
      type: 'click',
      orgId,
      contactId,
      // No campaign of this organisation: recorded with none (#219).
      campaignId: orgId,
      url: SHOP,
      ts: Math.floor(Date.now() / 1000),
    });
    const res = await app.inject({ method: 'GET', url: `/track/c/${token}` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(SHOP);
    expect(await clicks(), 'the signed click left no row').toBe(1);
  });
});
