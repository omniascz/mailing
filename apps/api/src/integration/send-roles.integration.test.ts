/**
 * Who may send, schedule and resume a campaign, and who may override the
 * pre-send gate (Z129).
 *
 * Before: the three routes had requireAuth and nothing else, so a viewer —
 * measured in Z127 — sent a campaign with 200. And anyone who could send could
 * also send a no-go campaign by adding acknowledgeDeliverabilityRisk: true.
 *
 * Decided:
 *  - owner, admin and editor send, schedule and resume; a viewer gets 403;
 *  - only owner and admin override the gate; an editor who sends the
 *    acknowledgement gets 403, though the editor may send otherwise;
 *  - the override is still written to audit_logs, as #245 does.
 *
 * Real HTTP through buildApp(), real logins, one session per role.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { auditLogs, campaigns, lists, users } from '../db/schema/index.js';
import { addRecipient, authenticateSender } from './setup/sendable-campaign.js';

let app: FastifyInstance;
const TAG = `roles-${randomUUID().slice(0, 8)}`;
const FROM = `team@${TAG}.test`;
type Role = 'owner' | 'admin' | 'editor' | 'viewer';
const sessions = {} as Record<Role, Session>;
const createdUsers: string[] = [];
const createdCampaigns: string[] = [];
let listId: string;

// Raw HTML is sent as written. With an opt-out link the gate says go; without
// one, 'unsubscribe-link' fails and the verdict is no-go.
const GO = {
  html: '<p>Hi</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  plainText: 'Hi',
};
const NO_GO = { html: '<p>Hi, no way out of this list.</p>', plainText: 'Hi' };

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function draft(content: typeof GO): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers: { cookie: sessions.owner.cookie },
    payload: {
      name: `${TAG} c`,
      subject: 'Hello',
      fromName: 'T',
      fromEmail: FROM,
      listId,
      content,
    },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(201);
  const id = (res.json() as { data: { id: string } }).data.id;
  createdCampaigns.push(id);
  return id;
}

/** A campaign paused by an operator: resume flips it back to sending. */
async function paused(): Promise<string> {
  const id = await draft(GO);
  await db
    .update(campaigns)
    .set({ status: 'paused', pausedReason: null })
    .where(eq(campaigns.id, id));
  return id;
}

const act = (role: Role, id: string, action: string, payload?: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${id}/${action}`,
    headers: { cookie: sessions[role].cookie },
    payload: (payload ?? {}) as never,
  });

const statusOf = async (id: string) =>
  (await db.select({ s: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)))[0]!.s;

async function gateRows(id: string) {
  return db
    .select({ action: auditLogs.action, userId: auditLogs.userId, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(eq(auditLogs.resource, 'campaign'), eq(auditLogs.resourceId, id)));
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  sessions.owner = await login(app);
  const [seed] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const email = `${TAG}-${role}@test.local`;
    const [u] = await db
      .insert(users)
      .values({
        orgId: sessions.owner.orgId,
        email,
        name: `${TAG} ${role}`,
        passwordHash: seed!.hash,
        role,
        emailVerified: true,
      })
      .returning({ id: users.id });
    createdUsers.push(u!.id);
    sessions[role] = await login(app, email);
  }
  await authenticateSender(sessions.owner.orgId, FROM);
  const [l] = await db
    .insert(lists)
    .values({ orgId: sessions.owner.orgId, name: `${TAG} list` })
    .returning({ id: lists.id });
  listId = l!.id;
  await addRecipient(sessions.owner.orgId, listId);
}, 120_000);

afterAll(async () => {
  if (createdCampaigns.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.resourceId, createdCampaigns));
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  }
  if (listId) await db.delete(lists).where(eq(lists.id, listId));
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  await app?.close();
});

describe('a viewer only looks', () => {
  it('send, schedule and resume answer 403 and change nothing', async () => {
    const toSend = await draft(GO);
    const toSchedule = await draft(GO);
    const toResume = await paused();
    const send = await act('viewer', toSend, 'send');
    const schedule = await act('viewer', toSchedule, 'schedule', { scheduledAt: inHours(24) });
    const resume = await act('viewer', toResume, 'resume');
    const after = [await statusOf(toSend), await statusOf(toSchedule), await statusOf(toResume)];
    console.log(
      `[z129] viewer: send=${send.statusCode} schedule=${schedule.statusCode} resume=${resume.statusCode} ` +
        `statuses after=${after.join('/')} body=${send.body.slice(0, 120)}`,
    );
    expect([send.statusCode, schedule.statusCode, resume.statusCode]).toEqual([403, 403, 403]);
    expect(after).toEqual(['draft', 'draft', 'paused']);
  });

  it('scheduling a resend to non-openers is scheduling: 403, no child campaign', async () => {
    const id = await draft(GO);
    await db.update(campaigns).set({ status: 'sent' }).where(eq(campaigns.id, id));
    const res = await act('viewer', id, 'schedule-resend', { delayHours: 24 });
    const children = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.parentCampaignId, id));
    createdCampaigns.push(...children.map((c) => c.id));
    console.log(`[z129] viewer schedule-resend=${res.statusCode} children=${children.length}`);
    expect(res.statusCode).toBe(403);
    expect(children).toEqual([]);
  });

  it('the Resend-compatible broadcast send is the same decision: 403', async () => {
    const id = await draft(GO);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/broadcasts/${id}/send`,
      headers: { cookie: sessions.viewer.cookie },
      payload: {},
    });
    console.log(`[z129] viewer broadcast send=${res.statusCode}`);
    expect(res.statusCode).toBe(403);
    expect(await statusOf(id)).toBe('draft');
  });

  it('a broadcast created with scheduled_at schedules it: 403 for a viewer, and nothing is created', async () => {
    const subject = `${TAG} scheduled broadcast`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/broadcasts',
      headers: { cookie: sessions.viewer.cookie },
      payload: {
        audience_id: listId,
        from: FROM,
        subject,
        html: GO.html,
        scheduled_at: inHours(24),
      },
    });
    const rows = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, sessions.owner.orgId), eq(campaigns.subject, subject)));
    createdCampaigns.push(...rows.map((r) => r.id));
    console.log(`[z129] viewer broadcast create+schedule=${res.statusCode} created=${rows.length}`);
    expect(res.statusCode).toBe(403);
    expect(rows).toEqual([]);
  });
});

