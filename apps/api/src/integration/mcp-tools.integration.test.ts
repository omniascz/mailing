/**
 * The MCP tools, against the real routes and the real services.
 *
 * Not a mock anywhere: the transport is the actual Fastify app, the credential
 * is an actual API key row, and the numbers come out of the actual analytics
 * service. A tool tested against a stub would have stayed green through the
 * defect this PR fixes — the server authenticated with
 * `Authorization: Bearer <api key>`, which the API reads as a JWT, so every
 * tool answered 401 and nobody noticed because nothing exercised them.
 *
 *   Authorization: Bearer fm_live_…   ->  401
 *   X-API-Key: fm_live_…              ->  200
 *
 * Two organisations throughout, and the assertions run in both directions
 * (#123). The point is not that a tool refuses once; it is that neither org can
 * see the other, and that "not yours" never reads as "nothing there" (#122).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, apiKeys, campaigns } from '../db/schema/index.js';
import { describeTools, findTool, toJsonSchema, ToolError } from '../services/mcp/index.js';
import type { ToolContext } from '../services/mcp/index.js';
import { z } from 'zod';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

interface Tenant {
  orgId: string;
  key: string;
  ctx: ToolContext;
  campaignId: string;
  campaignName: string;
}
let A: Tenant;
let B: Tenant;

/** The key store holds sha256(key); the raw value is never persisted. */
async function issueKey(orgId: string): Promise<string> {
  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `mcp ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic: false,
  });
  return raw;
}

/**
 * The production transport, with `app.inject` in place of `fetch` — same
 * headers, same routes, same auth. This is what makes "tested against the real
 * service" true rather than aspirational.
 */
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
    .values({ name: `mcp ${label} ${tag}`, slug: `mcp-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);

  const campaignName = `${label} launch ${tag}`;
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId: org!.id,
      name: campaignName,
      subject: `${label} subject`,
      status: 'draft',
    })
    .returning({ id: campaigns.id });

  const key = await issueKey(org!.id);
  return { orgId: org!.id, key, ctx: transportFor(key), campaignId: c!.id, campaignName };
}

