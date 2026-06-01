/**
 * Send-after-conversion suppression (§9 P1).
 *
 * Once a workflow run's contact has converted — typically a purchase
 * event, or any custom event declared by the workflow's owner — the
 * remaining send actions in that run skip silently. This stops cart-
 * abandonment flows from emailing customers who already bought, and
 * generally protects against "we already won this customer, stop
 * pestering them" footguns.
 *
 * Two layers:
 *   1. `run.converted` is set by the existing Goal node. Send actions
 *      gate on it via `shouldSuppressDueToConversion(run)`.
 *   2. For workflows without a Goal node, a direct lookup against
 *      workflow_events lets ad-hoc workflows opt into suppression by
 *      passing the event name via the workflow's `triggerConfig`
 *      (`suppressOnEvent`).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflowEvents } from '../../db/schema/index.js';
import type { WorkflowRun } from '../../db/schema/workflows.js';

/**
 * Cheap, in-memory check the send actions can run on every node visit.
 * Goal nodes flip `converted` so this stays O(1) for the common path.
 */
export function shouldSuppressDueToConversion(run: WorkflowRun): boolean {
  return run.converted === true;
}

/**
 * Optional DB check for workflows without a Goal node. Looks for ANY
 * occurrence of the named event for this contact after the run's
 * `startedAt` timestamp.
 */
export async function hasContactConverted(opts: {
  orgId: string;
  contactId: string | null;
  eventName: string;
  since: Date;
}): Promise<boolean> {
  if (!opts.contactId) return false;
  const [row] = await db
    .select({ id: workflowEvents.id })
    .from(workflowEvents)
    .where(
      and(
        eq(workflowEvents.orgId, opts.orgId),
        eq(workflowEvents.contactId, opts.contactId),
        eq(workflowEvents.eventName, opts.eventName),
        sql`${workflowEvents.createdAt} >= ${opts.since}`,
      ),
    )
    .limit(1);
  return !!row;
}
