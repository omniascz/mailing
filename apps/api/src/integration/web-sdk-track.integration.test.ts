/**
 * ForgeMsg.track() from the browser SDK reaches POST /api/v1/events.
 *
 * It never did. The SDK named the event `event`, the route reads `eventName`,
 * so every call answered 400 — and apiFetch turned every non-2xx into `null`,
 * so nobody saw it. docs/STAV-PRODUKTU.md listed "web SDK (track)" as a working
 * way to send custom events all the same (probe Z112).
 *
 * The SDK under test is the real one: packages/web-sdk/src/index.ts, imported
 * as it ships, calling the real API over HTTP with the real `fetch` and a
 * publishable key. A request composed by hand here would have passed against
 * the route and stayed blind to the field name, which is the whole defect.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "track() resolved" is not the claim — it resolved before, too. The claim is
 * the workflow_events row: this contact, this event name, these properties.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It runs the SDK in Node, not in a browser: no CORS, no page, no bundle.
 *   `track` touches neither `document` nor `location`, so the code path is the
 *   one a page runs, but the minified dist build is not what is imported.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { apiKeys, contacts, workflowEvents } from '../db/schema/index.js';

const TAG = `z113-sdk-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let base: string;
let publicKey: string;
let contactId: string;

interface WebSdk {
  init(config: { publicKey: string; apiBase: string; contactId?: string }): void;
  identify(contactId: string): void;
  track(event: string, properties?: Record<string, unknown>): Promise<unknown>;
}
let ForgeMsg: WebSdk;

/** The SDK source, loaded by path so the API's tsconfig (rootDir src) stays as it is. */
async function loadWebSdk(): Promise<WebSdk> {
  const file = path.resolve(__dirname, '../../../../packages/web-sdk/src/index.ts');
  const mod = (await import(pathToFileURL(file).href)) as { ForgeMsg: WebSdk };
  return mod.ForgeMsg;
}

const eventsFor = (name: string) =>
  db
    .select()
    .from(workflowEvents)
    .where(
      and(
        eq(workflowEvents.orgId, session.orgId),
        eq(workflowEvents.contactId, contactId),
        eq(workflowEvents.eventName, name),
      ),
    );

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;

  // What a shop pastes into its page: a publishable key, visible in the source.
  publicKey = `fm_pub_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: session.orgId,
    name: `web sdk ${TAG}`,
    keyHash: createHash('sha256').update(publicKey).digest('hex'),
    keyPrefix: publicKey.slice(0, 12),
    scopes: [],
    isPublic: true,
  });

  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  ForgeMsg = await loadWebSdk();
  ForgeMsg.init({ publicKey, apiBase: base });
  ForgeMsg.identify(contactId);
}, 60_000);

afterAll(async () => {
  await db.delete(workflowEvents).where(eq(workflowEvents.contactId, contactId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(apiKeys).where(eq(apiKeys.name, `web sdk ${TAG}`));
  await app?.close();
});

describe('web SDK track()', () => {
  it('writes the event for the identified contact', async () => {
    const name = `${TAG}-viewed_product`;
    expect(await eventsFor(name), 'nothing before the call').toHaveLength(0);

    await ForgeMsg.track(name, { sku: 'KAVOVAR-1', price: 1290 });

    // Not toHaveLength(1): one POST /api/v1/events writes two rows today — the
    // route inserts one and onApiEvent records another (triggers.ts). That is
    // the route's own behaviour for every caller and not this change; what this
    // asserts is that the SDK's call arrives at all, with its properties.
    const rows = await eventsFor(name);
    expect(rows.length, 'the event reached the database').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.properties).toEqual({ sku: 'KAVOVAR-1', price: 1290 });
    }
  }, 30_000);
});
