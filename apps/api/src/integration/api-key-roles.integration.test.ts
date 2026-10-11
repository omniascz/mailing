/**
 * API keys act with their creator's role, and only admins mint them (Z130).
 *
 * Before:
 *  - POST /api-keys and /api-keys/resend had authenticate and nothing else;
 *  - every key acted as admin (plugins/auth.ts);
 *  so a viewer minted a key (201) and sent a no-go campaign with the gate
 *  overridden (200) while their own session got 403 — measured in Z129.
 *  A publishable key with scopes ['*'] passed requireRole on routes that had
 *  nothing else (POST /contacts/:id/consent: 201, a consent row written).
 *  POST /newsletter-referrals/convert took no credential at all.
 *  POST /broadcasts with scheduled_at answered 400 and kept the draft it made.
 *
 * Real HTTP through buildApp(), real logins, keys minted through the API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  apiKeys,
  auditLogs,
  campaigns,
  contactChannelConsents,
  lists,
  newsletterReferralPrograms,
  newsletterReferrals,
  organizations,
  users,
} from '../db/schema/index.js';
import { addRecipient, authenticateSender } from './setup/sendable-campaign.js';

let app: FastifyInstance;
const TAG = `akr-${randomUUID().slice(0, 8)}`;
const FROM = `team@${TAG}.test`;
type Role = 'owner' | 'admin' | 'editor' | 'viewer';
const sessions = {} as Record<Role, Session>;
const createdUsers: string[] = [];
const createdCampaigns: string[] = [];
let listId: string;
let contactId: string;
let otherOrgId: string;
const CODE = `Z${randomBytes(4).toString('hex')}`.toUpperCase();

// No opt-out link: the gate's 'unsubscribe-link' fails and the verdict is no-go.
const NO_GO = { html: '<p>Hi, no way out of this list.</p>', plainText: 'Hi' };

async function noGoCampaign(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { cookie: sessions.owner.cookie },
    payload: {
      name: `${TAG} no-go`,
      subject: 'Hello',
      fromName: 'T',
      fromEmail: FROM,
      listId,
      content: NO_GO,
    },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(201);
  const id = (res.json() as { data: { id: string } }).data.id;
  createdCampaigns.push(id);
  return id;
}

const mint = (role: Role, body: Record<string, unknown> = {}, url = '/api/v1/api-keys') =>
  app.inject({
    method: 'POST',
    url,
    headers: { cookie: sessions[role].cookie },
    payload: { name: `${TAG} by ${role}`, ...body },
  });

const rawKeyOf = (res: { json: () => unknown }) =>
  (res.json() as { data: { rawKey: string } }).data.rawKey;

/** A key as it existed before Z130: created by `userId`, no role stored. */
async function legacyKey(userId: string, isPublic = false, scopes: string[] = []): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: sessions.owner.orgId,
    userId,
    name: `${TAG} legacy`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes,
    isPublic,
  });
  return raw;
}

