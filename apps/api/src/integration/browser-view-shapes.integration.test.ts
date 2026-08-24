/**
 * The archive page, for the two content shapes that were not going through the
 * renderer.
 *
 * browser-view-xss.integration.test.ts already covers a code block inside a
 * flat `{ blocks }` campaign. It passed throughout, and it was not enough: it
 * only ever exercised the shape the tests themselves write. The two shapes real
 * campaigns are stored in were both on the other branch.
 *
 *   { schema, html }   what apps/web's visual editor saves. `'blocks' in
 *                      content` is false for it, so the archive read the
 *                      pre-rendered `html` instead — a snapshot the BROWSER
 *                      made at save time against a hard-coded preview contact
 *                      (firstName 'Ada', unsubscribeUrl
 *                      https://forgemsg.example/unsubscribe). Every reader of
 *                      the archive saw Ada's copy, not their own.
 *
 *   { html }           raw HTML from the Resend-compat broadcasts API, the MCP
 *                      server and the seed. Merge-tagged and returned verbatim,
 *                      so a `<script>` the customer typed executed on our own
 *                      domain — the exact hole the code block was sanitised to
 *                      close, reachable by another door.
 *
 * Driven end to end: real campaign rows, real signed view tokens, the real
 * public route, assertions on the bytes it returns.
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
const created: string[] = [];

const GS = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

const textBlock = (content: string) => ({
  id: 'b1',
  type: 'text',
  content,
  fontSize: '15px',
  fontFamily: GS.fontFamily,
  color: '#374151',
  lineHeight: '1.6',
  textAlign: 'left',
});

async function campaign(content: Record<string, unknown>): Promise<string> {
  const [row] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `shape-${tag}-${randomUUID().slice(0, 6)}`,
      type: 'email',
      subject: 'Archive test',
      preheader: '',
      content,
    })
    .returning({ id: campaigns.id });
  created.push(row!.id);
  return row!.id;
}

async function archive(campaignId: string) {
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
    .values({ orgId, email: `shape-${tag}@test.local`, firstName: 'Jana', status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 60_000);

afterAll(async () => {
  if (created.length) await db.delete(campaigns).where(inArray(campaigns.id, created));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 60_000);

describe('{ schema, html } — what the visual editor saves', () => {
  it('renders the schema for THIS contact, not the browser’s preview snapshot', async () => {
    const id = await campaign({
      schema: {
        subject: 'Archive test',
        preheader: '',
        globalStyles: GS,
        blocks: [textBlock('Dobrý den, {{contact.first_name}}.')],
      },
      // What visual-editor-shell.tsx renders with PREVIEW_CONTEXT and stores.
      html: '<html><body><p>Dobrý den, Ada.</p></body></html>',
    });

    const res = await archive(id);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(res.body, 'the archive showed every reader the preview contact').not.toContain('Ada');
    expect(res.body).toContain('Jana');
  }, 60_000);

  it('gets the compliance footer from the renderer', async () => {
    // Not from assertOptOutPresent — that guard lives in the send path and has
    // no say over this page at all. The footer is here because the renderer put
    // it here, which is the whole point of routing this shape through it.
    const id = await campaign({
      schema: {
        subject: 'Archive test',
        preheader: '',
        globalStyles: GS,
        // Deliberately no footer block: 61 of the 81 built-in templates have none.
        blocks: [textBlock('Jen text, žádný footer blok.')],
      },
      html: '<p>nic</p>',
    });

    const res = await archive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body, 'no unsubscribe link on the archived copy').toMatch(/unsubscribe/i);
  }, 60_000);

  it('a code block inside the editor’s shape is still sanitised', async () => {
    const id = await campaign({
      schema: {
        subject: 'Archive test',
        preheader: '',
        globalStyles: GS,
        blocks: [{ id: 'c1', type: 'code', html: '<p>Akce</p><script>window.__pwned=1</script>' }],
      },
      html: '<p>nic</p>',
    });

    const res = await archive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Akce');
    expect(res.body).not.toContain('__pwned');
  }, 60_000);
});

describe('{ html } — raw HTML from the API, the MCP server and the seed', () => {
  it('no script tag reaches the browser', async () => {
    const id = await campaign({
      html:
        '<!doctype html><html><body><h1>Akce</h1>' +
        '<script>window.__pwned = 1</script></body></html>',
    });

    const res = await archive(id);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(res.body, 'the visible content must survive').toContain('Akce');
    expect(res.body).not.toContain('<script>window.__pwned');
    expect(res.body).not.toContain('__pwned');
  }, 60_000);

  it('no event handler and no javascript: destination', async () => {
    const id = await campaign({
      html:
        '<img src="https://x.test/a.png" onerror="window.__pwned=1" alt="a" />' +
        '<a href="javascript:window.__pwned=1">klik</a>',
    });

    const res = await archive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/onerror/i);
    expect(res.body).not.toMatch(/javascript:/i);
    expect(res.body).not.toContain('__pwned');
    expect(res.body, 'only the destination was refused, not the text').toContain('klik');
  }, 60_000);

  it('still substitutes merge tags', async () => {
    // Sanitising must not cost the thing this path already did correctly.
    const id = await campaign({ html: '<p>Dobrý den, {{contact.first_name}}.</p>' });
    const res = await archive(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Jana');
    expect(res.body).not.toContain('{{contact.first_name}}');
  }, 60_000);
});
