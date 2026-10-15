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
 * The commissioner's narrowest reading, written down 15. 10.:
 *  - the exception lifts ONLY unsubscribed, complained and non_subscribed
 *    (FLOW_TRANSACTIONAL_LIFTED_STATUSES in @forgemsg/shared); pending,
 *    archived, bounced, deleted and unknown contacts get nothing even with it;
 *  - ONLY send_sms and send_email with inline HTML have it. The template
 *    branch of a flow e-mail (batch-sender), WhatsApp, push and review
 *    requests do not;
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
 *    reschedule / venue change" in ingest.ts).
 *
 * Deliberately NOT here:
 *  - trigger type 'purchase_event': it is started by every e-commerce
 *    `orders/create` / `orders/updated` webhook (ecommerce/index.ts
 *    ingestOrder → onOrderPlaced), whatever the order's payment status
 *    (Shopify financial_status 'pending', 'refunded', 'voided' all start it),
 *    so it is not "an order was paid";
 *  - every other `ticketing.*` event (cart_abandoned, event_attended,
 *    waitlist_freed, lottery_won, subscription_past_due, fill_the_house_offer,
 *    discover_digest, order_refunded): offers, reminders to buy and reviews,
 *    i.e. marketing;
 *  - a flow with no eventName, which starts on every api_event.
 *
 * The names are the trigger's own eventName, matched exactly: the alias table
 * in triggers.ts (checkout_started ← cart_abandoned) touches none of them.
 */
export const TRANSACTIONAL_FLOW_TRIGGERS: readonly {
  triggerType: 'api_event';
  eventName: string;
}[] = [
  { triggerType: 'api_event', eventName: 'ticketing.order_paid' },
  { triggerType: 'api_event', eventName: 'ticketing.day_of_reminder' },
  { triggerType: 'api_event', eventName: 'ticketing.day_of_sms' },
  { triggerType: 'api_event', eventName: 'ticketing.event_changed' },
];

/** The node types that can carry the exception: the SMS and the e-mail node. */
const EXCEPTION_NODE_TYPES: readonly string[] = ['send_sms', 'send_email'];

/** Is a flow with this trigger on the closed list? */
export function isTransactionalFlowTrigger(
  triggerType: string,
  triggerConfig: Record<string, unknown> | null | undefined,
): boolean {
  const eventName = triggerConfig?.eventName;
  return TRANSACTIONAL_FLOW_TRIGGERS.some(
    (t) => t.triggerType === triggerType && t.eventName === eventName,
  );
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
 * Whether the e-mail has inline HTML (the template branch has no exception)
 * is the caller's to know; this answers for the node.
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
