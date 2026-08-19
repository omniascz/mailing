/**
 * From-address ownership across every send path.
 *
 * Before this, any authenticated caller could put `ceo@paypal.com` in From and
 * the API answered 200. The sonda confirmed it live. These tests pin the fix: a
 * From must resolve to a domain or email address the org has verified, on all
 * five paths a caller can choose one — the transactional API, its batch form,
 * campaign send, the SMTP relay, and the workflow send_personal_email action.
 *
 * The identity matrix (own-verified / own-unverified / other-org / nonexistent)
 * is asserted once against the service function, then each path is checked to
 * confirm the guard is actually wired into it — a real row for the happy case,
 * a spoof for the rejection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  users,
  sendingDomains,
  emailIdentities,
  campaigns,
} from '../db/schema/index.js';
import {
  assertFromDomainOwned,
  extractFromAddress,
  fromAddressDomain,
} from '../services/sending/from-domain.js';
import { AppError } from '../lib/app-error.js';

let app: FastifyInstance;
let session: Session;

const tag = randomUUID().slice(0, 8);
/** The org under test (the seed org, via login) plus a second, unrelated org. */
let orgUnderTest: string;
let otherOrg: string;
const campaignIds: string[] = [];

/** Domains: one verified for our org, one verified for the OTHER org. */
const ownVerified = `own-${tag}.test`;
const ownUnverified = `unver-${tag}.test`;
const otherOrgDomain = `other-${tag}.test`;
const nonexistent = `nowhere-${tag}.test`;
/** A single verified email identity for our org, on a domain we do NOT own. */
const ownIdentity = `solo-${tag}@gmail-${tag}.test`;

