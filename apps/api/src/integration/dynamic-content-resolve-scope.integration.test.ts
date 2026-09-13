/**
 * POST /api/v1/dynamic-content/resolve rendered whichever organisation's blocks
 * the caller named.
 *
 *     orgId: z.string().uuid(),        // …in the request body
 *     resolveDynamicContent(body.orgId, body.emailHtml, …)
 *
 * The route sits behind the plugin-wide `app.requireAuth`
 * (routes/v1/dynamic-content.ts:9), so the caller was always an authenticated
 * user — and any of them, in any organisation, could put another organisation's
 * UUID in the body and get that organisation's dynamic content rendered back.
 *
 * It is not only a read. resolveBlock (services/campaigns/dynamic-content.ts:145)
 * increments `impressions` on the block it resolves, so the victim's counter
 * moves too; and where a block carries a `dataSourceUrl`, the same function
 * fetches that URL with the owner's stored `dataSourceHeaders` and renders the
 * answer into the HTML handed back to the caller.
 *
 * On silent green: an empty `html` would satisfy "the victim's content is not
 * here" just as well as a correct answer, so every case also pins that the
 * caller's OWN block was resolved — that is the evidence the request reached
 * the query rather than falling short of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import { dynamicContentBlocks } from '../db/schema/dynamic-content.js';

const tag = randomUUID().slice(0, 8);
/** One placeholder both organisations define, which is what makes this a test. */
const TAG = `promo${tag}`;
const CALLER_HTML = `<b>caller-block-${tag}</b>`;
const VICTIM_HTML = `<b>victim-block-${tag}</b>`;
const EMAIL = `<html><body>before <!-- DC:${TAG} --> after</body></html>`;

let app: FastifyInstance;
let caller: Session;
let victimOrg: string;
let victimBlockId: string;
let callerBlockId: string;

const blockById = async (id: string) =>
  (await db.select().from(dynamicContentBlocks).where(eq(dynamicContentBlocks.id, id)))[0];

async function seedBlock(orgId: string, placeholderTag: string, html: string): Promise<string> {
  const [row] = await db
    .insert(dynamicContentBlocks)
    .values({
      orgId,
      name: `block ${placeholderTag} ${tag}`,
      placeholderTag,
      variants: [],
      fallbackHtml: html,
      active: true,
    })
    .returning({ id: dynamicContentBlocks.id });
  return row!.id;
}

const resolve = async (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/dynamic-content/resolve',
    headers: { cookie: caller.cookie },
    payload: body,
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  caller = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'dc victim', slug: `dc-victim-${tag}` })
    .returning({ id: organizations.id });
  victimOrg = org!.id;

  callerBlockId = await seedBlock(caller.orgId, TAG, CALLER_HTML);
  victimBlockId = await seedBlock(victimOrg, TAG, VICTIM_HTML);
}, 60_000);

afterAll(async () => {
  await db.delete(dynamicContentBlocks).where(eq(dynamicContentBlocks.orgId, victimOrg));
  await db.delete(dynamicContentBlocks).where(eq(dynamicContentBlocks.id, callerBlockId));
  await db.delete(organizations).where(eq(organizations.id, victimOrg));
  await app?.close();
}, 60_000);

describe('resolving dynamic content uses the caller organisation, not the body', () => {
  it('naming another organisation returns the caller own block, not theirs', async () => {
    const victimBefore = await blockById(victimBlockId);
    expect(victimBefore, 'fixture missing — the victim block was not seeded').toBeDefined();

    const res = await resolve({ orgId: victimOrg, emailHtml: EMAIL });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    const html = (res.json() as { data: { html: string } }).data.html;

    // The leak first: the victim's content must not be in the answer.
    expect(html, "another organisation's block was rendered into the reply").not.toContain(
      VICTIM_HTML,
    );

    // Then: did the request reach the query at all? It did — with the caller's
    // own block, which is what this endpoint is for. Without this, an endpoint
    // that returned the email untouched would pass the assertion above.
    expect(html, 'the caller own block was not resolved either').toContain(CALLER_HTML);
    expect(html).toContain('before ');
    expect(html).toContain(' after');

    // And the victim's row, field by field — `impressions` included, because
    // resolveBlock increments it for whichever block it resolves.
    const victimAfter = await blockById(victimBlockId);
    expect(victimAfter!.impressions).toBe(victimBefore!.impressions);
    expect(victimAfter!.orgId).toBe(victimOrg);
    expect(victimAfter!.placeholderTag).toBe(victimBefore!.placeholderTag);
    expect(victimAfter!.fallbackHtml).toBe(victimBefore!.fallbackHtml);
    expect(victimAfter!.active).toBe(victimBefore!.active);
  });

  it('the caller own organisation still resolves its own content', async () => {
    // Negative control: the scope must not turn the endpoint off.
    const res = await resolve({ emailHtml: EMAIL });
    expect(res.statusCode).toBe(200);
    const html = (res.json() as { data: { html: string } }).data.html;
    expect(html).toContain(CALLER_HTML);
    expect(html).not.toContain(VICTIM_HTML);
    expect(html).not.toContain('DC:');
  });

  it('a placeholder the caller has no block for resolves to nothing, and leaks nothing', async () => {
    // Negative control: an unknown tag must not fall back to somebody else's
    // block of the same name.
    const unknown = `<html><!-- DC:absent${tag} --></html>`;
    const res = await resolve({ orgId: victimOrg, emailHtml: unknown });
    expect(res.statusCode).toBe(200);
    const html = (res.json() as { data: { html: string } }).data.html;
    expect(html).toBe('<html></html>');
    expect(html).not.toContain(VICTIM_HTML);
  });
});
