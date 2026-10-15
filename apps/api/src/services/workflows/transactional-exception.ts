/**
 * The flow's transactional exception (Z156).
 *
 * Michal, 14. 10. 22:10 (overrides the earlier "ticketing flows are
 * marketing"): a flow node with priority 'transactional' reaches an
 * unsubscribed, complained or non_subscribed contact too — an opt-out does not
 * stop transactional mail — but ONLY when the flow is started by a genuinely
 * transactional event: an order, a ticket, a change or cancellation of an
 * event. A 'transactional' node on any other trigger is marketing. The GDPR
 * fingerprint and a hard bounce / invalid address still stop it.
 *
 * Michal, 15. 10. 6:10, point 1b — which overrides the commissioner's
 * narrower reading of Z156 (only unsubscribed and complained, only inline
 * HTML) — and Z158:
 *  - the exception lifts pending, archived, unsubscribed, complained and
 *    non_subscribed (FLOW_TRANSACTIONAL_LIFTED_STATUSES in @forgemsg/shared);
 *    bounced, deleted and unknown contacts get nothing even with it;
 *  - send_sms and send_email have it, the e-mail with inline HTML and from a
 *    template alike (the template branch through batch-sender, Z158).
 *    WhatsApp, push and review requests do not;
 *  - three points wait on Michal and stay as they are: the complaint /
 *    manual / block suppression rows still stop it, bounced is not lifted,
 *    a soft-deleted contact gets nothing;
 *  - the API decides it from the database — the run, its flow, the flow's
 *    trigger, the node and the node's priority — never from a flag in the job.
 *    The job carries only workflowRunId and nodeId;
 *  - the trigger list is closed and lives here, in one place.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflowRuns, workflows } from '../../db/schema/index.js';

/**
 * The triggers whose flows may send a transactional node past an opt-out.
 * Closed list — Michal, 14. 10. 22:10 — and every entry has a producer that
 * fires it only for a real order or ticket (Z156 probe 1: the two ingest
 * events measured by a real ingest, the cron read):
 *
 *  - api_event `ticketing.order_paid`: POST /api/v1/ticketing/events with
 *    type 'order_paid' — the ticketing app reporting a paid order
 *    (services/ticketing/ingest.ts fires `ticketing.${type}`);
 *  - api_event `ticketing.day_of_reminder` and `ticketing.day_of_sms`: the
 *    day-of cron (services/ticketing/cron.ts runDayOfTick), only for contacts
 *    with a 'purchased' attendance of an event about to start — the ticket;
 *  - api_event `ticketing.event_changed`: the ticketing app reporting a
 *    change of an event the contact bought. It is also the cancellation: the
 *    ingest has no separate cancel event ('event_changed' is "cancel /
 *    reschedule / venue change" in ingest.ts);
 *  - trigger type `purchase_event`, whatever its triggerConfig: every
 *    e-commerce order webhook (ecommerce/index.ts ingestOrder → onOrderPlaced).
 *    Michal, 15. 10. 19:40, point 1c a)+b) (Z163): the shop's informational
 *    e-mails in a flow — the order confirmation, shipped / delivered, the call
 *    to pay, the pickup code, the invoice — are transactional, and the
 *    confirmation is transactional for an unpaid order too. That removes the
 *    reason it was left out (it fires for an order whatever its payment
 *    status). The trigger alone makes nothing transactional: the node's
 *    priority decides, so the marketing nodes on purchase_event (a review
 *    request, cross-sell) stay marketing. Which shipped template nodes carry
 *    the priority is in workflow-templates/registry.ts; the flows already
 *    forked from them get it from migration 0038.
 *
 * Deliberately NOT here:
 *  - api_event `payment_pending`, `pickup_ready`, `order_shipped`: no code
 *    emits them, only POST /api/v1/events does, and a publishable key may call
 *    it. Michal, 15. 10. ~21:30, point 1d: first a 403 for the public key, then
 *    the list (Z164);
 *  - every other `ticketing.*` event (cart_abandoned, event_attended,
 *    waitlist_freed, lottery_won, subscription_past_due, fill_the_house_offer,
 *    discover_digest, order_refunded): offers, reminders to buy and reviews,
 *    i.e. marketing;
 *  - a flow with no eventName, which starts on every api_event.
 *
 * The api_event names are the trigger's own eventName, matched exactly: the
 * alias table in triggers.ts (checkout_started ← cart_abandoned) touches none
 * of them.
 */
export const TRANSACTIONAL_FLOW_TRIGGERS: readonly (
  | { triggerType: 'api_event'; eventName: string }
  | { triggerType: 'purchase_event' }
)[] = [
  { triggerType: 'api_event', eventName: 'ticketing.order_paid' },
  { triggerType: 'api_event', eventName: 'ticketing.day_of_reminder' },
  { triggerType: 'api_event', eventName: 'ticketing.day_of_sms' },
  { triggerType: 'api_event', eventName: 'ticketing.event_changed' },
  { triggerType: 'purchase_event' },
];

/** The node types that can carry the exception: the SMS and the e-mail node. */
const EXCEPTION_NODE_TYPES: readonly string[] = ['send_sms', 'send_email'];

/** Is a flow with this trigger on the closed list? */
export function isTransactionalFlowTrigger(
  triggerType: string,
  triggerConfig: Record<string, unknown> | null | undefined,
): boolean {
  const eventName = triggerConfig?.eventName;
  return TRANSACTIONAL_FLOW_TRIGGERS.some((t) => {
    if (t.triggerType !== triggerType) return false;
    // purchase_event is listed whatever its triggerConfig; api_event by its name.
    return t.triggerType === 'purchase_event' || t.eventName === eventName;
  });
}

/**
 * Does the flow's transactional exception hold for the message a job of this
 * run and node would send?
 *
 * True ONLY when the run belongs to `orgId`, its flow (same org) starts on a
 * trigger of TRANSACTIONAL_FLOW_TRIGGERS, and node `nodeId` of that flow is a
 * send_sms or send_email with `config.priority === 'transactional'`. Anything
 * missing — no nodeId, no run, a run of another org, no such node — is false,
 * i.e. the message is marketing. One query, and none at all without both ids.
 *
 * It answers for the node, whichever branch the e-mail takes: the inline
 * branch and, since Z158, the template branch both ask it.
 */
export async function flowTransactionalException(
  orgId: string,
  workflowRunId: string | null | undefined,
  nodeId: string | null | undefined,
): Promise<boolean> {
  if (!workflowRunId || !nodeId) return false;
  const [row] = await db
    .select({
      triggerType: workflows.triggerType,
      triggerConfig: workflows.triggerConfig,
      nodes: workflows.nodes,
    })
    .from(workflowRuns)
    .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.orgId, orgId),
        eq(workflows.orgId, orgId),
      ),
    )
    .limit(1);
  if (!row) return false;
  if (!isTransactionalFlowTrigger(row.triggerType, row.triggerConfig)) return false;
  const node = (Array.isArray(row.nodes) ? row.nodes : []).find((n) => n?.id === nodeId);
  if (!node || !EXCEPTION_NODE_TYPES.includes(node.type)) return false;
  const config = node.config as { priority?: unknown } | null | undefined;
  return config?.priority === 'transactional';
}