const run = (name: string, input: Record<string, unknown>, t: Tenant) => {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.run(tool.input.parse(input), t.ctx);
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('the credential decides the organisation, and nothing else can', () => {
  it('find_campaigns returns only the caller’s campaigns', async () => {
    const out = await run('find_campaigns', {}, A);
    expect(out).toContain(A.campaignName);
    expect(out, 'org B must not appear in org A’s answer').not.toContain(B.campaignName);
  }, 60_000);

  it('and the other direction — B sees B, not A', async () => {
    // #123: one direction passes against a tool that returns nothing for anyone.
    const out = await run('find_campaigns', {}, B);
    expect(out).toContain(B.campaignName);
    expect(out).not.toContain(A.campaignName);
  }, 60_000);

  it('a campaign id belonging to the other org is refused, not answered with zeros', async () => {
    // #122: "nothing there" and "not yours" must not look the same. An
    // assistant told "0 opens" will report the campaign flopped.
    await expect(run('get_campaign_performance', { campaign: B.campaignId }, A)).rejects.toThrow();

    const err = await run('get_campaign_performance', { campaign: B.campaignId }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).status, 'a refusal, not an empty success').toBeGreaterThanOrEqual(
      400,
    );
  }, 60_000);

  it('a campaign NAME belonging to the other org resolves to nothing', async () => {
    // The name path must be scoped too — it lists then filters, and the listing
    // is what carries the scope.
    const err = await run('get_campaign_performance', { campaign: B.campaignName }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toMatch(/No campaign/i);
  }, 60_000);

  it('there is no organisation parameter to override', () => {
    // The guarantee is structural, not a runtime check that could be missed:
    // no tool takes an org id, so a model cannot pass one.
    for (const t of describeTools()) {
      const props = Object.keys(t.inputSchema.properties);
      expect(props, `${t.name} exposes an org parameter`).not.toContain('org_id');
      expect(props).not.toContain('orgId');
      expect(props).not.toContain('organization_id');
    }
  });
});

describe('the transport header the server used to send', () => {
  it('Bearer <api key> is refused; X-API-Key is accepted', async () => {
    // This is the defect, pinned. The MCP server sent the API key as
    // `Authorization: Bearer`, which plugins/auth.ts reads as a JWT session
    // token — verification fails, request.user stays unset, and every guarded
    // route answers 401. All six shipped tools were dead, and no test noticed
    // because none of them called anything.
    const bearer = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${A.key}`, 'x-org-id': A.orgId },
      remoteAddress: nextAddress(),
    });
    expect(bearer.statusCode, 'the old header shape').toBe(401);

    const keyed = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { 'x-api-key': A.key },
      remoteAddress: nextAddress(),
    });
    expect(keyed.statusCode, 'the shape the API actually expects').toBe(200);
  }, 60_000);

  it('X-Org-Id cannot move the answer to another organisation', async () => {
    // It was sent by the old transport, and no route outside the FBL webhook
    // reads it — but a header that names the tenant is the shape #123 and #131
    // were about, so this asserts that setting it changes nothing.
    const honest = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { 'x-api-key': A.key },
      remoteAddress: nextAddress(),
    });
    const spoofed = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { 'x-api-key': A.key, 'x-org-id': B.orgId },
      remoteAddress: nextAddress(),
    });
    expect(spoofed.statusCode).toBe(200);
    expect(
      JSON.stringify(spoofed.json()),
      'naming another org must not change what comes back',
    ).toBe(JSON.stringify(honest.json()));
    expect(JSON.stringify(spoofed.json())).not.toContain(B.campaignName);
  }, 60_000);
});

describe('the tools answer real questions with real data', () => {
  it('get_campaign_performance says "not sent yet" rather than inventing zero rates', async () => {
    const out = await run('get_campaign_performance', { campaign: A.campaignId }, A);
    expect(out).toContain(A.campaignName);
    expect(out, 'a draft has not failed, it has not run').toMatch(/has not been sent/i);
  }, 60_000);

  it('resolves a campaign by name, the way a person refers to one', async () => {
    const out = await run('get_campaign_performance', { campaign: A.campaignName }, A);
    expect(out).toContain(A.campaignName);
  }, 60_000);

  it('an ambiguous name is reported, not guessed', async () => {
    // Picking the first match would make the assistant quote the wrong
    // campaign's numbers with full confidence.
    const dupe = `dupe ${tag}`;
    await db.insert(campaigns).values([
      { orgId: A.orgId, name: `${dupe} one`, subject: 's', status: 'draft' },
      { orgId: A.orgId, name: `${dupe} two`, subject: 's', status: 'draft' },
    ]);

    const err = await run('get_campaign_performance', { campaign: dupe }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toMatch(/matches 2 campaigns/i);
  }, 60_000);

  it('find_campaigns filters by status without leaving the org', async () => {
    const out = await run('find_campaigns', { status: 'sent' }, A);
    expect(out).toMatch(/No campaigns in this account match those filters/i);
    expect(out).not.toContain(B.campaignName);
  }, 60_000);

  it('compare refuses a single campaign rather than returning a table of one', async () => {
    const err = await run('compare_campaign_performance', { campaigns: [A.campaignId] }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toMatch(/at least two/i);
  }, 60_000);

  it('compare will not mix in another org’s campaign', async () => {
    const err = await run(
      'compare_campaign_performance',
      { campaigns: [A.campaignId, B.campaignId] },
      A,
    ).catch((e: unknown) => e);
    expect(err, 'the foreign id must be refused, not silently dropped').toBeInstanceOf(ToolError);
  }, 60_000);
});

describe('the schema an assistant sees is the schema the handler parses', () => {
  it('every tool converts, and required/optional survive the conversion', () => {
    const described = describeTools();
    expect(described.length).toBeGreaterThanOrEqual(9);

    const perf = described.find((t) => t.name === 'get_campaign_performance')!;
    expect(perf.inputSchema.required).toEqual(['campaign']);

    const find = described.find((t) => t.name === 'find_campaigns')!;
    // All three filters are optional — a tool that demanded them would be
    // useless as the first call in a conversation.
    expect(find.inputSchema.required).toEqual([]);
    expect(find.inputSchema.properties.status).toMatchObject({ type: 'string' });
    expect((find.inputSchema.properties.status as { enum: string[] }).enum).toContain('sent');
  });

  it('descriptions reach the model — an undescribed argument is a guessed argument', () => {
    for (const t of describeTools()) {
      for (const [key, prop] of Object.entries(t.inputSchema.properties)) {
        expect(
          String((prop as { description?: string }).description ?? ''),
          `${t.name}.${key}`,
        ).not.toBe('');
      }
    }
  });

  it('an unsupported type fails loudly at conversion rather than shipping untyped', () => {
    // The converter covers a deliberate subset. Silently emitting `{}` for
    // anything else would leave the model guessing at the shape.
    expect(() => toJsonSchema(z.object({ nested: z.object({ a: z.string() }) }))).toThrow(
      /unsupported type/i,
    );
  });
});
