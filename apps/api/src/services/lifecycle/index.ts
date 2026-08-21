/**
 * Lifecycle-stage service (#317/#394).
 *
 * Wraps the pure transition rules with DB writes + workflow event emission.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, lifecycleStageHistory } from '../../db/schema/contacts.js';
import { AppError } from '../../lib/app-error.js';
import { canTransition, isLifecycleStage, type LifecycleStage } from './pure.js';

export { type LifecycleStage } from './pure.js';

export interface TransitionOptions {
  allowDowngrade?: boolean;
  changedBy?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Move a contact to a new lifecycle stage. Records a transition row in
 * lifecycle_stage_history and fires the `lifecycle_stage_changed` workflow
 * event so automations can react.
 */
export async function transitionStage(
  orgId: string,
  contactId: string,
  toStage: LifecycleStage,
  opts: TransitionOptions = {},
): Promise<{ fromStage: LifecycleStage; toStage: LifecycleStage }> {
  if (!isLifecycleStage(toStage)) {
    throw AppError.badRequest(`Unknown lifecycle stage: ${String(toStage)}`);
  }

  const [contact] = await db
    .select({ id: contacts.id, stage: contacts.lifecycleStage })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact');

  const fromStage = contact.stage as LifecycleStage;
  if (
    !canTransition(fromStage, toStage, {
      ...(opts.allowDowngrade != null ? { allowDowngrade: opts.allowDowngrade } : {}),
    })
  ) {
    throw AppError.badRequest(
      `Disallowed lifecycle transition ${fromStage} → ${toStage}` +
        (opts.allowDowngrade ? '' : ' (pass allowDowngrade to force)'),
    );
  }

  const now = new Date();
  await db
    .update(contacts)
    .set({
      lifecycleStage: toStage,
      lifecycleStageEnteredAt: now,
      updatedAt: now,
    })
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));

  await db.insert(lifecycleStageHistory).values({
    orgId,
    contactId,
    fromStage,
    toStage,
    ...(opts.changedBy ? { changedBy: opts.changedBy } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  });

  // Fire workflow event (dynamic import avoids circular deps with workflows)
  //
  // Two channels on purpose: `api_event` is the generic event bus that 29
  // other call sites feed, and `lifecycle_stage_changed` is the dedicated
  // trigger type. Before this, only the api_event went out, so a workflow
  // built on the dedicated trigger could be activated and never ran.
  try {
    const { onApiEvent, onLifecycleStageChanged } = await import('../workflows/triggers.js');
    await onApiEvent(orgId, contactId, 'lifecycle_stage_changed', {
      fromStage,
      toStage,
      reason: opts.reason,
    });
    await onLifecycleStageChanged(orgId, contactId, fromStage, toStage);
  } catch {
    // non-fatal — the stage change is persisted regardless
  }

  return { fromStage, toStage };
}

export async function getHistory(orgId: string, contactId: string, limit = 50) {
  return db
    .select()
    .from(lifecycleStageHistory)
    .where(
      and(eq(lifecycleStageHistory.orgId, orgId), eq(lifecycleStageHistory.contactId, contactId)),
    )
    .orderBy(desc(lifecycleStageHistory.occurredAt))
    .limit(limit);
}
