/**
 * The open pixel and the click redirect actually record something.
 *
 * They never have. `maxParamLength` defaults to 100 in find-my-way and every
 * token these routes carry is longer — 286 for an open, 384-456 for a click —
 * so both answered a router 404 for every URL batch-sender ever put in an
 * email. No handler ran, so no row was written, and the recipient clicking a
 * link landed on a 404 instead of the destination.
 *
 * The routing half is pinned in routes/token-routes.test.ts, which needs no
 * database. This is the other half: a real token in, a real row out. It needs
 * Postgres, which is why it lives here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { injectOpenPixel, wrapLinks } from '@forgemsg/shared';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, emailEvents, organizations } from '../db/schema/index.js';

let app: FastifyInstance;
let orgId: string;
let campaignId: string;
let contactId: string;

const DESTINATION = 'https://example.com/produkt/zimni-kabat?utm_content=hero';
/** Any absolute base — the routes are matched by path, not by host. */
const BASE = 'https://track.test.local';

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'tracking itest', slug: `tracking-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [camp] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `tracking-itest ${randomUUID().slice(0, 8)}`,
      subject: 'Tracking probe',
      status: 'sending',
      type: 'email',
    })
    .returning({ id: campaigns.id });
  campaignId = camp!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `trk-${randomUUID().slice(0, 8)}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 120_000);

afterAll(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app.close();
}, 60_000);

/** Wait for the row — the handlers insert before responding, but geo/bot
 *  enrichment runs after, so give the write a moment on a slow runner. */
async function waitForEvent(type: 'open' | 'click', timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db
      .select()
      .from(emailEvents)
      .where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.eventType, type)));
    if (rows.length > 0) return rows[0]!;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

describe('open and click tracking write to email_events', () => {
  it('the open pixel batch-sender injects records an open', async () => {
    // Built by the same helper the worker calls, not hand-assembled — the
    // point is that the URL which actually ships is the one that works.
    const html = injectOpenPixel(
      '<html><body><p>ahoj</p></body></html>',
      BASE,
      orgId,
      campaignId,
      contactId,
    );
    const pixelUrl = html.match(/src="([^"]+)"/)?.[1];
    expect(pixelUrl, 'injectOpenPixel should produce a pixel URL').toBeTruthy();

    const path = new URL(pixelUrl!).pathname;
    // The token is what makes this interesting; anything under 101 characters
    // would pass with the router default and prove nothing.
    expect(path.length).toBeGreaterThan(100);

    const res = await app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');

    const row = await waitForEvent('open');
    expect(row, 'no open row was written').not.toBeNull();
    expect(row!.orgId).toBe(orgId);
    expect(row!.campaignId).toBe(campaignId);
    expect(row!.contactId).toBe(contactId);
    expect(row!.eventType).toBe('open');
  }, 60_000);

  it('the wrapped link records a click and redirects to the destination', async () => {
    const html = wrapLinks(
      `<html><body><a href="${DESTINATION}">koupit</a></body></html>`,
      BASE,
      orgId,
      campaignId,
      contactId,
    );
    const linkUrl = html.match(/href="([^"]+)"/)?.[1];
    expect(linkUrl, 'wrapLinks should produce a tracked URL').toBeTruthy();

    const path = new URL(linkUrl!).pathname;
    expect(path.length).toBeGreaterThan(100);

    const res = await app.inject({ method: 'GET', url: path });
    // 302 to the original destination — the recipient must end up where the
    // link pointed, which is what a router 404 took away.
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('example.com/produkt/zimni-kabat');

    const row = await waitForEvent('click');
    expect(row, 'no click row was written').not.toBeNull();
    expect(row!.contactId).toBe(contactId);
    expect(row!.eventType).toBe('click');
    expect(row!.linkUrl).toContain('example.com/produkt/zimni-kabat');
  }, 60_000);

  it('one-click unsubscribe, posted the way Gmail posts it, unsubscribes the contact', async () => {
    const [target] = await db
      .insert(contacts)
      .values({ orgId, email: `oneclick-${randomUUID().slice(0, 8)}@test.local`, status: 'active' })
      .returning({ id: contacts.id, email: contacts.email });

    const { createTrackingToken } = await import('@forgemsg/shared');
    const token = createTrackingToken({
      type: 'unsub',
      orgId,
      contactId: target!.id,
      ts: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe/${token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });

    // RFC 8058: 204, no redirect, no confirmation page.
    expect(res.statusCode).toBe(204);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).toBe('');

    const [after] = await db
      .select({ status: contacts.status })
      .from(contacts)
      .where(eq(contacts.id, target!.id));
    expect(after!.status).toBe('unsubscribed');

    await db.delete(contacts).where(inArray(contacts.id, [target!.id]));
  }, 60_000);
});
