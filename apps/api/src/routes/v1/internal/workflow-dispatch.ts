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
/**
 * Auth for every route in this file is the internal-auth plugin's onRequest
 * hook: it covers each /api/v1/internal/* path and compares x-internal-secret
 * against env.INTERNAL_API_SECRET in constant time.
 *
 * These handlers used to repeat that check by hand against
 * the legacy `INTERNAL_SECRET` env name — which the API neither validates nor any
 * deployment sets. Two gates that disagree are worse than one, so the
 * duplicates are gone rather than corrected.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import {
  campaigns,
  templates,
  sendingDomains,
  contacts,
  organizations,
} from '../../../db/schema/index.js';
import {
  batchSenderTriggeredQueue,
  PRIORITY,
  sendTransactionalEmail,
} from '../../../lib/queues.js';
import { processWorkflowRuns } from '../../../services/workflows/executor.js';
import { routedSmsSend } from '../../../services/sms/routing.js';
// The payload contracts for the 'email' and 'sms' queues. Defined once in
// lib/queue-contracts.ts so producers can be validated against the same object
// this handler parses with — see that file's header.
import { workflowEmailJobSchema, workflowSmsJobSchema } from '../../../lib/queue-contracts.js';

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

/**
 * Who sent it, for the footer: the same two columns the campaign dispatch reads
 * (services/campaigns/dispatch.ts). The renderer appends the name and postal
 * address to the footer, and only when it has an address; a flow that left
 * them out sent every email with no sender in it.
 */
async function resolveOrgFooterIdentity(
  orgId: string,
): Promise<{ companyName?: string; companyAddress?: string }> {
  const [org] = await db
    .select({ companyName: organizations.companyName, postalAddress: organizations.postalAddress })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return {
    companyName: org?.companyName ?? undefined,
    companyAddress: org?.postalAddress ?? undefined,
  };
}

/**
 * The language the renderer words its own strings in — the opt-out label.
 *
 * It belongs to the message, as on the campaign path: the campaign's column,
 * or the template row's, which a fork writes from the built-in it cloned
 * (services/templates/clone-built-in.ts). Anything else is English, which is
 * also what an absent locale meant before.
 */
function renderLocale(value: string | null | undefined): 'en' | 'cs' | 'sk' {
  return value === 'cs' || value === 'sk' ? value : 'en';
}

export default async function internalWorkflowDispatchRoutes(app: FastifyInstance) {
  /** Resume workflow runs whose wait has elapsed. */
  app.post(
    '/api/v1/internal/workflow/process-runs',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      const result = await processWorkflowRuns();
      return reply.send({ data: result });
    },
  );

  /** Single-contact triggered email — feeds the real batch-sender pipeline. */
  app.post(
    '/api/v1/internal/workflow/send-email',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const body = workflowEmailJobSchema.parse(req.body);

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
      let locale: 'en' | 'cs' | 'sk';

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
        locale = renderLocale(c.locale);
      } else if (body.templateId) {
        const [t] = await db
          .select()
          .from(templates)
          .where(and(eq(templates.id, body.templateId), eq(templates.orgId, body.orgId)))
          .limit(1);
        if (!t) return reply.status(404).send({ error: 'template not found' });
        subject = body.subject ?? t.subject ?? '';
        preheader = t.preheader ?? undefined;
        locale = renderLocale(t.locale);
        /**
         * `subject` and `preheader` go INSIDE the content as well as beside it.
         *
         * emailSchema requires a subject (editor schema/blocks.ts), so a body
         * without one does not parse — and readCampaignContent returning null
         * is what sent every templated workflow email out as JSON.stringify of
         * its own blocks (batch-sender renderEmail, path 3). The renderer also
         * uses the value: it is the document's <title> (render.ts) and the
         * first line of the plain-text part (plain-text.ts).
         *
         * This is the same snapshot the campaign path writes when a campaign
         * starts from a saved template (routes/v1/templates.ts, "subject and
         * preheader are inside it as well as on the row"). The dispatch was the
         * one writer that left them out.
         */
        content = {
          subject,
          preheader: preheader ?? '',
          blocks: t.blocks,
          globalStyles: t.globalStyles,
        };
        const from = await resolveOrgFrom(body.orgId);
        if (!from)
          return reply.send({ data: { skipped: true, reason: 'no verified sending domain' } });
        fromName = from.fromName;
        fromEmail = from.fromEmail;
      } else {
        // Unreachable while workflowEmailJobSchema's refine holds (it requires
        // campaignId, templateId or html, and html returned above). Kept so the
        // handler still refuses a contentless send if that refine is ever
        // loosened — this branch is the behaviour the refine encodes, not a
        // duplicate of it.
        return reply.status(400).send({ error: 'campaignId or templateId required' });
      }

      if (!fromEmail) {
        const from = await resolveOrgFrom(body.orgId);
        if (!from) return reply.send({ data: { skipped: true, reason: 'no from address' } });
        fromEmail = from.fromEmail;
        if (!fromName) fromName = from.fromName;
      }

      const identity = await resolveOrgFooterIdentity(body.orgId);

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
        // What the trigger event carried. The renderer resolves these next to
        // the contact's own fields; the contact wins a name clash, and system
        // values (unsubscribe_url, current_year) are resolved before either.
        mergeData: body.mergeData,
        companyName: identity.companyName,
        companyAddress: identity.companyAddress,
        locale,
      });

      return reply.send({ data: { queued: true } });
    },
  );

  /** Single-contact SMS via the org's routing rules. */
  app.post(
    '/api/v1/internal/workflow/send-sms',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const body = workflowSmsJobSchema.parse(req.body);

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
