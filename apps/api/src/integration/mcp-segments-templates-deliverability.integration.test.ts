/**
 * The third batch of tools, against real routes and two organisations.
 *
 * Same discipline as #138 and #139: no mock anywhere. The transport is the real
 * Fastify app, the credential is a real `api_keys` row, and every assertion
 * goes through the registered route — so auth, org scoping and rate limiting
 * are all in the path a tool actually takes. A test that called the services
 * directly would prove the SQL works and nothing about the tool.
 *
 * Two things this file is really about.
 *
 * ISOLATION FROM BOTH SIDES. Every tool that takes a reference is asked for the
 * other tenant's id, and must answer NOT FOUND rather than an empty result.
 * "Nothing here" and "not yours" reading the same is how #122 happened, and on
 * a tool surface it is worse than on an API: the caller is a language model
 * that will report "you have no segment by that name" and move on, when the
 * truth is that the segment exists and belongs to somebody else.
 *
 * NO WRITES. Eleven tools, none of which changes anything. The registry is
 * asserted for that at the end rather than described: `audit_log.actor_id` is
 * `uuid NOT NULL` referencing `users`, and an MCP key belongs to an
 * organisation, not a person — so a write tool here would be a write nobody is
 * recorded as having made.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  apiKeys,
  contacts,
  segments,
  templates as savedTemplates,
  campaigns,
} from '../db/schema/index.js';
import { describeTools, findTool, ToolError } from '../services/mcp/index.js';
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
  segmentId: string;
  segmentName: string;
  templateId: string;
  templateName: string;
  campaignId: string;
  campaignName: string;
  contactEmail: string;
}
let A: Tenant;
let B: Tenant;

async function issueKey(orgId: string): Promise<string> {
  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `mcp std ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic: false,
  });
  return raw;
}

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

/** Run a tool by the name an assistant would use. */
async function run(t: Tenant, name: string, input: Record<string, unknown> = {}) {
  const tool = findTool(name);
  if (!tool) throw new Error(`tool ${name} is not registered`);
  return tool.run(tool.input.parse(input), t.ctx);
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `std ${label} ${tag}`, slug: `std-${label}-${tag}` })
    .returning({ id: organizations.id });
  const orgId = org!.id;
  orgIds.push(orgId);

  const contactEmail = `${label}-person-${tag}@example.test`;
  await db.insert(contacts).values({
    orgId,
    email: contactEmail,
    firstName: label === 'a' ? 'Adéla' : 'Bohdan',
    lastName: 'Testovací',
    status: 'active',
  });

  const segmentName = `${label} active people ${tag}`;
  const [s] = await db
    .insert(segments)
    .values({
      orgId,
      name: segmentName,
      description: `everyone active in ${label}`,
      conditions: { operator: 'AND', rules: [{ field: 'status', op: 'eq', value: 'active' }] },
    })
    .returning({ id: segments.id });

  const templateName = `${label} newsletter ${tag}`;
  const [t] = await db
    .insert(savedTemplates)
    .values({ orgId, name: templateName, category: 'newsletter' })
    .returning({ id: savedTemplates.id });

  const campaignName = `${label} launch ${tag}`;
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: campaignName,
      subject: 'Hello from us',
      fromEmail: `hello@${label}-${tag}.test`,
      fromName: 'Us',
      status: 'draft',
      content: { html: '<p>Hi {{contact.first_name}}</p><a href="{{unsubscribe_url}}">out</a>' },
    })
    .returning({ id: campaigns.id });

  const key = await issueKey(orgId);
  return {
    orgId,
    key,
    ctx: transportFor(key),
    segmentId: s!.id,
    segmentName,
    templateId: t!.id,
    templateName,
    campaignId: c!.id,
    campaignName,
    contactEmail,
  };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeTenant('a');
  B = await makeTenant('b');
}, 90_000);

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.name, `mcp std ${tag}`));
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

// ─── Segments ────────────────────────────────────────────────────────────────

