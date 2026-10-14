/**
 * One address, one contact — the paths that are not a campaign.
 *
 * ─── What was wrong (Z146, measured on master) ───────────────────────────────
 *
 * - The Ecomail, Klaviyo and SmartEmailing migrations upserted ON CONFLICT
 *   (org_id, email), and no unique index matched that target: Postgres refused
 *   every insert ("there is no unique or exclusion constraint matching the ON
 *   CONFLICT specification"), the job still finished 'completed', and none of
 *   the three created a single contact from 3 inputs.
 * - POST /contacts stored the address as typed. A DSN or an FBL report names the
 *   recipient in lower case and both looked the contact up by exact spelling,
 *   so a contact entered in capitals stayed 'active' after a hard bounce and
 *   after a complaint (the suppression row was written, the status was not).
 * - POST /contacts, the batch, PUT and the Resend-compatible API answered
 *   201/200 for an address the org already held and made a second contact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { encodeVerp } from '@forgemsg/shared/sending/verp';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import { contacts, lists, migrationJobs, suppressions } from '../db/schema/index.js';
import { startEcomailMigration } from '../services/migrations/ecomail.js';
import { processFblComplaint } from '../services/sending/fbl-processor.js';
import { findOrCreateContact } from '../services/contacts/by-email.js';

let app: FastifyInstance;
let session: Session;
const tag = randomUUID().slice(0, 8);
const address = (name: string) => `ceu-${name}-${tag}@test.local`;
const realFetch = globalThis.fetch;

async function post(url: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    payload: payload as never,
  });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

/** Every live contact of the org for the address, in any spelling. */
async function rowsFor(email: string) {
  return (await db.execute(sql`
    SELECT id, email, status::text AS status FROM contacts
    WHERE org_id = ${session.orgId}::uuid AND lower(btrim(email)) = ${email.toLowerCase()}
      AND deleted_at IS NULL
  `)) as unknown as Array<{ id: string; email: string; status: string }>;
}

async function existing(email: string, status: 'active' | 'unsubscribed' = 'active') {
  const [row] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email, status, firstName: 'Orig' })
    .returning({ id: contacts.id });
  return row!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  session = await login(app);
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  const like = `%-${tag}@test.local`;
  await db.execute(
    sql`DELETE FROM suppressions WHERE org_id = ${session.orgId}::uuid AND email LIKE ${like}`,
  );
  await db.execute(
    sql`DELETE FROM email_events WHERE org_id = ${session.orgId}::uuid AND recipient LIKE ${like}`,
  );
  await db.execute(
    sql`DELETE FROM inbound_emails WHERE org_id = ${session.orgId}::uuid AND to_address LIKE ${'%bounce.example.test'}`,
  );
  await db.execute(
    sql`DELETE FROM contacts WHERE org_id = ${session.orgId}::uuid AND lower(email) LIKE ${like}`,
  );
  await db.execute(
    sql`DELETE FROM migration_jobs WHERE org_id = ${session.orgId}::uuid AND type = 'ecomail'`,
  );
  await db
    .delete(lists)
    .where(and(eq(lists.orgId, session.orgId), eq(lists.name, `ceu eco ${tag}`)));
  await app.close();
});

