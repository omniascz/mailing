/**
 * UTM settings through the real HTTP layer.
 *
 * The column has existed since the campaigns table was written and no route
 * could set it — dispatch read it, the splitter forwarded it, the batch-sender
 * consumed it and the renderer implemented it, all for a value that was always
 * null. These cases drive the route that finally writes it, and the one that
 * previews what it will do.
 *
 * The tenancy group is not a feature test. The campaign id comes from the URL
 * and this repository has no row-level security, so the boundary is asserted
 * from both sides: the attempt is refused, and the other organisation's row is
 * unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, organizations, users } from '../db/schema/index.js';

let app: FastifyInstance;
let session: Session;
let otherOrg: string;
let theirCampaign: string;

const tag = randomUUID().slice(0, 8);
const created: string[] = [];

interface UtmResponse {
  enabled: boolean;
  effective: { source?: string; medium?: string; campaign?: string };
  defaults: { source: string; medium: string; campaign: string };
  preview: { input: string; output: string };
  neverTagged: string[];
}

async function createCampaign(payload: Record<string, unknown>, expected = 201) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { cookie: session.cookie },
    payload: { fromEmail: 'demo@acme.test', ...payload },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(expected);
  if (res.statusCode !== 201) return null;
  const body = res.json() as { data: { id: string; utmTracking: unknown } };
  created.push(body.data.id);
  return body.data;
}

const utmOf = async (id: string) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/campaigns/${id}/utm`,
    headers: { cookie: session.cookie },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return (res.json() as { data: UtmResponse }).data;
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  const [other] = await db
    .insert(organizations)
    .values({ name: `utm-other-${tag}`, slug: `utm-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;

  const [theirs] = await db
    .insert(campaigns)
    .values({
      orgId: otherOrg,
      name: `their campaign ${tag}`,
      type: 'email',
      utmTracking: { enabled: true, source: 'their-source', campaign: 'their-campaign' },
    })
    .returning({ id: campaigns.id });
  theirCampaign = theirs!.id;
}, 60_000);

afterAll(async () => {
  if (created.length) await db.delete(campaigns).where(inArray(campaigns.id, created));
  await db.delete(campaigns).where(eq(campaigns.orgId, otherOrg));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 60_000);

describe('the settings can finally be set', () => {
  it('a campaign created with UTM keeps it', async () => {
    const data = await createCampaign({
      name: `Vánoční sleva 2026 ${tag}`,
      utmTracking: { enabled: true, medium: 'promo' },
    });
    expect(data!.utmTracking).toMatchObject({ enabled: true, medium: 'promo' });

    const [row] = await db
      .select({ utm: campaigns.utmTracking })
      .from(campaigns)
      .where(eq(campaigns.id, data!.id));
    expect(row!.utm, 'the column was not written').toMatchObject({ enabled: true });
  });

  it('a campaign created without it has none, and tagging is off', async () => {
    const data = await createCampaign({ name: `Plain ${tag}` });
    expect(data!.utmTracking).toBeNull();
    const utm = await utmOf(data!.id);
    expect(utm.enabled).toBe(false);
  });

  it('the defaults come from the campaign name, slugged', async () => {
    const data = await createCampaign({ name: `Vánoční sleva 2026 ${tag}` });
    const utm = await utmOf(data!.id);
    expect(utm.defaults.campaign).toBe(`vanocni-sleva-2026-${tag}`);
    expect(utm.defaults.source).toBe('email');
    expect(utm.defaults.medium).toBe('newsletter');
  });

  it('the preview shows what a real link would become', async () => {
    const data = await createCampaign({
      name: `Vánoční sleva 2026 ${tag}`,
      utmTracking: { enabled: true },
    });
    const utm = await utmOf(data!.id);
    expect(utm.preview.output).toContain(`utm_campaign=vanocni-sleva-2026-${tag}`);
    // The sample already has a query string; one ? total.
    expect(utm.preview.output.match(/\?/g)).toHaveLength(1);
    expect(utm.preview.output).toContain('id=7');
  });

  it('and previews against a link the caller supplies', async () => {
    const data = await createCampaign({ name: `Akce ${tag}`, utmTracking: { enabled: true } });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${data!.id}/utm?sampleUrl=${encodeURIComponent('https://shop.test/x?a=1')}`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    const out = (res.json() as { data: UtmResponse }).data.preview.output;
    expect(out).toContain('https://shop.test/x?a=1&utm_source=email');
  });

  it('names the links it will never tag', async () => {
    const data = await createCampaign({ name: `Akce ${tag}` });
    const utm = await utmOf(data!.id);
    expect(utm.neverTagged).toEqual(['unsubscribe', 'preference centre', 'view in browser']);
  });
});

describe('values that would break a URL are refused', () => {
  it('a space, and the URL separators', async () => {
    for (const bad of ['Vánoční sleva', 'a?b', 'a#b', 'a&b', 'a=b']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { cookie: session.cookie },
        payload: {
          name: `Bad ${tag}`,
          fromEmail: 'demo@acme.test',
          utmTracking: { enabled: true, campaign: bad },
        },
      });
      expect(res.statusCode, `"${bad}" was accepted`).toBe(400);
    }
  });

  it('but the slugged default of the same name is fine', async () => {
    // The customer types "Vánoční sleva 2026" as the CAMPAIGN NAME, not as a
    // UTM value; the slug is what reaches the URL.
    const data = await createCampaign({
      name: 'Vánoční sleva 2026',
      utmTracking: { enabled: true },
    });
    const utm = await utmOf(data!.id);
    expect(utm.effective.campaign).toBe('vanocni-sleva-2026');
    expect(encodeURIComponent(utm.effective.campaign!)).toBe(utm.effective.campaign);
  });
});

describe('the tenancy boundary', () => {
  it("another organisation's UTM settings are not readable", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${theirCampaign}/utm`,
      headers: { cookie: session.cookie },
    });
    // 404, not 403: the answer must not reveal that the id exists.
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('their-source');
    expect(res.body).not.toContain('their-campaign');
  });

  it('and their settings are unchanged by the attempt', async () => {
    const [row] = await db
      .select({ utm: campaigns.utmTracking, orgId: campaigns.orgId })
      .from(campaigns)
      .where(eq(campaigns.id, theirCampaign));
    expect(row!.orgId).toBe(otherOrg);
    expect(row!.utm).toMatchObject({
      enabled: true,
      source: 'their-source',
      campaign: 'their-campaign',
    });
  });

  it('an id that belongs to nobody is the same 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${randomUUID()}/utm`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
