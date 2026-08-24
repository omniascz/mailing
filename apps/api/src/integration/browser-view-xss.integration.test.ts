/**
 * The view-in-browser page, with a campaign whose body the customer wrote.
 *
 * This is the path where a `<script>` stops being a tag a mail client ignores
 * and becomes script executing in a browser on our own domain. The editor's
 * own tests cover the sanitiser; this one covers the claim that the archive
 * page goes through it — that `browser-view.ts` renders with the same
 * `renderEmail`, and that nothing downstream re-introduces the raw content.
 *
 * Driven end to end: a real campaign row, a real signed view token, the real
 * public route, and an assertion on the bytes that route returns.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts } from '../db/schema/index.js';
import { createTrackingToken } from '@forgemsg/shared';

let app: FastifyInstance;
let session: Session;
let orgId: string;
let contactId: string;

const tag = randomUUID().slice(0, 8);
const createdCampaigns: string[] = [];

/** A campaign whose body is block JSON containing one customer-authored block. */
async function campaignWith(block: Record<string, unknown>): Promise<string> {
  const [row] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `xss-${tag}-${randomUUID().slice(0, 6)}`,
      type: 'email',
      subject: 'Archive test',
      content: {
        subject: 'Archive test',
        preheader: '',
        globalStyles: {
          backgroundColor: '#fff',
          contentBackgroundColor: '#fff',
          fontFamily: 'Arial',
          linkColor: '#00f',
          textColor: '#000',
          contentWidth: 600,
        },
        blocks: [block],
      },
    })
    .returning({ id: campaigns.id });
  createdCampaigns.push(row!.id);
  return row!.id;
}

async function fetchArchive(campaignId: string) {
  const token = createTrackingToken({
    type: 'view',
    orgId,
    campaignId,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });
  return app.inject({ method: 'GET', url: `/api/v1/browser/${token}` });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `xss-${tag}@test.local`, firstName: 'Jana', status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 60_000);

afterAll(async () => {
  if (createdCampaigns.length)
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 60_000);

describe('a code block cannot put script on the archive page', () => {
  it('a script tag never reaches the browser', async () => {
    const id = await campaignWith({
      id: 'c1',
      type: 'code',
      html: '<p>Akce</p><script>window.__pwned = 1</script>',
    });

    const res = await fetchArchive(id);
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
    // The visible content is there…
    expect(res.body).toContain('Akce');
    // …and the script is not, in any form the browser would run.
    expect(res.body).not.toContain('<script>window.__pwned');
    expect(res.body).not.toContain('__pwned');
  }, 60_000);

  it('nor does an event handler or a javascript: link', async () => {
    const id = await campaignWith({
      id: 'c1',
      type: 'code',
      html:
        '<img src="https://x.test/a.png" onerror="window.__pwned=1" alt="a" />' +
        '<a href="javascript:window.__pwned=1">klik</a>',
    });

    const res = await fetchArchive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/onerror/i);
    expect(res.body).not.toMatch(/javascript:/i);
    expect(res.body).not.toContain('__pwned');
    // The link text survives; only the destination was refused.
    expect(res.body).toContain('klik');
  }, 60_000);

  it('nor a script smuggled through a text block, which predates the code block', async () => {
    const id = await campaignWith({
      id: 't1',
      type: 'text',
      content: '<p>Ahoj</p><script>window.__pwned = 1</script>',
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#000',
      lineHeight: '1.6',
      textAlign: 'left',
    });

    const res = await fetchArchive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Ahoj');
    expect(res.body).not.toContain('__pwned');
  }, 60_000);

  it('and the archive still shows the campaign it was asked for', async () => {
    // The sanitiser must not be so eager that the page stops working.
    const id = await campaignWith({
      id: 'c1',
      type: 'code',
      html: '<table><tr><td style="padding:8px;"><strong>Objednávka</strong> {{first_name}}</td></tr></table>',
    });
    const res = await fetchArchive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<strong>Objednávka</strong>');
    expect(res.body).toContain('Jana');
  }, 60_000);
});
