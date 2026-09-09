/**
 * The axis exists, so the report can.
 *
 * `get_template_performance` was left out of two MCP batches for one reason:
 * it groups by `campaigns.template_id`, and until the library grew a way to
 * start a campaign that column was null on every row the product created —
 * 103 campaigns in this database the day before, none with a template. A tool
 * answering over an empty join returns zeros an assistant reports as "this
 * design does not perform", which is a different sentence from "nobody has
 * used it".
 *
 * So the assertion that matters is the first one: real numbers, from a campaign
 * created through the real route, over events written the way the send path
 * writes them.
 *
 * No mock anywhere. The transport is the real Fastify app, the credential a
 * real api_keys row, and the campaign is created by POSTing the same endpoint
 * the template card does.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  apiKeys,
  contacts,
  campaigns,
  emailEvents,
  templates as savedTemplates,
} from '../db/schema/index.js';
import { findTool, ToolError } from '../services/mcp/index.js';
import type { ToolContext } from '../services/mcp/index.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

interface Tenant {
  orgId: string;
  key: string;
  ctx: ToolContext;
  templateId: string;
  templateName: string;
  contactIds: string[];
}
let A: Tenant;
let B: Tenant;

function transportFor(key: string): ToolContext {
  return {
    async call(path, method, body) {
      const res = await app.inject({
        method,
        url: path,
        headers: { 'x-api-key': key, 'content-type': 'application/json' },
        payload: body as never,
        remoteAddress: nextAddress(),
      });
      let parsed: unknown = {};
      try {
        parsed = res.json();
      } catch {
        parsed = {};
      }
      return { status: res.statusCode, body: parsed };
    },
  };
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `tperf ${label} ${tag}`, slug: `tperf-${label}-${tag}` })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  orgIds.push(orgId);

  const contactIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [c] = await db
      .insert(contacts)
      .values({ orgId, email: `${label}-${i}-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });
    contactIds.push(c!.id);
  }

  const templateName = `${label} newsletter ${tag}`;
  const [t] = await db
    .insert(savedTemplates)
    .values({
      orgId,
      name: templateName,
      category: 'newsletter',
      subject: `${label} subject`,
      preheader: `${label} preheader`,
      blocks: [{ id: 'b1', type: 'text', content: { text: 'Hi' } }] as never,
      globalStyles: {},
    })
    .returning({ id: savedTemplates.id });

  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `tperf ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic: false,
  });

  return {
    orgId,
    key: raw,
    ctx: transportFor(raw),
    templateId: t!.id,
    templateName,
    contactIds,
  };
}

/** Start a campaign the way the template card does — through the real route. */
async function campaignFromTemplate(t: Tenant, name?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/saved-templates/${t.templateId}/create-campaign`,
    headers: { 'x-api-key': t.key, 'content-type': 'application/json' },
    payload: name ? { name } : {},
    remoteAddress: nextAddress(),
  });
  if (res.statusCode !== 201) throw new Error(`create-campaign ${res.statusCode}: ${res.body}`);
  return (res.json().data as { id: string }).id;
}

/** Events shaped the way the send path writes them. */
async function record(
  t: Tenant,
  campaignId: string,
  type: 'send' | 'deliver' | 'open' | 'click' | 'bounce' | 'unsubscribe',
  contactIdx: number[],
) {
  if (contactIdx.length === 0) return;
  await db.insert(emailEvents).values(
    contactIdx.map((i) => ({
      orgId: t.orgId,
      campaignId,
      contactId: t.contactIds[i]!,
      eventType: type,
      ...(type === 'bounce' ? { bounceType: 'hard' as const } : {}),
    })),
  );
}

async function run(t: Tenant, template: string) {
  const tool = findTool('get_template_performance');
  if (!tool) throw new Error('get_template_performance is not registered');
  return tool.run(tool.input.parse({ template }), t.ctx);
}

const report = async (t: Tenant, templateId: string) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/saved-templates/${templateId}/performance`,
    headers: { 'x-api-key': t.key },
    remoteAddress: nextAddress(),
  });
  return { status: res.statusCode, data: res.statusCode < 400 ? res.json().data : null };
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 90_000);

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.name, `tperf ${tag}`));
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

beforeEach(async () => {
  if (orgIds.length > 0) {
    await db.delete(emailEvents).where(inArray(emailEvents.orgId, orgIds));
    await db.delete(campaigns).where(inArray(campaigns.orgId, orgIds));
  }
});

