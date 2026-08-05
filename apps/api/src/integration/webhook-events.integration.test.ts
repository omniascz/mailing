/**
 * The six events that were never emitted, driven through real HTTP.
 *
 * The coverage test proves a literal reaches an emitter. It cannot prove the
 * emitter runs, that the org scoping matches, or that a delivery row is
 * actually written — and "the call exists but never executes" is exactly the
 * failure mode this whole change is about. So these perform the real operation
 * against a real database and assert on webhook_deliveries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp, login } from './setup/harness.js';
import { db } from '../db/client.js';
import { webhooks, webhookDeliveries } from '../db/schema/index.js';
import { WEBHOOK_EVENTS } from '../db/schema/webhooks.js';

const SECRET = 'events-itest-secret-0123456789abcdef';

let app: FastifyInstance;
let cookie: string;
let orgId: string;
let webhookId: string;

/** Deliveries recorded for our webhook, newest first. */
async function deliveries(event?: string) {
  const rows = await db
    .select({
      event: webhookDeliveries.event,
      payload: webhookDeliveries.payload,
      status: webhookDeliveries.status,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId));
  return event ? rows.filter((r) => r.event === event) : rows;
}

/** dispatchEvent is fire-and-forget; give it a moment to land. */
async function waitForEvent(event: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await deliveries(event);
    if (rows.length > 0) return rows[0]!;
    await new Promise((r) => setTimeout(r, 100));
  }
  const seen = (await deliveries()).map((r) => r.event);
  throw new Error(`no ${event} delivery was written. Events seen: ${seen.join(', ') || '(none)'}`);
}

const data = (row: { payload: unknown }) => (row.payload as { data: Record<string, unknown> }).data;

