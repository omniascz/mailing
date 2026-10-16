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
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { campaigns, templates, sendingDomains, contacts } from '../../../db/schema/index.js';
import {
  batchSenderTriggeredQueue,
  PRIORITY,
  sendTransactionalEmail,
} from '../../../lib/queues.js';
import { processWorkflowRuns } from '../../../services/workflows/executor.js';
import { routedSmsSend } from '../../../services/sms/routing.js';
import {
  liftedByFlowTransactional,
  refusesFlowMarketing,
  refusesMarketing,
} from '@forgemsg/shared';
import { flowTransactionalException } from '../../../services/workflows/transactional-exception.js';
// The inline e-mail's opt-out and the sender identity of both branches (Z157).
import {
  applyInlineOptOut,
  resolveOrgFooterIdentity,
} from '../../../services/workflows/inline-optout.js';
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

      // Inline-content path: a flow's send_email with config.html, personal
      // e-mails, review requests, sales-sequence steps and the seeded ticketing
      // flows. Sent directly on the transactional stream, no campaign/template
      // lookup.
      //
      // A flow e-mail is marketing — the standing decision is that it stays off
      // the transactional path because an opt-out must stop it — so this branch
      // gates it as marketing, twice:
      // - the contact's status: unsubscribed, bounced, complained, pending or
      //   archived gets nothing, the same statuses batch-sender refuses (the
      //   shared MARKETING_REFUSED_CONTACT_STATUSES; archived since Z153). A
      //   flow's node (the job carries the workflowRunId the API's executor
      //   puts in it — a send_email with html, a personal e-mail, a review
      //   request) skips non_subscribed too: FLOW_MARKETING_REFUSED_CONTACT_STATUSES
      //   (Michal, 14. 10. 22:10, point 3; Z166). A sequence step has no run
      //   and is unchanged. Answered as a skip with 200, so the 'email' job
      //   completes and is not retried;
      // - purpose 'workflow_marketing', which makes mta-sender check every
      //   suppression reason, 'unsubscribe' included, where a transactional
      //   message is stopped by all but that one.
      // Before this, the branch read neither: on master 30 of 45 measured sends
      // reached the engine for people with no consent (Z151), the hole Z143
      // left out of its scope (MIMO 7). Z152.
      //
      // The opt-out link and the footer are decided and added (Michal, 14. 10.
      // 22:10, point 2; commissioner's decisions a–h; Z157): applyInlineOptOut
      // below. The stream stays transactional and the mail is not moved to the
      // triggered batch-sender pipeline — that move is still not decided, and
      // nothing here depends on it.
      //
      // A soft-deleted contact (deleted_at set) gets nothing either: mail to
      // someone deleted is a send without consent (fixed rule of point 1). The
      // contact query filtered only by id and org, so it was mailed (Z152 MIMO
      // 1, measured); the template branch already dropped them, because
      // /internal/contacts/batch filters deleted_at. The second query runs only
      // when the first finds no one, so a deleted contact is told apart from
      // one with no address. Z153.
      //
      // The one exception: the flow's transactional exception (Michal, 14. 10.
      // 22:10, which overrides "every flow e-mail is marketing"; Z156). When the
      // job's run belongs to a flow started by a trigger of the closed list —
      // the order, the ticket, the change or cancellation of an event — and the
      // node that made the job is a send_email with priority 'transactional',
      // the API (flowTransactionalException, from the database; the job carries
      // only workflowRunId and nodeId) lets the mail through to a pending,
      // archived, unsubscribed, complained or non_subscribed contact
      // (FLOW_TRANSACTIONAL_LIFTED_STATUSES; pending and archived since Z158 —
      // Michal, 15. 10. 6:10, point 1b, which overrides the narrower reading of
      // Z156), and sends it with the default transactional purpose: an
      // 'unsubscribe' suppression row no longer stops it, but a complaint, a
      // hard bounce, an invalid address, 'manual', a block and the GDPR
      // fingerprint still do (mta-sender SUPPRESSES_TRANSACTIONAL). Bounced, a
      // deleted and an unknown contact still get nothing. The template branch
      // below has the same exception since Z158. Three points wait on Michal
      // and are unchanged: the complaint / manual / block rows, bounced, and
      // the soft-deleted contact. Personal e-mails, review requests and
      // sequence steps carry no nodeId and so never get it.
      if (body.html) {
        const [contact] = await db
          .select({ email: contacts.email, status: contacts.status })
          .from(contacts)
          .where(
            and(
              eq(contacts.id, body.contactId),
              eq(contacts.orgId, body.orgId),
              isNull(contacts.deletedAt),
            ),
          )
          .limit(1);
        if (!contact) {
          const [deleted] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(and(eq(contacts.id, body.contactId), eq(contacts.orgId, body.orgId)))
            .limit(1);
          if (deleted) return reply.send({ data: { skipped: true, reason: 'contact deleted' } });
        }
        if (!contact?.email)
          return reply.send({ data: { skipped: true, reason: 'no contact email' } });
        const transactional = await flowTransactionalException(
          body.orgId,
          body.workflowRunId,
          body.nodeId,
        );
        // refusesFlowMarketing is never read under the exception (Z166).
        const refused = transactional
          ? refusesMarketing(contact.status) && !liftedByFlowTransactional(contact.status)
          : body.workflowRunId
            ? refusesFlowMarketing(contact.status)
            : refusesMarketing(contact.status);
        if (refused)
          return reply.send({
            data: { skipped: true, reason: `contact status ${contact.status}` },
          });
        const from = await resolveOrgFrom(body.orgId);
        if (!from) return reply.send({ data: { skipped: true, reason: 'no from address' } });
        // What § 7(4) of 480/2004 asks of a commercial message, added by the
        // system (Michal, 14. 10. 22:10, point 2; Z157). Marketing — every
        // inline mail sent as 'workflow_marketing' (decision a) — gets the
        // Czech footer with the sender and an unsubscribe link, and
        // List-Unsubscribe / List-Unsubscribe-Post. The transactional
        // exception gets neither (decision b), but in every inline mail the
        // {{unsubscribe}} / {{unsubscribe_url}} tags become the working link
        // (decision c). Who receives the mail is decided above and is not
        // changed by this.
        const optOut = await applyInlineOptOut({
          orgId: body.orgId,
          contactId: body.contactId,
          html: body.html,
          text: body.text,
          marketing: !transactional,
        });
        const messageId = await sendTransactionalEmail(
          {
            to: contact.email,
            from: from.fromEmail,
            fromName: from.fromName,
            subject: body.subject ?? '',
            html: optOut.html,
            text: optOut.text,
            orgId: body.orgId,
            contactId: body.contactId,
            customHeaders: optOut.customHeaders,
          },
          // With the exception: the default transactional purpose (see above).
          transactional ? undefined : { purpose: 'workflow_marketing' },
        );
        return reply.send({ data: { queued: true, messageId } });
      }

      let content: Record<string, unknown>;
      let subject: string;
      let preheader: string | undefined;
      let fromName: string;
      let fromEmail: string;
      let replyTo: string | undefined;
      let locale: 'en' | 'cs' | 'sk';
      // The flow's transactional exception on the template branch (Z158 —
      // Michal, 15. 10. 6:10, point 1b: the ticket, the order and the change
      // of an event reach the recipient whichever kind of node sends them).
      // Decided by the same flowTransactionalException, from the database,
      // after the template is loaded; never from the job. A campaign-content
      // node is not given it.
      let flowTransactional = false;

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
        flowTransactional = await flowTransactionalException(
          body.orgId,
          body.workflowRunId,
          body.nodeId,
        );
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
        // Says so, so the batch sender does not write the org id into the
        // unsubscribe token as the email's campaign (BatchSenderJobData).
        campaignIsPlaceholder: !body.campaignId,
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
        // Set only here, only from flowTransactionalException above (Z158).
        // batch-sender then lets a status of FLOW_TRANSACTIONAL_LIFTED_STATUSES
        // through and checks only the transactional suppression reasons; the
        // stream, the render and the footer stay those of the triggered stream.
        // Every other job of this branch is a flow's marketing node, and says so:
        // batch-sender then refuses FLOW_MARKETING_REFUSED_CONTACT_STATUSES,
        // non_subscribed included (Michal, 14. 10. 22:10, point 3; Z166).
        ...(flowTransactional ? { flowTransactional: true } : { flowMarketing: true }),
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

      // The flow's transactional exception (Michal, 14. 10. 22:10; Z156):
      // decided here from the database — the run's flow starts on a trigger of
      // the closed list and node `nodeId` is a send_sms with priority
      // 'transactional' — and handed to routedSmsSend, whose contact-state gate
      // then lets a pending, archived, unsubscribed or complained contact
      // through (pending and archived since Z158 — Michal, 15. 10. 6:10,
      // point 1b; FLOW_TRANSACTIONAL_LIFTED_STATUSES). Only for a
      // flow's own job (workflowRunId), never for a campaign; without nodeId
      // (a review request, an older job) it is false and no query runs.
      const flowTransactional =
        !!body.workflowRunId &&
        !body.campaignId &&
        (await flowTransactionalException(body.orgId, body.workflowRunId, body.nodeId));

      try {
        const result = await routedSmsSend(
          body.orgId,
          {
            channel: 'sms',
            orgId: body.orgId,
            content: { kind: 'sms', body: body.message },
            ...(body.campaignId ? { campaignId: body.campaignId } : {}),
            ...(body.workflowId ? { workflowId: body.workflowId } : {}),
            ...(body.workflowRunId ? { workflowRunId: body.workflowRunId } : {}),
            ...(flowTransactional ? { flowTransactional: true } : {}),
          },
          { contactId: body.contactId, phone: body.phone },
        );
        return reply.send({ data: { messageId: result.messageId, status: result.status } });
      } catch (err) {
        // The code says which gate stopped it (CONTACT_UNAVAILABLE /
        // CONSENT_PENDING / MARKETING_REFUSED, Z155); the status is unchanged.
        const code = (err as { code?: unknown }).code;
        return reply.status(502).send({
          error: (err as Error).message,
          ...(typeof code === 'string' ? { code } : {}),
        });
      }
    },
  );
}