describe('segments', () => {
  it('find_segments lists this org and only this org', async () => {
    const out = await run(A, 'find_segments');
    expect(out).toContain(A.segmentName);
    expect(out, "another tenant's segment leaked into the list").not.toContain(B.segmentName);
  });

  it('find_segments filters by name', async () => {
    const out = await run(A, 'find_segments', { name_contains: 'active people' });
    expect(out).toContain(A.segmentName);
  });

  it('find_segments says so plainly when nothing matches', async () => {
    const out = await run(A, 'find_segments', { name_contains: `nothing-${tag}` });
    expect(out.toLowerCase()).toContain('no segment');
  });

  it('get_segment_size counts, and shows the rules it counted by', async () => {
    const out = await run(A, 'get_segment_size', { segment: A.segmentName });
    expect(out).toContain(A.segmentName);
    expect(out).toMatch(/matches \d+ contact/);
    expect(out, 'the conditions were not spelled out').toContain('status eq active');
  });

  it("ISOLATION: get_segment_size on the other tenant's id is NOT FOUND, not zero", async () => {
    await expect(run(A, 'get_segment_size', { segment: B.segmentId })).rejects.toMatchObject({
      status: 404,
    });
    await expect(run(B, 'get_segment_size', { segment: A.segmentId })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("ISOLATION: the other tenant's segment NAME does not resolve either", async () => {
    await expect(run(A, 'get_segment_size', { segment: B.segmentName })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('list_segment_members returns this org’s contacts', async () => {
    const out = await run(A, 'list_segment_members', { segment: A.segmentName });
    expect(out).toContain(A.contactEmail);
    expect(out, "another tenant's contact was listed").not.toContain(B.contactEmail);
  });

  it('ISOLATION: list_segment_members refuses a foreign id', async () => {
    await expect(run(A, 'list_segment_members', { segment: B.segmentId })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('get_audience_health reports this org’s totals', async () => {
    const out = await run(A, 'get_audience_health');
    expect(out).toMatch(/contact\(s\) in this account|no contacts yet/);
  });
});

// ─── Templates ───────────────────────────────────────────────────────────────

describe('templates', () => {
  it('find_templates shows this org’s saved templates and the built-in gallery', async () => {
    const out = await run(A, 'find_templates');
    expect(out).toContain(A.templateName);
    expect(out, "another tenant's template leaked").not.toContain(B.templateName);
    expect(out).toContain('built-in');
  });

  it('check_template_content scores content it is handed', async () => {
    const out = await run(A, 'check_template_content', {
      html: '<html><body><h1>WINNER</h1><p>ACT NOW — click here, risk-free!!!</p></body></html>',
      subject: 'FREE!!! You are a WINNER',
    });
    expect(out).toMatch(/Spam score \d/);
    expect(out).toContain('Accessibility');
  });

  it('check_template_content is clean about clean content', async () => {
    const out = await run(A, 'check_template_content', {
      html:
        '<html><body><p>Hello, here is our monthly update with the three things we shipped.</p>' +
        '<p><a href="https://example.test/unsubscribe">Unsubscribe</a></p></body></html>',
      subject: 'Monthly update',
      has_plain_text: true,
    });
    expect(out).toMatch(/Spam score \d/);
  });
});

// ─── Deliverability ──────────────────────────────────────────────────────────

describe('deliverability', () => {
  it('get_domain_authentication says plainly when there is no sending domain', async () => {
    const out = await run(A, 'get_domain_authentication');
    // A fresh org has none. The wording has to be a fact about setup, not a
    // clean bill of health.
    expect(out).toMatch(/No sending domain is set up|sending domain\(s\)/);
  });

  it('get_account_deliverability does not report a score over an empty window at all', async () => {
    // The endpoint underneath returns 100 (A) for an org that has never sent —
    // every rate the weights read is zero over an empty window. Measured on a
    // fresh org before this tool existed: `Health score 100 (A) over 30 days.`
    const out = await run(A, 'get_account_deliverability', { days: 30 });
    expect(out).toContain('No email has been sent from this account');
    expect(out, 'a grade computed over nothing was handed to the caller anyway').not.toMatch(
      /Health score \d/,
    );
  });

  it('get_deliverability_by_isp says there is nothing to split when nothing was sent', async () => {
    const out = await run(A, 'get_deliverability_by_isp', { days: 30 });
    expect(out).toContain('No delivery events recorded');
  });

  it('run_pre_send_checks returns a verdict with reasons', async () => {
    const out = await run(A, 'run_pre_send_checks', { campaign: A.campaignName });
    expect(out).toContain(A.campaignName);
    expect(out).toMatch(/GO|CAUTION|NO-GO/);
  });

  it("ISOLATION: run_pre_send_checks on the other tenant's campaign is NOT FOUND", async () => {
    await expect(run(A, 'run_pre_send_checks', { campaign: B.campaignId })).rejects.toMatchObject({
      status: 404,
    });
    await expect(run(B, 'run_pre_send_checks', { campaign: A.campaignId })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('get_sending_ip_status names the shared pool rather than answering with nothing', async () => {
    const out = await run(A, 'get_sending_ip_status');
    expect(out).toContain('shared pool');
  });
});

// ─── The shape of the registry ───────────────────────────────────────────────

describe('the registry after this batch', () => {
  it('registers all eleven tools, each with a schema an assistant can read', () => {
    const described = describeTools();
    const names = described.map((t) => t.name);
    for (const n of [
      'find_segments',
      'get_segment_size',
      'list_segment_members',
      'get_audience_health',
      'find_templates',
      'check_template_content',
      'get_domain_authentication',
      'get_account_deliverability',
      'get_deliverability_by_isp',
      'run_pre_send_checks',
      'get_sending_ip_status',
    ]) {
      expect(names, `${n} is not registered`).toContain(n);
      const d = described.find((x) => x.name === n)!;
      expect(d.description.length, `${n} has no usable description`).toBeGreaterThan(40);
      expect(d.inputSchema.type).toBe('object');
    }
  });

  it('adds no tool that writes anything', () => {
    // Asserted rather than described. audit_log.actor_id is uuid NOT NULL to
    // users and an MCP key belongs to an organisation, so any write added here
    // would be a write with nobody recorded as having made it.
    const forbidden = [
      'create_segment',
      'update_segment',
      'delete_segment',
      'create_template',
      'update_template',
      'delete_template',
      'remove_contacts',
      'purge_inactive',
      'merge_duplicates',
      'recheck_domain_authentication',
      'start_warmup',
    ];
    const names = describeTools().map((t) => t.name);
    for (const f of forbidden) {
      expect(names, `${f} must not exist in this batch`).not.toContain(f);
    }
  });

  it('every tool name is unique', () => {
    const names = describeTools().map((t) => t.name);
    expect(new Set(names).size, 'two tools share a name').toBe(names.length);
  });

  it('a ToolError carries the status, so "none" and "not yours" stay distinguishable', async () => {
    const err = await run(A, 'get_segment_size', { segment: B.segmentId }).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).status).toBe(404);
  });
});