describe('an editor sends, but does not override the gate', () => {
  it('editor: send, schedule and resume go through', async () => {
    const toSend = await draft(GO);
    const toSchedule = await draft(GO);
    const toResume = await paused();
    const send = await act('editor', toSend, 'send');
    const schedule = await act('editor', toSchedule, 'schedule', { scheduledAt: inHours(24) });
    const resume = await act('editor', toResume, 'resume');
    console.log(
      `[z129] editor: send=${send.statusCode}→${await statusOf(toSend)} ` +
        `schedule=${schedule.statusCode}→${await statusOf(toSchedule)} resume=${resume.statusCode}→${await statusOf(toResume)}`,
    );
    expect(send.statusCode, send.body.slice(0, 300)).toBe(200);
    expect(schedule.statusCode, schedule.body.slice(0, 300)).toBe(200);
    expect(resume.statusCode, resume.body.slice(0, 300)).toBe(200);
    expect(await statusOf(toSchedule)).toBe('scheduled');
    expect(await statusOf(toResume)).toBe('sending');
  });

  it('editor with acknowledgeDeliverabilityRisk: 403 on send, schedule and resume; nothing sent, nothing recorded', async () => {
    const id = await draft(NO_GO);
    const send = await act('editor', id, 'send', { acknowledgeDeliverabilityRisk: true });
    const schedule = await act('editor', id, 'schedule', {
      scheduledAt: inHours(24),
      acknowledgeDeliverabilityRisk: true,
    });
    const resumeId = await paused();
    const resume = await act('editor', resumeId, 'resume', { acknowledgeDeliverabilityRisk: true });
    const rows = await gateRows(id);
    console.log(
      `[z129] editor+ack: send=${send.statusCode} schedule=${schedule.statusCode} resume=${resume.statusCode} ` +
        `status=${await statusOf(id)} gate rows=${rows.length} message=${JSON.stringify((send.json() as { message: string }).message)}`,
    );
    expect([send.statusCode, schedule.statusCode, resume.statusCode]).toEqual([403, 403, 403]);
    expect((send.json() as { message: string }).message).toBe(
      'Only an owner or admin can send despite the pre-send check (acknowledgeDeliverabilityRisk: true).',
    );
    expect(await statusOf(id)).toBe('draft');
    expect(await statusOf(resumeId)).toBe('paused');
    expect(rows).toEqual([]);
  });

  it('editor without the acknowledgement on a no-go campaign: the gate still answers 422', async () => {
    const id = await draft(NO_GO);
    const res = await act('editor', id, 'send');
    console.log(
      `[z129] editor no-go, no ack: ${res.statusCode} ${(res.json() as { code: string }).code}`,
    );
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe('DELIVERABILITY_NO_GO');
  });
});

describe('owner and admin decide on the risk', () => {
  for (const role of ['owner', 'admin'] as const) {
    it(`${role} without the acknowledgement on a no-go campaign: 422, as before`, async () => {
      const id = await draft(NO_GO);
      const res = await act(role, id, 'send');
      console.log(
        `[z129] ${role} no-go, no ack: ${res.statusCode} ${(res.json() as { code: string }).code}`,
      );
      expect(res.statusCode).toBe(422);
      expect((res.json() as { code: string }).code).toBe('DELIVERABILITY_NO_GO');
      expect(await statusOf(id)).toBe('draft');
    });

    it(`${role} with the acknowledgement: sent, and the override is in the audit log under ${role}`, async () => {
      const id = await draft(NO_GO);
      const res = await act(role, id, 'send', { acknowledgeDeliverabilityRisk: true });
      const rows = await gateRows(id);
      const override = rows.find((r) => r.action === 'campaign.deliverability_override');
      console.log(
        `[z129] ${role}+ack: send=${res.statusCode} status=${await statusOf(id)} ` +
          `audit=${JSON.stringify(rows.map((r) => ({ action: r.action, user: r.userId === sessions[role].userId ? role : r.userId, via: r.metadata?.via, blocking: r.metadata?.blocking })))}`,
      );
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
      expect(await statusOf(id)).not.toBe('draft');
      expect(override).toBeDefined();
      expect(override!.userId).toBe(sessions[role].userId);
      expect(override!.metadata).toMatchObject({ via: 'send', verdict: 'no-go' });
    });
  }

  it('admin schedules a no-go campaign with the acknowledgement: scheduled, override recorded', async () => {
    const id = await draft(NO_GO);
    const res = await act('admin', id, 'schedule', {
      scheduledAt: inHours(24),
      acknowledgeDeliverabilityRisk: true,
    });
    const rows = await gateRows(id);
    console.log(
      `[z129] admin schedule+ack: ${res.statusCode} status=${await statusOf(id)} actions=${rows.map((r) => r.action).join(',')}`,
    );
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(await statusOf(id)).toBe('scheduled');
    expect(rows.map((r) => r.action)).toContain('campaign.deliverability_override');
  });
});