const sendWithAck = (id: string, key: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${id}/send`,
    headers: { 'x-api-key': key },
    payload: { acknowledgeDeliverabilityRisk: true },
  });

const statusOf = async (id: string) =>
  (await db.select({ s: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)))[0]!.s;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  sessions.owner = await login(app);
  const [seed] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const email = `${TAG}-${role}@test.local`;
    const [u] = await db
      .insert(users)
      .values({
        orgId: sessions.owner.orgId,
        email,
        name: `${TAG} ${role}`,
        passwordHash: seed!.hash,
        role,
        emailVerified: true,
      })
      .returning({ id: users.id });
    createdUsers.push(u!.id);
    sessions[role] = await login(app, email);
  }
  await authenticateSender(sessions.owner.orgId, FROM);
  const [l] = await db
    .insert(lists)
    .values({ orgId: sessions.owner.orgId, name: `${TAG} list` })
    .returning({ id: lists.id });
  listId = l!.id;
  contactId = await addRecipient(sessions.owner.orgId, listId);

  const programId = randomUUID();
  await db
    .insert(newsletterReferralPrograms)
    .values({ id: programId, orgId: sessions.owner.orgId, name: `${TAG} program` });
  await db.insert(newsletterReferrals).values({
    id: randomUUID(),
    orgId: sessions.owner.orgId,
    programId,
    referrerContactId: contactId,
    code: CODE,
  });
  const [org] = await db
    .insert(organizations)
    .values({ name: `${TAG} other`, slug: `${TAG}-other` })
    .returning({ id: organizations.id });
  otherOrgId = org!.id;
}, 120_000);

afterAll(async () => {
  if (createdCampaigns.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.resourceId, createdCampaigns));
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  }
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.orgId, sessions.owner.orgId), inArray(apiKeys.userId, createdUsers)));
  await db.delete(newsletterReferrals).where(eq(newsletterReferrals.code, CODE));
  if (listId) await db.delete(lists).where(eq(lists.id, listId));
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  if (otherOrgId) await db.delete(organizations).where(eq(organizations.id, otherOrgId));
  await app?.close();
});

describe('minting a key is an admin decision', () => {
  it('viewer and editor: 403 on both mint routes; admin: 201/200, and the key carries admin', async () => {
    const results: string[] = [];
    for (const role of ['viewer', 'editor', 'admin'] as const) {
      const a = await mint(role);
      const b = await mint(role, {}, '/api/v1/api-keys/resend');
      results.push(`${role}: /api-keys=${a.statusCode} /api-keys/resend=${b.statusCode}`);
      if (role === 'admin') {
        expect(a.statusCode, a.body.slice(0, 200)).toBe(201);
        expect(b.statusCode, b.body.slice(0, 200)).toBe(200);
      } else {
        expect([a.statusCode, b.statusCode]).toEqual([403, 403]);
      }
    }
    const roles = await db
      .select({ role: apiKeys.role })
      .from(apiKeys)
      .where(and(eq(apiKeys.orgId, sessions.owner.orgId), eq(apiKeys.name, `${TAG} by admin`)));
    console.log(
      `[z130] mint: ${results.join(' | ')} | stored roles: ${roles.map((r) => r.role).join(',')}`,
    );
    expect(roles.map((r) => r.role)).toEqual(['admin', 'admin']);
  });
});

describe('a key acts with its creator role, never more', () => {
  it("an editor's key (minted before Z130) cannot override the gate: 403, nothing sent", async () => {
    const key = await legacyKey(createdUsers[1]!); // editor
    const id = await noGoCampaign();
    const res = await sendWithAck(id, key);
    console.log(
      `[z130] editor key + ack: ${res.statusCode} status=${await statusOf(id)} ${res.body.slice(0, 140)}`,
    );
    expect(res.statusCode).toBe(403);
    expect(await statusOf(id)).toBe('draft');
  });

  it("a viewer's key (minted before Z130) cannot send at all: 403", async () => {
    const key = await legacyKey(createdUsers[2]!); // viewer
    const id = await noGoCampaign();
    const res = await sendWithAck(id, key);
    console.log(`[z130] viewer key + ack: ${res.statusCode} status=${await statusOf(id)}`);
    expect(res.statusCode).toBe(403);
    expect(await statusOf(id)).toBe('draft');
  });

  it("an admin's key overrides the gate: 200, and the override is in the audit log", async () => {
    const key = rawKeyOf(await mint('admin'));
    const id = await noGoCampaign();
    const res = await sendWithAck(id, key);
    const audit = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, id));
    console.log(
      `[z130] admin key + ack: ${res.statusCode} status=${await statusOf(id)} audit=${audit.map((a) => a.action).join(',')}`,
    );
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(audit.map((a) => a.action)).toContain('campaign.deliverability_override');
  });

  it('demoting the creator demotes the key', async () => {
    const [u] = await db
      .insert(users)
      .values({
        orgId: sessions.owner.orgId,
        email: `${TAG}-demoted@test.local`,
        name: 'demoted',
        passwordHash: 'x',
        role: 'admin',
        emailVerified: true,
      })
      .returning({ id: users.id });
    createdUsers.push(u!.id);
    // Minted while an admin: role admin stored. First used after the demotion,
    // so no cached lookup stands between.
    const key = await legacyKey(u!.id);
    await db.update(apiKeys).set({ role: 'admin' }).where(eq(apiKeys.userId, u!.id));
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, u!.id));
    const id = await noGoCampaign();
    const res = await sendWithAck(id, key);
    console.log(`[z130] key of a demoted admin + ack: ${res.statusCode}`);
    expect(res.statusCode).toBe(403);
  });
});

describe('a publishable key never satisfies a role', () => {
  it('with scopes ["*"] on a route behind requireRole alone: 403, nothing written', async () => {
    const pub = await legacyKey(createdUsers[0]!, true, ['*']); // created by the admin
    const consent = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${contactId}/consent`,
      headers: { 'x-api-key': pub },
      payload: { channel: 'email', source: `${TAG}-pub` },
    });
    const rows = await db
      .select({ c: contactChannelConsents.contactId })
      .from(contactChannelConsents)
      .where(eq(contactChannelConsents.source, `${TAG}-pub`));
    const set = await app.inject({
      method: 'POST',
      url: '/api/v1/configuration-sets',
      headers: { 'x-api-key': pub },
      payload: { name: `${TAG}-pub` },
    });
    console.log(
      `[z130] pub key *: consent=${consent.statusCode} rows=${rows.length} configuration-sets=${set.statusCode}`,
    );
    expect(consent.statusCode).toBe(403);
    expect(rows).toEqual([]);
    expect(set.statusCode).toBe(403);
  });

  it('the SDK intake it exists for still works: POST /events with a publishable key', async () => {
    const pub = await legacyKey(createdUsers[0]!, true, ['in_app:read', 'events:write']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { 'x-api-key': pub },
      payload: { eventName: `${TAG}_probe`, contactId },
    });
    console.log(`[z130] pub key /events: ${res.statusCode}`);
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
  });
});

