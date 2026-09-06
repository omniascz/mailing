/**
 * The contacts and flows tools, against real routes and two organisations.
 *
 * Same discipline as #138: no mock anywhere. The transport is the real Fastify
 * app, the credential is a real `api_keys` row, and the writes go through the
 * real routes — which is also how they end up in the audit log, since the audit
 * plugin is an `onResponse` hook and `contacts`, `suppressions` and `workflows`
 * are all in AUDITED_RESOURCES. A tool that called services directly would
 * bypass auth, scoping, rate limiting AND auditing in one step.
 *
 * The write tools are the reason this file matters more than the last one. Both
 * of them only ever REDUCE what gets sent — suppress a contact, pause a flow —
 * and there is deliberately no tool that starts a message. The tests assert
 * that asymmetry rather than describing it: there is no resume, no create, no
 * field update in the registry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  apiKeys,
  contacts,
  workflows,
  auditLogs,
  suppressions,
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
  contactId: string;
  email: string;
  workflowId: string;
  workflowName: string;
}
let A: Tenant;
let B: Tenant;

async function issueKey(orgId: string): Promise<string> {
  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `mcp cf ${tag}`,
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

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `cf ${label} ${tag}`, slug: `cf-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);

  const email = `${label}-person-${tag}@example.test`;
  const [c] = await db
    .insert(contacts)
    .values({
      orgId: org!.id,
      email,
      firstName: label === 'a' ? 'Adéla' : 'Bohdan',
      lastName: 'Testovací',
      status: 'active',
    })
    .returning({ id: contacts.id });

  const workflowName = `${label} welcome ${tag}`;
  const [w] = await db
    .insert(workflows)
    .values({
      orgId: org!.id,
      name: workflowName,
      status: 'active',
      triggerType: 'manual',
      nodes: [{ id: 't', type: 'trigger', config: {} }] as never,
      edges: [],
    })
    .returning({ id: workflows.id });

  const key = await issueKey(org!.id);
  return {
    orgId: org!.id,
    key,
    ctx: transportFor(key),
    contactId: c!.id,
    email,
    workflowId: w!.id,
    workflowName,
  };
}

const run = (name: string, input: Record<string, unknown>, t: Tenant) => {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.run(tool.input.parse(input), t.ctx);
};

const auditFor = async (orgId: string, resource: string) =>
  db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.resource, resource)));

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

describe('contacts — the credential decides the organisation', () => {
  it('find_contact returns only the caller’s people', async () => {
    const out = await run('find_contact', { query: 'Testovací' }, A);
    expect(out).toContain(A.email);
    expect(out, 'org B must not appear in org A’s answer').not.toContain(B.email);
  }, 60_000);

  it('and the other direction — B sees B, not A', async () => {
    // #123: one direction passes against a tool that finds nobody for anyone.
    const out = await run('find_contact', { query: 'Testovací' }, B);
    expect(out).toContain(B.email);
    expect(out).not.toContain(A.email);
  }, 60_000);

  it('another org’s contact id is refused, not answered with a blank profile', async () => {
    // #122 / #138: "not yours" and "nothing there" must not look the same. A
    // blank overview would have an assistant report that the person has no
    // consent and no history.
    const err = await run('get_contact_overview', { contact: B.contactId }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).status).toBeGreaterThanOrEqual(400);
  }, 60_000);

  it('another org’s email address resolves to nothing, both ways', async () => {
    const fromA = await run('get_contact_overview', { contact: B.email }, A).catch(
      (e: unknown) => e,
    );
    expect(fromA).toBeInstanceOf(ToolError);
    expect((fromA as ToolError).message).toMatch(/No contact/i);

    const fromB = await run('get_contact_overview', { contact: A.email }, B).catch(
      (e: unknown) => e,
    );
    expect(fromB).toBeInstanceOf(ToolError);
  }, 60_000);
});

describe('contacts — the answers are usable', () => {
  it('the overview reports status, source and suppression in one call', async () => {
    const out = await run('get_contact_overview', { contact: A.email }, A);
    expect(out).toContain(A.email);
    expect(out).toMatch(/status\s+active/);
    expect(out).toMatch(/suppressed\s+no/);
  }, 60_000);

  it('a contact with no activity says so, rather than failing', async () => {
    const out = await run('get_contact_activity', { contact: A.email }, A);
    expect(out).toMatch(/no recorded activity/i);
  }, 60_000);

  it('an ambiguous name is reported with candidates, not guessed', async () => {
    // Quoting the wrong person's consent state — or suppressing them — is a
    // mistake about a real human being, so the tool refuses to pick.
    const dupe = `dupe-${tag}`;
    await db.insert(contacts).values([
      { orgId: A.orgId, email: `${dupe}-1@example.test`, firstName: 'Dupe', status: 'active' },
      { orgId: A.orgId, email: `${dupe}-2@example.test`, firstName: 'Dupe', status: 'active' },
    ]);
    const err = await run('get_contact_overview', { contact: dupe }, A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toMatch(/matches 2 contacts/i);
  }, 60_000);
});

describe('suppress_contact — the one write, and it only ever reduces sending', () => {
  it('suppresses the caller’s own contact and records it in the audit log', async () => {
    const before = (await auditFor(A.orgId, 'suppressions')).length;

    const out = await run('suppress_contact', { contact: A.email, reason: 'complaint' }, A);
    expect(out).toContain(A.email);
    expect(out).toMatch(/no longer receive/i);

    const rows = await db
      .select()
      .from(suppressions)
      .where(and(eq(suppressions.orgId, A.orgId), eq(suppressions.email, A.email)));
    expect(rows.length, 'the suppression must actually exist').toBe(1);

    // The audit entry is not incidental: it is how a write made by an assistant
    // is answerable to a human afterwards. It arrives via the onResponse hook,
    // which is fire-and-forget, so this waits for it rather than assuming.
    let after = before;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      after = (await auditFor(A.orgId, 'suppressions')).length;
      if (after > before) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(after, 'the write must be in the audit log').toBeGreaterThan(before);
  }, 60_000);

  it('suppressing again is reported as already done, not as a failure', async () => {
    // An assistant told "error" retries; told "already true", it moves on.
    const out = await run('suppress_contact', { contact: A.email, reason: 'complaint' }, A);
    expect(out).toMatch(/already suppressed/i);
  }, 60_000);

  it('cannot suppress into another organisation', async () => {
    const before = (
      await db
        .select()
        .from(suppressions)
        .where(and(eq(suppressions.orgId, B.orgId), eq(suppressions.email, B.email)))
    ).length;

    const err = await run('suppress_contact', { contact: B.email, reason: 'manual' }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);

    const after = (
      await db
        .select()
        .from(suppressions)
        .where(and(eq(suppressions.orgId, B.orgId), eq(suppressions.email, B.email)))
    ).length;
    expect(after, 'nothing may be written into org B').toBe(before);
  }, 60_000);
});

describe('flows — read and stop, never start', () => {
  it('find_workflows is org-scoped in both directions', async () => {
    const fromA = await run('find_workflows', {}, A);
    expect(fromA).toContain(A.workflowName);
    expect(fromA).not.toContain(B.workflowName);

    const fromB = await run('find_workflows', {}, B);
    expect(fromB).toContain(B.workflowName);
    expect(fromB).not.toContain(A.workflowName);
  }, 60_000);

  it('another org’s flow id is refused', async () => {
    const err = await run('get_workflow_performance', { workflow: B.workflowId }, A).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).status).toBeGreaterThanOrEqual(400);
  }, 60_000);

  it('performance reports run counts for the caller’s own flow', async () => {
    const out = await run('get_workflow_performance', { workflow: A.workflowName }, A);
    expect(out).toContain(A.workflowName);
    expect(out).toMatch(/runs started/);
  }, 60_000);

  it('pause_workflow stops the flow and is audited', async () => {
    const before = (await auditFor(A.orgId, 'workflows')).length;

    const out = await run('pause_workflow', { workflow: A.workflowName }, A);
    expect(out).toMatch(/paused/i);

    const [row] = await db.select().from(workflows).where(eq(workflows.id, A.workflowId));
    expect(row!.status, 'the flow must actually stop').not.toBe('active');

    let after = before;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      after = (await auditFor(A.orgId, 'workflows')).length;
      if (after > before) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(after, 'pausing must be in the audit log').toBeGreaterThan(before);
  }, 60_000);

  it('pausing an already-paused flow is reported as already done', async () => {
    const out = await run('pause_workflow', { workflow: A.workflowName }, A);
    expect(out).toMatch(/not sending|Nothing changed/i);
  }, 60_000);

  it('cannot pause another organisation’s flow', async () => {
    const err = await run('pause_workflow', { workflow: B.workflowId }, A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);

    const [row] = await db.select().from(workflows).where(eq(workflows.id, B.workflowId));
    expect(row!.status, 'org B’s flow must be untouched').toBe('active');
  }, 60_000);
});

describe('the shape of the surface', () => {
  it('no tool takes an organisation id', () => {
    for (const t of describeTools()) {
      const props = Object.keys(t.inputSchema.properties);
      expect(props, `${t.name}`).not.toContain('org_id');
      expect(props).not.toContain('orgId');
      expect(props).not.toContain('organization_id');
    }
  });

  it('nothing in these two areas can start a message', () => {
    // The rule the areas are built on, asserted rather than trusted: a tool may
    // stop a message, never start one. If somebody adds `resume_workflow` or a
    // contact-field writer, this fails and they have to argue for it.
    const names = describeTools().map((t) => t.name);
    for (const forbidden of [
      'resume_workflow',
      'activate_workflow',
      'start_workflow',
      'unsuppress_contact',
      'update_contact',
      'update_contact_fields',
    ]) {
      expect(names, `${forbidden} would break the one-way rule`).not.toContain(forbidden);
    }
    // And the two that do exist are present.
    expect(names).toContain('suppress_contact');
    expect(names).toContain('pause_workflow');
  });

  it('every argument in the new areas is described', () => {
    const added = [
      'find_contact',
      'get_contact_overview',
      'get_contact_activity',
      'suppress_contact',
      'find_workflows',
      'get_workflow_performance',
      'pause_workflow',
    ];
    const described = describeTools().filter((t) => added.includes(t.name));
    expect(described.length).toBe(added.length);
    for (const t of described) {
      for (const [key, prop] of Object.entries(t.inputSchema.properties)) {
        expect(
          String((prop as { description?: string }).description ?? ''),
          `${t.name}.${key}`,
        ).not.toBe('');
      }
    }
  });
});