describe('webhook events are emitted (authenticated, real DB)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    const session = await login(app);
    cookie = session.cookie;
    orgId = session.orgId;

    await db.delete(webhooks).where(eq(webhooks.secret, SECRET));
    // Subscribe to everything — the point is to see what arrives, not to
    // filter, and a wildcard would not prove the event name is right.
    const [wh] = await db
      .insert(webhooks)
      .values({
        orgId,
        url: 'https://example.com/hooks/events-itest',
        secret: SECRET,
        events: [...WEBHOOK_EVENTS],
        active: true,
      })
      .returning({ id: webhooks.id });
    webhookId = wh!.id;
  });

  afterAll(async () => {
    await db.delete(webhooks).where(eq(webhooks.secret, SECRET));
  });

  describe('contacts', () => {
    let contactId: string;

    it('POST /contacts emits contact.created with the contract shape', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/contacts',
        headers: { cookie },
        payload: { email: `events-itest-${Date.now()}@example.com`, firstName: 'Jana' },
      });
      expect(res.statusCode).toBe(201);
      contactId = (res.json() as { data: { id: string } }).data.id;

      const row = await waitForEvent('contact.created');
      const d = data(row);
      expect(d['id']).toBe(contactId);
      expect(d['firstName']).toBe('Jana');
      // The old signup-form payload. If these come back, the shape regressed.
      expect(d).not.toHaveProperty('contactId');
      expect(d).not.toHaveProperty('formId');
      expect(d['source']).toBe('api');
      expect(typeof d['createdAt']).toBe('string');
    });

    it('PUT /contacts/:id emits contact.updated and says what changed', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/contacts/${contactId}`,
        headers: { cookie },
        payload: { firstName: 'Jitka' },
      });
      expect(res.statusCode).toBe(200);

      const d = data(await waitForEvent('contact.updated'));
      expect(d['id']).toBe(contactId);
      expect(d['firstName']).toBe('Jitka');
      expect(d['changed']).toContain('firstName');
    });

    it('the VIP toggle counts as an update too', async () => {
      const before = (await deliveries('contact.updated')).length;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/contacts/${contactId}/vip`,
        headers: { cookie },
        payload: { isVip: true },
      });
      expect(res.statusCode).toBe(200);

      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && (await deliveries('contact.updated')).length === before) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const rows = await deliveries('contact.updated');
      expect(rows.length).toBeGreaterThan(before);
      expect(rows.some((r) => (data(r)['changed'] as string[]).includes('isVip'))).toBe(true);
    });

    it('DELETE /contacts/:id emits contact.deleted with identifiers only', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/contacts/${contactId}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(204);

      const d = data(await waitForEvent('contact.deleted'));
      expect(d['id']).toBe(contactId);
      expect(Object.keys(d).sort()).toEqual(['email', 'id']);
    });
  });

  describe('campaigns', () => {
    it('marking a campaign sent emits campaign.sent', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { cookie },
        payload: { name: 'events-itest campaign', subject: 'Ahoj', fromEmail: 'demo@acme.test' },
      });
      expect(created.statusCode).toBe(201);
      const campaignId = (created.json() as { data: { id: string } }).data.id;

      // The transition the splitter drives after the last batch, reached
      // through the same internal route the worker uses.
      const { setCampaignStatusInternal } = await import('../services/campaigns/dispatch.js');
      await setCampaignStatusInternal(campaignId, 'sent');

      const d = data(await waitForEvent('campaign.sent'));
      expect(d['campaignId']).toBe(campaignId);
      expect(d['name']).toBe('events-itest campaign');
      expect(d['subject']).toBe('Ahoj');
      expect(typeof d['sentAt']).toBe('string');
    });

    it('does not emit for the other status transitions', async () => {
      const before = (await deliveries('campaign.sent')).length;
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { cookie },
        payload: { name: 'events-itest paused', fromEmail: 'demo@acme.test' },
      });
      const campaignId = (created.json() as { data: { id: string } }).data.id;

      const { setCampaignStatusInternal } = await import('../services/campaigns/dispatch.js');
      await setCampaignStatusInternal(campaignId, 'sending');
      await setCampaignStatusInternal(campaignId, 'paused');
      await new Promise((r) => setTimeout(r, 500));

      expect((await deliveries('campaign.sent')).length).toBe(before);
    });
  });

  describe('sms', () => {
    it('a delivery report emits sms.delivered, and a failure emits sms.failed', async () => {
      const { smsSendLog } = await import('../db/schema/index.js');
      const { updateSmsDeliveryStatus } = await import('../services/sms/routing.js');

      const mk = async (providerMessageId: string) => {
        await db.insert(smsSendLog).values({
          orgId,
          phone: '+420777123456',
          provider: 'twilio',
          providerMessageId,
          status: 'sent',
          segments: 1,
        });
      };

      await mk('SM-itest-delivered');
      await updateSmsDeliveryStatus('SM-itest-delivered', 'delivered', new Date());
      const ok = data(await waitForEvent('sms.delivered'));
      expect(ok['providerMessageId']).toBe('SM-itest-delivered');
      expect(ok['provider']).toBe('twilio');
      expect(ok['to']).toBe('+420777123456');

      await mk('SM-itest-failed');
      await updateSmsDeliveryStatus('SM-itest-failed', 'failed', undefined, 'Unreachable handset');
      const bad = data(await waitForEvent('sms.failed'));
      expect(bad['providerMessageId']).toBe('SM-itest-failed');
      expect(bad['reason']).toBe('Unreachable handset');

      await db
        .delete(smsSendLog)
        .where(
          and(
            eq(smsSendLog.orgId, orgId),
            inArray(smsSendLog.providerMessageId, ['SM-itest-delivered', 'SM-itest-failed']),
          ),
        );
    });

    it('says nothing about intermediate provider states', async () => {
      const before = (await deliveries()).filter((r) => r.event.startsWith('sms.')).length;
      const { smsSendLog } = await import('../db/schema/index.js');
      const { updateSmsDeliveryStatus } = await import('../services/sms/routing.js');

      await db.insert(smsSendLog).values({
        orgId,
        phone: '+420777123456',
        provider: 'twilio',
        providerMessageId: 'SM-itest-queued',
        status: 'queued',
        segments: 1,
      });
      await updateSmsDeliveryStatus('SM-itest-queued', 'sent');
      await new Promise((r) => setTimeout(r, 500));

      const after = (await deliveries()).filter((r) => r.event.startsWith('sms.')).length;
      expect(after).toBe(before);

      await db.delete(smsSendLog).where(eq(smsSendLog.providerMessageId, 'SM-itest-queued'));
    });
  });

  describe('workflows', () => {
    it('a completed run emits workflow.completed', async () => {
      const { workflows: workflowsTable, workflowRuns } = await import('../db/schema/index.js');
      const [wf] = await db
        .insert(workflowsTable)
        .values({ orgId, name: 'events-itest workflow', status: 'active', nodes: [], edges: [] })
        .returning({ id: workflowsTable.id });

      const [run] = await db
        .insert(workflowRuns)
        .values({ orgId, workflowId: wf!.id, status: 'running' })
        .returning({ id: workflowRuns.id });

      // completeRun is module-private; the exported executor entry point is
      // what reaches it, so the run is completed through the same update the
      // executor performs and the emitter is exercised via the service.
      const { completeRunForTest } = await import('../services/workflows/executor.js');
      await completeRunForTest(run!.id, wf!.id);

      const d = data(await waitForEvent('workflow.completed'));
      expect(d['runId']).toBe(run!.id);
      expect(d['workflowId']).toBe(wf!.id);
      expect(typeof d['completedAt']).toBe('string');

      await db.delete(workflowsTable).where(eq(workflowsTable.id, wf!.id));
    });
  });

  describe('scoping', () => {
    it('never delivers another org an event it did not cause', async () => {
      // Every delivery row written for our webhook must belong to our org.
      const rows = await db
        .select({ orgId: webhookDeliveries.orgId })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhookId));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.orgId === orgId)).toBe(true);
    });
  });
});
