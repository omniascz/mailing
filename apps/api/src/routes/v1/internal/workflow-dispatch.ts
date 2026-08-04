/**
 * Internal workflow dispatch — the "engine bus" that makes automation actually
 * run. Workers (apps/workers) consume the orphan 'email'/'sms' queues and the
 * repeatable resumer/cron jobs, then call these endpoints which reuse the real
 * server-side send + resume logic.
 *
 *   POST /api/v1/internal/workflow/process-runs  — resume due workflow runs (waits)
 *   POST /api/v1/internal/workflow/send-email    — single-contact triggered email
 *   POST /api/v1/internal/workflow/send-sms      — single-contact SMS via routing
 *
 * All require the x-internal-secret header (same scheme as internal/events).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { campaigns, templates, sendingDomains, contacts } from '../../../db/schema/index.js';
import {
  batchSenderTriggeredQueue,
  PRIORITY,
  sendTransactionalEmail,
} from '../../../lib/queues.js';
import { processWorkflowRuns } from '../../../services/workflows/executor.js';
import { routedSmsSend } from '../../../services/sms/routing.js';

function checkSecret(secret: unknown): boolean {
  // Enforced when INTERNAL_SECRET is configured; open on the internal network
  // boundary in dev where it's unset (matches existing internal-endpoint use).
  return !process.env.INTERNAL_SECRET || secret === process.env.INTERNAL_SECRET;
}

/** Resolve a usable From identity for an org from its verified sending domains. */
async function resolveOrgFrom(
  orgId: string,
): Promise<{ fromName: string; fromEmail: string } | null> {
  const [dom] = await db
    .select({ domain: sendingDomains.domain, sub: sendingDomains.mailSubdomain })
    .from(sendingDomains)
    .where(eq(sendingDomains.orgId, orgId))
    .limit(1);
  if (!dom?.domain) return null;
  return { fromName: '', fromEmail: `noreply@${dom.sub ?? dom.domain}` };
}

export default async function internalWorkflowDispatchRoutes(app: FastifyInstance) {
  /** Resume workflow runs whose wait has elapsed. */
  app.post(
    '/api/v1/internal/workflow/process-runs',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!checkSecret(req.headers['x-internal-secret'])) return reply.status(401).send();
      const result = await processWorkflowRuns();
      return reply.send({ data: result });
    },
  );

  /** Single-contact triggered email — feeds the real batch-sender pipeline. */
  app.post(
    '/api/v1/internal/workflow/send-email',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!checkSecret(req.headers['x-internal-secret'])) return reply.status(401).send();

      const body = z
        .object({
          orgId: z.string().uuid(),
          contactId: z.string().uuid(),
          campaignId: z.string().uuid().optional(),
          templateId: z.string().uuid().optional(),
          subject: z.string().optional(),
          html: z.string().optional(),
          text: z.string().optional(),
        })
        .parse(req.body);

      // Inline-content path (seeded / self-contained workflows): send directly via
      // the transactional pipeline, no campaign/template lookup.
      if (body.html) {
        const [contact] = await db
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.id, body.contactId), eq(contacts.orgId, body.orgId)))
          .limit(1);
        if (!contact?.email)
          return reply.send({ data: { skipped: true, reason: 'no contact email' } });
        const from = await resolveOrgFrom(body.orgId);
        if (!from) return reply.send({ data: { skipped: true, reason: 'no from address' } });
        const messageId = await sendTransactionalEmail({
          to: contact.email,
          from: from.fromEmail,
          fromName: from.fromName,
          subject: body.subject ?? '',
          html: body.html,
          text: body.text,
          orgId: body.orgId,
          contactId: body.contactId,
        });
        return reply.send({ data: { queued: true, messageId } });
      }

      let content: Record<string, unknown>;
      let subject: string;
      let preheader: string | undefined;
      let fromName: string;
      let fromEmail: string;
      let replyTo: string | undefined;

      if (body.campaignId) {
        const [c] = await db
          .select()
          .from(campaigns)
          .where(and(eq(campaigns.id, body.campaignId), eq(campaigns.orgId, body.orgId)))
          .limit(1);
        if (!c) return reply.status(404).send({ error: 'campaign not found' });
        content = c.content;
        subject = body.subject ?? c.subject ?? '';
        preheader = c.preheader ?? undefined;
        fromName = c.fromName ?? '';
        fromEmail = c.fromEmail ?? '';
        replyTo = c.replyTo ?? undefined;
      } else if (body.templateId) {
        const [t] = await db
          .select()
          .from(templates)
          .where(and(eq(templates.id, body.templateId), eq(templates.orgId, body.orgId)))
          .limit(1);
        if (!t) return reply.status(404).send({ error: 'template not found' });
        content = { blocks: t.blocks, globalStyles: t.globalStyles };
        subject = body.subject ?? t.subject ?? '';
        preheader = t.preheader ?? undefined;
        const from = await resolveOrgFrom(body.orgId);
        if (!from)
          return reply.send({ data: { skipped: true, reason: 'no verified sending domain' } });
        fromName = from.fromName;
        fromEmail = from.fromEmail;
      } else {
        return reply.status(400).send({ error: 'campaignId or templateId required' });
      }

      if (!fromEmail) {
        const from = await resolveOrgFrom(body.orgId);
        if (!from) return reply.send({ data: { skipped: true, reason: 'no from address' } });
        fromEmail = from.fromEmail;
        if (!fromName) fromName = from.fromName;
      }

      await batchSenderTriggeredQueue.add('workflow-email', {
        // synthetic campaign id keeps event rows traceable for template sends
        campaignId: body.campaignId ?? body.orgId,
        orgId: body.orgId,
        batchIndex: 0,
        contactIds: [body.contactId],
        content,
        subject,
        preheader,
        fromName,
        fromEmail,
        replyTo,
        priority: PRIORITY.TRIGGERED,
        stream: 'triggered',
      });

      return reply.send({ data: { queued: true } });
    },
  );

  /** Single-contact SMS via the org's routing rules. */
  app.post(
    '/api/v1/internal/workflow/send-sms',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!checkSecret(req.headers['x-internal-secret'])) return reply.status(401).send();

      const body = z
        .object({
          orgId: z.string().uuid(),
          contactId: z.string().uuid(),
          phone: z.string().min(3),
          message: z.string().min(1),
          // Set for bulk SMS campaigns — flags the send as marketing (consent +
          // quiet-hours gate) and attributes the delivery to the campaign.
          campaignId: z.string().uuid().optional(),
          workflowId: z.string().uuid().optional(),
        })
        .parse(req.body);

      try {
        const result = await routedSmsSend(
          body.orgId,
          {
            channel: 'sms',
            orgId: body.orgId,
            content: { kind: 'sms', body: body.message },
            ...(body.campaignId ? { campaignId: body.campaignId } : {}),
            ...(body.workflowId ? { workflowId: body.workflowId } : {}),
          },
          { contactId: body.contactId, phone: body.phone },
        );
        return reply.send({ data: { messageId: result.messageId, status: result.status } });
      } catch (err) {
        return reply.status(502).send({ error: (err as Error).message });
      }
    },
  );
}