describe('newsletter referral conversions are public intake, authenticated', () => {
  const convert = (headers: Record<string, string>, email: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/newsletter-referrals/convert',
      headers,
      payload: { code: CODE, referredEmail: email },
    });
  const conversions = async () =>
    (
      await db
        .select({ n: newsletterReferrals.conversionCount })
        .from(newsletterReferrals)
        .where(eq(newsletterReferrals.code, CODE))
    )[0]!.n;

  it('no credential: 401, nothing counted; the org publishable key: 201; another org key: 404', async () => {
    const before = await conversions();
    const anon = await convert({}, `${TAG}-anon@test.local`);
    const afterAnon = await conversions();
    const pub = await legacyKey(createdUsers[0]!, true, ['in_app:read', 'events:write']);
    const own = await convert({ 'x-api-key': pub }, `${TAG}-own@test.local`);
    const afterOwn = await conversions();
    const otherRaw = `fm_pub_${randomBytes(24).toString('hex')}`;
    await db.insert(apiKeys).values({
      orgId: otherOrgId,
      name: `${TAG} other pub`,
      keyHash: createHash('sha256').update(otherRaw).digest('hex'),
      keyPrefix: otherRaw.slice(0, 12),
      scopes: ['in_app:read', 'events:write'],
      isPublic: true,
    });
    const foreign = await convert({ 'x-api-key': otherRaw }, `${TAG}-foreign@test.local`);
    const afterForeign = await conversions();
    console.log(
      `[z130] convert: anon=${anon.statusCode} (${before}->${afterAnon}) own=${own.statusCode} (->${afterOwn}) other-org=${foreign.statusCode} (->${afterForeign})`,
    );
    expect(anon.statusCode).toBe(401);
    expect(afterAnon).toBe(before);
    expect(own.statusCode).toBe(201);
    expect(afterOwn).toBe(before + 1);
    expect(foreign.statusCode).toBe(404);
    expect(afterForeign).toBe(afterOwn);
  });
});

describe('a refused broadcast leaves nothing behind', () => {
  it('scheduled_at that cannot be scheduled: 400 and no campaign; a viewer: 403 and no campaign', async () => {
    const payload = (subject: string) => ({
      audience_id: listId,
      from: FROM,
      subject,
      html: '<p>Hi <a href="{{unsubscribe_url}}">unsubscribe</a></p>',
      scheduled_at: '2999-01-01T08:00:00.000Z',
    });
    const results: string[] = [];
    for (const role of ['editor', 'viewer'] as const) {
      const subject = `${TAG} broadcast ${role}`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcasts',
        headers: { cookie: sessions[role].cookie },
        payload: payload(subject),
      });
      const rows = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.orgId, sessions.owner.orgId), eq(campaigns.subject, subject)));
      createdCampaigns.push(...rows.map((r) => r.id));
      results.push(`${role}=${res.statusCode} created=${rows.length} (${res.body.slice(0, 80)})`);
      expect(res.statusCode).toBe(role === 'viewer' ? 403 : 400);
      expect(rows).toEqual([]);
    }
    console.log(`[z130] broadcast scheduled_at: ${results.join(' | ')}`);
  });
});
