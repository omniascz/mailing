/**
 * A design in the library can finally become a campaign.
 *
 * There are 106 templates and until now not one of them could be sent. The
 * new-campaign form has no template picker; "Use this template" clones a
 * built-in design into the SAVED library and stops there. So
 * `campaigns.template_id` was null on every campaign the product created —
 * measured, 67 of 67 in this database — and anything grouping delivery by
 * template had no axis to group on. That is why the MCP `template_performance`
 * tool was left out twice.
 *
 * The assertions that matter here are the two that decide whether this is safe
 * rather than merely present: the campaign owns a COPY, and the copy does not
 * move when the template does. The archive page re-renders from
 * `campaigns.content` on every request, so a campaign whose body followed its
 * template would rewrite mail that has already been delivered.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  apiKeys,
  campaigns,
  templates as savedTemplates,
} from '../db/schema/index.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

interface Tenant {
  orgId: string;
  key: string;
  templateId: string;
  templateName: string;
}
let A: Tenant;
let B: Tenant;

const BLOCKS = [
  { id: 'b1', type: 'text', content: { text: 'Hello from the template' } },
] as unknown[];

async function makeTenant(label: string, locale: 'en' | 'cs'): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `tpl ${label} ${tag}`, slug: `tpl-${label}-${tag}` })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  orgIds.push(orgId);

  const templateName = `${label} newsletter ${tag}`;
  const [t] = await db
    .insert(savedTemplates)
    .values({
      orgId,
      name: templateName,
      category: 'newsletter',
      subject: `${label} subject from template`,
      preheader: `${label} preheader from template`,
      blocks: BLOCKS,
      globalStyles: { backgroundColor: '#ffffff' },
      locale,
    })
    .returning({ id: savedTemplates.id });

  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `tpl camp ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic: false,
  });

  return { orgId, key: raw, templateId: t!.id, templateName };
}

const create = (t: Tenant, templateId: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/saved-templates/${templateId}/create-campaign`,
    headers: { 'x-api-key': t.key, 'content-type': 'application/json' },
    payload: body,
    remoteAddress: nextAddress(),
  });

const campaignRow = async (id: string) =>
  (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a', 'cs');
  B = await makeTenant('b', 'en');
}, 90_000);

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.name, `tpl camp ${tag}`));
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

beforeEach(async () => {
  if (orgIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.orgId, orgIds));
  }
});

describe('a saved template becomes a campaign', () => {
  it('END TO END: the campaign carries the template’s content and names it', async () => {
    const res = await create(A, A.templateId);
    expect(res.statusCode, res.body).toBe(201);

    const created = res.json().data as { id: string };
    const row = await campaignRow(created.id);

    expect(row, 'no campaign row was written').toBeDefined();
    expect(
      row!.templateId,
      'template_id is still null — the axis anything groups by is missing',
    ).toBe(A.templateId);
    expect(row!.status).toBe('draft');
    expect(row!.name).toBe(A.templateName);
    expect(row!.subject).toBe('a subject from template');

    // The copy, in the shape readCampaignContent calls `blocks` and the editor
    // writes — so a campaign made this way opens like any other.
    const content = row!.content as { blocks?: unknown[]; subject?: string; preheader?: string };
    expect(Array.isArray(content.blocks), 'the content is not in the blocks shape').toBe(true);
    expect(content.blocks).toHaveLength(1);
    expect(JSON.stringify(content.blocks)).toContain('Hello from the template');
    expect(content.subject).toBe('a subject from template');
    expect(content.preheader).toBe('a preheader from template');
  });

  it('an explicit name wins over the template’s', async () => {
    const res = await create(A, A.templateId, { name: `Spring sale ${tag}` });
    expect(res.statusCode, res.body).toBe(201);
    expect((await campaignRow(res.json().data.id))!.name).toBe(`Spring sale ${tag}`);
  });

  it('the locale comes across, because the unsubscribe line is in it', async () => {
    // The template is Czech. Nothing in the request says so — createCampaign
    // resolves it from template_id, which is one inheritance rule in one place.
    const res = await create(A, A.templateId);
    expect(
      (await campaignRow(res.json().data.id))!.locale,
      'a Czech template made an English campaign',
    ).toBe('cs');

    const resB = await create(B, B.templateId);
    expect((await campaignRow(resB.json().data.id))!.locale).toBe('en');
  });
});

describe('the campaign does not move when the template does', () => {
  it('editing the template afterwards leaves the campaign exactly as it was', async () => {
    const res = await create(A, A.templateId);
    const id = res.json().data.id as string;
    const before = await campaignRow(id);

    await db
      .update(savedTemplates)
      .set({
        subject: 'REWRITTEN subject',
        preheader: 'REWRITTEN preheader',
        blocks: [{ id: 'b9', type: 'text', content: { text: 'REWRITTEN body' } }] as never,
      })
      .where(eq(savedTemplates.id, A.templateId));

    const after = await campaignRow(id);

    // The archive page re-renders from campaigns.content on every request. A
    // campaign that followed its template would rewrite delivered mail.
    expect(
      JSON.stringify(after!.content),
      'the campaign body changed when the template did — delivered mail would be rewritten',
    ).toBe(JSON.stringify(before!.content));
    expect(after!.subject).toBe(before!.subject);
    expect(JSON.stringify(after!.content)).not.toContain('REWRITTEN');

    // And the analytic key survives the edit, so reporting still resolves it.
    expect(after!.templateId).toBe(A.templateId);
  });

  it('a soft-deleted template keeps its campaigns resolvable but starts no new ones', async () => {
    const res = await create(A, A.templateId);
    const id = res.json().data.id as string;

    await db
      .update(savedTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(savedTemplates.id, A.templateId));

    // The row stays, so template_id never dangles.
    expect((await campaignRow(id))!.templateId).toBe(A.templateId);
    // But it is no longer a thing you can start from.
    expect((await create(A, A.templateId)).statusCode).toBe(404);

    await db
      .update(savedTemplates)
      .set({ deletedAt: null })
      .where(eq(savedTemplates.id, A.templateId));
  });
});

describe('isolation', () => {
  it("another tenant's template is NOT FOUND, from both sides", async () => {
    expect((await create(A, B.templateId)).statusCode, "A reached B's template").toBe(404);
    expect((await create(B, A.templateId)).statusCode, "B reached A's template").toBe(404);
  });

  it('and each still works on its own', async () => {
    expect((await create(A, A.templateId)).statusCode).toBe(201);
    expect((await create(B, B.templateId)).statusCode).toBe(201);
  });

  it('a template nobody has is the same answer as one that is not yours', async () => {
    expect((await create(A, randomUUID())).statusCode).toBe(404);
  });
});

describe('the axis exists now', () => {
  it('delivery can be grouped by template, which it could not before', async () => {
    // `getTemplatePerformance` does not exist in this repo — it was never
    // written, because until now it would have grouped by a column that is
    // null on every row. This asserts the thing it would have needed: campaigns
    // created from the library carry a template_id that a GROUP BY can use.
    const first = await create(A, A.templateId);
    const second = await create(A, A.templateId);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const rows = (await db.execute(sql`
      SELECT template_id, count(*)::int AS campaigns
      FROM campaigns
      WHERE org_id = ${A.orgId} AND template_id IS NOT NULL
      GROUP BY template_id
    `)) as unknown as Array<{ template_id: string; campaigns: number }>;

    expect(rows, 'nothing grouped — template_id is null on every campaign again').toHaveLength(1);
    expect(rows[0]!.template_id).toBe(A.templateId);
    expect(rows[0]!.campaigns).toBe(2);
  });
});