describe('a template with a sent campaign', () => {
  it('THE AXIS EXISTS: the numbers are not zero', async () => {
    const campaignId = await campaignFromTemplate(A);
    await record(A, campaignId, 'send', [0, 1, 2]);
    await record(A, campaignId, 'deliver', [0, 1]);
    await record(A, campaignId, 'open', [0, 1]);
    await record(A, campaignId, 'click', [0]);
    await record(A, campaignId, 'bounce', [2]);

    const { status, data } = await report(A, A.templateId);
    expect(status).toBe(200);

    expect(data.campaigns, 'the campaign did not group under its template').toBe(1);
    expect(data.campaignsSent).toBe(1);
    expect(data.sends, 'sends is zero — the join is empty again').toBe(3);
    expect(data.delivered).toBe(2);
    expect(data.uniqueOpens).toBe(2);
    expect(data.uniqueClicks).toBe(1);
    expect(data.bounces).toBe(1);

    // Rates against the conventions the account-wide stats already use, so a
    // per-template number is comparable with them.
    expect(data.deliveryRatePct).toBeCloseTo(66.67, 1);
    expect(data.openRatePct).toBe(100);
    expect(data.clickRatePct).toBe(50);
    expect(data.bounceRatePct).toBeCloseTo(33.33, 1);
  });

  it('two campaigns from the same template add up under one id', async () => {
    const first = await campaignFromTemplate(A, `first ${tag}`);
    const second = await campaignFromTemplate(A, `second ${tag}`);
    await record(A, first, 'send', [0, 1]);
    await record(A, first, 'deliver', [0, 1]);
    await record(A, second, 'send', [2]);
    await record(A, second, 'deliver', [2]);
    await record(A, second, 'open', [2]);

    const { data } = await report(A, A.templateId);
    expect(data.campaigns, 'the two campaigns did not land under one template').toBe(2);
    expect(data.campaignsSent).toBe(2);
    expect(data.sends).toBe(3);
    expect(data.delivered).toBe(3);
    expect(data.uniqueOpens).toBe(1);
  });

  it('the tool renders those numbers', async () => {
    const campaignId = await campaignFromTemplate(A);
    await record(A, campaignId, 'send', [0, 1]);
    await record(A, campaignId, 'deliver', [0, 1]);
    await record(A, campaignId, 'open', [0]);

    const out = await run(A, A.templateName);
    expect(out).toContain(A.templateName);
    expect(out).toMatch(/sends\s+2/);
    expect(out).toMatch(/delivered\s+2/);
    expect(out).toMatch(/opened\s+50%/);
  });
});

describe('nothing to measure is not the same as measured badly', () => {
  it('a template nobody has used says so, and shows no rates', async () => {
    const out = await run(A, A.templateName);
    expect(out).toContain('No campaign has been started');
    expect(
      out,
      'a template that has never been used was described as performing at 0%',
    ).not.toMatch(/0%/);
  });

  it('a template used but not sent is a third, distinct answer', async () => {
    await campaignFromTemplate(A);
    const out = await run(A, A.templateName);
    expect(out).toContain('none of which has been sent');
    expect(out).not.toMatch(/0%/);
  });

  it('the rates are null rather than zero when there is no denominator', async () => {
    await campaignFromTemplate(A);
    const { data } = await report(A, A.templateId);
    expect(data.campaigns).toBe(1);
    expect(data.sends).toBe(0);
    // null, not 0: "we cannot compute this" and "it is zero" are different
    // facts, and only one of them is true here.
    expect(data.openRatePct).toBeNull();
    expect(data.deliveryRatePct).toBeNull();
    expect(data.bounceRatePct).toBeNull();
  });
});

describe('revenue is absent with a reason, not present as a zero', () => {
  it('says which groups would have to be on', async () => {
    const campaignId = await campaignFromTemplate(A);
    await record(A, campaignId, 'send', [0]);
    await record(A, campaignId, 'deliver', [0]);

    const { data } = await report(A, A.templateId);
    // The integration lane runs with every beyond-core group on, so this is
    // the enabled branch. The point asserted is that the field says which
    // state it is in rather than handing over a bare number either way.
    expect(data.revenue).toBeDefined();
    expect(typeof data.revenue.available).toBe('boolean');
    if (data.revenue.available === false) {
      expect(data.revenue.reason).toMatch(/revenue|ecommerce/);
      const out = await run(A, A.templateName);
      expect(out).toContain('not available on this deployment');
    }
  });
});

describe('isolation', () => {
  it("another tenant's template is NOT FOUND, not an empty report", async () => {
    expect((await report(A, B.templateId)).status, "A read B's template").toBe(404);
    expect((await report(B, A.templateId)).status, "B read A's template").toBe(404);
  });

  it('and each still reads its own', async () => {
    expect((await report(A, A.templateId)).status).toBe(200);
    expect((await report(B, B.templateId)).status).toBe(200);
  });

  it('the tool surfaces that as a refusal carrying the status', async () => {
    const err = await run(A, B.templateId).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).status).toBe(404);
  });

  it("another tenant's campaigns cannot contribute to this template's numbers", async () => {
    // A campaign pointing at A's template but owned by B must not count. The
    // query carries org_id on both sides of the join for exactly this.
    const aCampaign = await campaignFromTemplate(A);
    await record(A, aCampaign, 'send', [0]);

    const [bCampaign] = await db
      .insert(campaigns)
      .values({
        orgId: B.orgId,
        name: `smuggled ${tag}`,
        subject: 's',
        fromEmail: 'x@example.invalid',
        fromName: 'x',
        status: 'draft',
        templateId: A.templateId,
        content: {},
      })
      .returning({ id: campaigns.id });
    await record(B, bCampaign!.id, 'send', [0, 1, 2]);

    const { data } = await report(A, A.templateId);
    expect(data.campaigns, "another org's campaign was counted").toBe(1);
    expect(data.sends, "another org's sends were counted").toBe(1);
  });
});

describe('the registry', () => {
  it('registers the tool with a usable description and adds no writer', async () => {
    const { describeTools } = await import('../services/mcp/index.js');
    const names = describeTools().map((t) => t.name);
    expect(names).toContain('get_template_performance');
    const d = describeTools().find((t) => t.name === 'get_template_performance')!;
    expect(d.description.length).toBeGreaterThan(40);
    expect(d.inputSchema.type).toBe('object');
    for (const forbidden of ['update_template', 'delete_template', 'create_template']) {
      expect(names).not.toContain(forbidden);
    }
  });
});