describe('one address, one contact: imports, bounces, complaints and the create routes', () => {
  it('an Ecomail migration creates the new contacts and leaves an existing unsubscribed one as it is', async () => {
    const inputs = [address('eco1'), address('Eco2').toUpperCase(), address('eco-unsub')];
    const unsubId = await existing(inputs[2]!, 'unsubscribed');
    // Only Ecomail's HTTP API is canned.
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      if (!u.includes('ecomailapp')) return realFetch(url as never);
      const body = u.includes('/subscribers')
        ? {
            subscribers: inputs.map((email, i) => ({
              id: i,
              email,
              name: 'Eco',
              status: 'subscribed',
            })),
            current_page: 1,
            last_page: 1,
          }
        : [{ id: 1, name: `ceu eco ${tag}` }];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      const job = await startEcomailMigration(session.orgId, 'key');
      let settled: typeof migrationJobs.$inferSelect | undefined;
      for (let i = 0; i < 200 && !settled; i++) {
        const [row] = await db.select().from(migrationJobs).where(eq(migrationJobs.id, job.id));
        if (row?.status === 'completed' || row?.status === 'failed') settled = row;
        else await new Promise((r) => setTimeout(r, 100));
      }
      expect(settled?.status).toBe('completed');
      expect((settled?.progress as { errors?: string[] }).errors).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect((await rowsFor(inputs[0]!)).map((r) => r.status)).toEqual(['active']);
    expect(await rowsFor(inputs[1]!)).toEqual([
      expect.objectContaining({ email: inputs[1]!.toLowerCase(), status: 'active' }),
    ]);
    expect(await rowsFor(inputs[2]!)).toEqual([
      { id: unsubId, email: inputs[2]!, status: 'unsubscribed' },
    ]);
  });

  it('a hard-bounce DSN and an FBL complaint reach a contact entered in capitals', async () => {
    const bounced = address('Dsn').toUpperCase();
    const complained = address('Fbl').toUpperCase();
    const stored: unknown[] = [];
    for (const email of [bounced, complained]) {
      const res = await post('/api/v1/contacts', { email });
      expect(res.status).toBe(201);
      stored.push((res.body.data as { email: string }).email);
    }
    const messageId = `<ceu-${randomUUID()}@forgemsg>`;
    const dsn = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/inbound-email/raw',
      headers: { 'x-inbound-secret': env.INBOUND_EMAIL_SECRET },
      payload: {
        orgId: session.orgId,
        from: 'MAILER-DAEMON@mx.example',
        to: encodeVerp(messageId, 'bounce.example.test'),
        subject: 'Undelivered Mail Returned to Sender',
        textBody: 'The mail system: user unknown',
        deliveryStatus: [
          'Reporting-MTA: dns; mx.example',
          '',
          `Final-Recipient: rfc822; ${bounced.toLowerCase()}`,
          'Action: failed',
          'Status: 5.1.1',
          'Diagnostic-Code: smtp; 550 5.1.1 user unknown',
          '',
        ].join('\r\n'),
      },
    });
    expect(dsn.statusCode).toBe(201);
    expect((await rowsFor(bounced)).map((r) => r.status)).toEqual(['bounced']);

    const fbl = await processFblComplaint(
      {
        originalRecipient: complained.toLowerCase(),
        originalMessageId: null,
        reportingMta: null,
        feedbackType: 'abuse',
        reportedAt: new Date().toISOString(),
        source: 'ceu',
      } as unknown as Parameters<typeof processFblComplaint>[0],
      session.orgId,
    );
    expect(fbl.action).not.toBe('contact_not_found');
    expect((await rowsFor(complained)).map((r) => r.status)).toEqual(['complained']);
    const rows = await db
      .select({ reason: suppressions.reason })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.orgId, session.orgId),
          eq(suppressions.email, complained.toLowerCase()),
        ),
      );
    expect(rows.map((r) => r.reason)).toEqual(['complaint']);
    // Stored, and returned, in lower case.
    expect(stored).toEqual([bounced.toLowerCase(), complained.toLowerCase()]);
  });

  it('the create routes answer 409 CONTACT_EXISTS for an address the org holds, and change nothing', async () => {
    const held = address('held');
    const heldId = await existing(held, 'unsubscribed');

    const single = await post('/api/v1/contacts', { email: held.toUpperCase() });
    expect(single.status).toBe(409);
    expect(single.body).toMatchObject({ code: 'CONTACT_EXISTS', details: { id: heldId } });

    const fresh = address('batch-fresh');
    const batch = await post('/api/v1/contacts/batch', {
      contacts: [{ email: fresh }, { email: held.toUpperCase() }],
    });
    expect(batch.status).toBe(409);
    expect(batch.body).toMatchObject({ code: 'CONTACT_EXISTS', details: { conflicts: [held] } });
    expect(await rowsFor(fresh), 'the batch created part of itself').toEqual([]);

    const twice = await post('/api/v1/contacts/batch', {
      contacts: [{ email: address('twice') }, { email: address('Twice').toUpperCase() }],
    });
    expect(twice.status).toBe(409);
    expect(twice.body).toMatchObject({ details: { conflicts: [address('twice')] } });
    expect(await rowsFor(address('twice'))).toEqual([]);

    const otherId = await existing(address('other'));
    const put = await post(`/api/v1/contacts/${otherId}`, { email: held.toUpperCase() }, 'PUT');
    expect(put.status).toBe(409);
    expect(put.body).toMatchObject({ code: 'CONTACT_EXISTS', details: { id: heldId } });
    expect((await rowsFor(address('other'))).map((r) => r.id)).toEqual([otherId]);

    const [list] = await db
      .insert(lists)
      .values({ orgId: session.orgId, name: `ceu audience ${tag}` })
      .returning({ id: lists.id });
    const resend = await post(`/api/v1/audiences/${list!.id}/contacts`, {
      email: held.toUpperCase(),
    });
    expect(resend.status).toBe(409);
    expect(resend.body).toMatchObject({ code: 'CONTACT_EXISTS', details: { id: heldId } });
    await db.delete(lists).where(eq(lists.id, list!.id));

    expect(await rowsFor(held)).toEqual([{ id: heldId, email: held, status: 'unsubscribed' }]);
  });

  it('racing writers for one new address make one contact and never a 500', async () => {
    const raced = address('race');
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => post('/api/v1/contacts', { email: raced })),
    );
    const codes = answers.map((a) => a.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);

    const shared = address('shared');
    const found = await Promise.all(
      Array.from({ length: 5 }, () =>
        findOrCreateContact(session.orgId, shared, { status: 'non_subscribed' }),
      ),
    );
    expect(new Set(found.map((f) => f.contact.id)).size).toBe(1);
    expect(found.filter((f) => f.created)).toHaveLength(1);
    expect(await rowsFor(raced)).toHaveLength(1);
    expect(await rowsFor(shared)).toHaveLength(1);
  });
});