async function addDomain(orgId: string, domain: string, verified: boolean) {
  await db
    .insert(sendingDomains)
    .values({ orgId, domain, dkimSelector: 'fm1', isVerified: verified, dkimVerified: verified });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgUnderTest = session.orgId;

  const [other] = await db
    .insert(organizations)
    .values({ name: `other-${tag}`, slug: `other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;

  await addDomain(orgUnderTest, ownVerified, true);
  await addDomain(orgUnderTest, ownUnverified, false);
  await addDomain(otherOrg, otherOrgDomain, true);
  await db
    .insert(emailIdentities)
    .values({ orgId: orgUnderTest, email: ownIdentity, status: 'verified', token: `tok-${tag}` });
}, 60_000);

afterAll(async () => {
  if (campaignIds.length) await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
  await db.delete(sendingDomains).where(inArray(sendingDomains.orgId, [orgUnderTest, otherOrg]));
  await db.delete(emailIdentities).where(eq(emailIdentities.orgId, orgUnderTest));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 60_000);

describe('assertFromDomainOwned — the decision', () => {
  it('address parsing handles both bare and display-name forms', () => {
    expect(extractFromAddress('a@b.test')).toBe('a@b.test');
    expect(extractFromAddress('"The CEO" <CEO@B.test>')).toBe('ceo@b.test');
    expect(extractFromAddress('garbage')).toBeNull();
    expect(fromAddressDomain('x@Foo.TEST')).toBe('foo.test');
  });

  it('(a) verified own domain → passes', async () => {
    await expect(
      assertFromDomainOwned(orgUnderTest, `ceo@${ownVerified}`),
    ).resolves.toBeUndefined();
    // Any mailbox at a verified domain, and the display-name form, both pass.
    await expect(
      assertFromDomainOwned(orgUnderTest, `"Sales" <sales@${ownVerified}>`),
    ).resolves.toBeUndefined();
  });

  it('a verified single-address identity → passes even without owning the domain', async () => {
    await expect(assertFromDomainOwned(orgUnderTest, ownIdentity)).resolves.toBeUndefined();
    // ...but only that exact mailbox, not the whole domain.
    await expect(
      assertFromDomainOwned(orgUnderTest, `someoneelse@gmail-${tag}.test`),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FROM_NOT_VERIFIED' });
  });

  it('(b) unverified own domain → rejected', async () => {
    await expect(assertFromDomainOwned(orgUnderTest, `ceo@${ownUnverified}`)).rejects.toMatchObject(
      {
        statusCode: 403,
        code: 'FROM_NOT_VERIFIED',
      },
    );
  });

  it("(c) another org's verified domain → rejected, and the message does not say why", async () => {
    let thrown: AppError | null = null;
    try {
      await assertFromDomainOwned(orgUnderTest, `ceo@${otherOrgDomain}`);
    } catch (e) {
      thrown = e as AppError;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown!.statusCode).toBe(403);
    // Must not reveal that the domain belongs to someone, or which someone.
    expect(thrown!.message).not.toMatch(/other|another|belongs|owned|org|tenant|exists|taken/i);
    // Identical wording to the "doesn't exist" case — no oracle.
    let other: AppError | null = null;
    try {
      await assertFromDomainOwned(orgUnderTest, `ceo@${nonexistent}`);
    } catch (e) {
      other = e as AppError;
    }
    expect(thrown!.message).toBe(other!.message);
  });

  it('(d) nonexistent domain → rejected', async () => {
    await expect(assertFromDomainOwned(orgUnderTest, `ceo@${nonexistent}`)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FROM_NOT_VERIFIED',
    });
  });

  it('an unparseable From → 400, not 403', async () => {
    await expect(assertFromDomainOwned(orgUnderTest, 'not-an-email')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('(f) an org with NO verified domain cannot use any external From', async () => {
    // otherOrg owns exactly one verified domain; a fresh org owns none. Model
    // "no verified domain" by asking otherOrg for a domain it does not have.
    await expect(assertFromDomainOwned(otherOrg, `x@${ownVerified}`)).rejects.toMatchObject({
      statusCode: 403,
    });
    // Its own verified domain still works — the rule is ownership, not a ban.
    await expect(assertFromDomainOwned(otherOrg, `x@${otherOrgDomain}`)).resolves.toBeUndefined();
  });
});

describe('path 1 — POST /api/v1/emails', () => {
  const send = (from: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/emails',
      headers: { cookie: session.cookie },
      payload: { from, to: ['victim@example.test'], subject: 's', html: '<p>h</p>' },
    });

  it('accepts a verified From', async () => {
    const res = await send(`hello@${ownVerified}`);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a spoofed From with 403', async () => {
    const res = await send('ceo@paypal.com');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FROM_NOT_VERIFIED');
  });
});

describe('path 2 — POST /api/v1/emails/batch', () => {
  const batch = (froms: string[]) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/emails/batch',
      headers: { cookie: session.cookie },
      payload: froms.map((from) => ({
        from,
        to: ['victim@example.test'],
        subject: 's',
        html: '<p>h</p>',
      })),
    });

  it('accepts a batch where every From is verified', async () => {
    const res = await batch([`a@${ownVerified}`, `b@${ownVerified}`]);
    expect(res.statusCode).toBe(200);
  });

  it('rejects the whole batch when one From is a spoof', async () => {
    const res = await batch([`a@${ownVerified}`, 'ceo@paypal.com']);
    expect(res.statusCode).toBe(403);
  });
});

describe('path 3 — campaign send (at the click, not in the worker)', () => {
  async function makeCampaign(fromEmail: string): Promise<string> {
    const [c] = await db
      .insert(campaigns)
      .values({
        orgId: orgUnderTest,
        name: `c-${tag}-${randomUUID().slice(0, 6)}`,
        type: 'email',
        fromEmail,
      })
      .returning({ id: campaigns.id });
    campaignIds.push(c!.id);
    return c!.id;
  }

  it('rejects a spoofed campaign From at enqueue, before any state change', async () => {
    const { enqueueCampaignSend } = await import('../services/campaigns/dispatch.js');
    const id = await makeCampaign('ceo@paypal.com');
    await expect(enqueueCampaignSend(orgUnderTest, id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FROM_NOT_VERIFIED',
    });
    // The campaign must NOT have been flipped out of draft.
    const [after] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    expect(after!.status).toBe('draft');
  });

  it('a verified campaign From passes the From check', async () => {
    const { enqueueCampaignSend } = await import('../services/campaigns/dispatch.js');
    const id = await makeCampaign(`news@${ownVerified}`);
    // It may fail later for unrelated reasons (empty audience etc.), but never
    // with FROM_NOT_VERIFIED.
    const err = await enqueueCampaignSend(orgUnderTest, id).catch((e: AppError) => e);
    if (err instanceof AppError) expect(err.code).not.toBe('FROM_NOT_VERIFIED');
  });
});

describe('path 4 — SMTP relay (/internal/smtp/relay → sendRawMessage)', () => {
  const relay = (from: string) => {
    const raw = `From: ${from}\r\nTo: victim@example.test\r\nSubject: s\r\n\r\nbody\r\n`;
    return app.inject({
      method: 'POST',
      url: '/api/v1/internal/smtp/relay',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
      payload: {
        orgId: orgUnderTest,
        raw: Buffer.from(raw).toString('base64'),
        mailFrom: from,
        rcptTo: ['victim@example.test'],
      },
    });
  };

  it('accepts a verified From', async () => {
    const res = await relay(`postmaster@${ownVerified}`);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a spoofed From (mapped to 502 by the relay route)', async () => {
    const res = await relay('ceo@paypal.com');
    // The relay route wraps a send failure as 502 with the message in the body.
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/not a verified sender/i);
  });
});

describe('path 5 — workflow send_personal_email action', () => {
  const runAction = async (fromEmail: string) => {
    const { executeAction } = await import('../services/workflows/actions.js');
    const node = {
      id: 'n1',
      type: 'send_personal_email',
      config: { fromEmail, subject: 'hi {{first_name}}', body: 'body {{first_name}}' },
    } as unknown as Parameters<typeof executeAction>[0];
    const run = { id: randomUUID(), orgId: orgUnderTest, contactId: null } as unknown as Parameters<
      typeof executeAction
    >[1];
    const ctx = { orgId: orgUnderTest, contact: null } as unknown as Parameters<
      typeof executeAction
    >[2];
    return executeAction(node, run, ctx);
  };

  it('rejects a spoofed From as an action error', async () => {
    const res = await runAction('ceo@paypal.com');
    expect(res.type).toBe('error');
    if (res.type === 'error') expect(res.message).toMatch(/not a verified sender/i);
  });

  it('a verified From is not rejected by the From check', async () => {
    const res = await runAction(`agent@${ownVerified}`);
    // Enqueue may or may not succeed depending on the queue, but it must not be
    // the From guard that stopped it.
    if (res.type === 'error') expect(res.message).not.toMatch(/not a verified sender/i);
  });
});
