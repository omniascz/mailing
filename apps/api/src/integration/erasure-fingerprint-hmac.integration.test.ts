/**
 * The fingerprint an erasure keeps is an HMAC under SUPPRESSION_HASH_KEY, and
 * both halves of the send decision match it.
 *
 * ─── What was wrong (Z150, measured on master) ───────────────────────────────
 *
 * POST /contacts/:id/anonymize wrote email_hash = SHA-256 of the address, with
 * no key. `sha256sum` of the address, computed outside the API, equalled the
 * row: anyone holding the database could find an erased address by hashing a
 * list of addresses and looking for a match.
 *
 * ─── What this file checks ───────────────────────────────────────────────────
 *
 * Through the API: the erasure's email_hash is not the SHA-256 of the address
 * and is the HMAC under the key this environment runs with — in the row, its
 * notes, the contact's custom_fields and the response alike. The same address
 * created again (POST /contacts, in capitals) is left out of a campaign's
 * audience (the SQL fingerprint, services/campaigns/auto-resend.ts) and is
 * reported suppressed by /internal/suppressions/check-batch, which mta-sender
 * and batch-sender ask (the JS fingerprint). A control on the same list is in
 * the audience and not suppressed.
 *
 * The calls use an API key of this file's own, so the file has its own
 * rate-limit bucket.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, SEED } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  apiKeys,
  campaigns,
  contactLists,
  contacts,
  lists,
  suppressions,
  users,
} from '../db/schema/index.js';
import { resolveAudience } from '../services/campaigns/auto-resend.js';

const TAG = `z150-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let orgId: string;
let key: string;
let keyId: string;
let listId: string;
let campaignId: string;
const created: string[] = [];
const hashes: string[] = [];

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (s: string) => createHmac('sha256', env.SUPPRESSION_HASH_KEY).update(s).digest('hex');

async function contact(email: string): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, firstName: 'Jana', status: 'active' })
    .returning({ id: contacts.id });
  created.push(c!.id);
  return c!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [owner] = await db
    .select({ id: users.id, orgId: users.orgId })
    .from(users)
    .where(eq(users.email, SEED.email))
    .limit(1);
  orgId = owner!.orgId!;
  key = `fm_live_${randomUUID().replace(/-/g, '')}`;
  const [k] = await db
    .insert(apiKeys)
    .values({
      orgId,
      userId: owner!.id,
      role: 'owner',
      name: `${TAG} owner`,
      keyHash: sha256(key),
      keyPrefix: key.slice(0, 12),
      scopes: [],
    })
    .returning({ id: apiKeys.id });
  keyId = k!.id;
  const [l] = await db
    .insert(lists)
    .values({ orgId, name: `${TAG} list` })
    .returning({ id: lists.id });
  listId = l!.id;
  const [c] = await db
    .insert(campaigns)
    .values({ orgId, name: `${TAG} campaign`, subject: 'x', listId })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
}, 60_000);

afterAll(async () => {
  if (hashes.length) await db.delete(suppressions).where(inArray(suppressions.emailHash, hashes));
  if (campaignId) await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  if (created.length) {
    await db.delete(contactLists).where(inArray(contactLists.contactId, created));
    await db.delete(contacts).where(inArray(contacts.id, created));
  }
  if (listId) await db.delete(lists).where(eq(lists.id, listId));
  if (keyId) await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  await app?.close();
});

describe('the erasure fingerprint is keyed, and every send decision matches it', () => {
  it('anonymise: email_hash is the HMAC of the address, not its SHA-256; the same address again is neither in the audience nor sendable', async () => {
    const address = `${TAG}-erased@example.invalid`;
    const erasedId = await contact(address);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${erasedId}/anonymize`,
      headers: { 'x-api-key': key },
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { data?: { emailHash: string }; emailHash?: string };
    const answered = body.data?.emailHash ?? body.emailHash;

    const rows = await db
      .select({
        email: suppressions.email,
        emailHash: suppressions.emailHash,
        notes: suppressions.notes,
      })
      .from(suppressions)
      .where(eq(suppressions.emailHash, answered ?? ''));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    hashes.push(row.emailHash!);
    // Before Z150 this was the SHA-256 of the address — reversible from the database alone.
    expect(row.emailHash).not.toBe(sha256(address));
    expect(row.emailHash).toBe(hmac(address));
    expect(row.email).toBeNull();
    expect(row.notes).toBe(`gdpr_anonymized:${hmac(address)}`);
    expect(answered).toBe(hmac(address));
    const [scrubbed] = await db
      .select({ customFields: contacts.customFields })
      .from(contacts)
      .where(eq(contacts.id, erasedId));
    expect((scrubbed!.customFields as Record<string, unknown>).gdpr_email_hash).toBe(hmac(address));

    // The same person again, in capitals, through the API.
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: { 'x-api-key': key },
      payload: { email: address.toUpperCase(), firstName: 'Jana' },
    });
    expect(again.statusCode, again.body).toBe(201);
    const againId = (again.json() as { data: { id: string } }).data.id;
    created.push(againId);
    const control = `${TAG}-control@example.invalid`;
    const controlId = await contact(control);
    await db.insert(contactLists).values([
      { contactId: againId, listId, confirmedAt: new Date() },
      { contactId: controlId, listId, confirmedAt: new Date() },
    ]);

    // SQL fingerprint: the audience query.
    expect((await resolveAudience(orgId, campaignId)).sort()).toEqual([controlId]);

    // JS fingerprint: what batch-sender and mta-sender ask before a send.
    const check = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/suppressions/check-batch',
      headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
      payload: { orgId, emails: [address.toUpperCase(), control] },
    });
    expect(check.statusCode, check.body).toBe(200);
    expect((check.json() as { data: { suppressed: string[] } }).data.suppressed).toEqual([
      address.toUpperCase(),
    ]);
  });
});
