import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  salesSequences,
  sequenceEnrollments,
  sequenceStepLogs,
  contacts,
  type SalesSequence,
  type SequenceEnrollment,
  type SequenceStep,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { buildMergeVars, substitutePersonalMergeTags, buildPersonalHtml } from './one-to-one-email.js';

// ─── Sequence CRUD ────────────────────────────────────────────────────────────

export async function createSequence(orgId: string, input: {
  name: string;
  description?: string;
  steps?: SequenceStep[];
  exitOnReply?: boolean;
  exitOnUnsubscribe?: boolean;
}): Promise<SalesSequence> {
  const [row] = await db.insert(salesSequences).values({
    orgId,
    name: input.name,
    description: input.description ?? null,
    steps: input.steps ?? [],
    exitOnReply: input.exitOnReply ?? true,
    exitOnUnsubscribe: input.exitOnUnsubscribe ?? true,
  }).returning();
  return row!;
}

export async function getSequence(orgId: string, id: string): Promise<SalesSequence> {
  const [row] = await db.select().from(salesSequences)
    .where(and(eq(salesSequences.id, id), eq(salesSequences.orgId, orgId), isNull(salesSequences.deletedAt)));
  if (!row) throw AppError.notFound('Sequence not found');
  return row;
}

export async function listSequences(orgId: string): Promise<SalesSequence[]> {
  return db.select().from(salesSequences)
    .where(and(eq(salesSequences.orgId, orgId), isNull(salesSequences.deletedAt)))
    .orderBy(desc(salesSequences.createdAt));
}

export async function updateSequence(orgId: string, id: string, patch: {
  name?: string;
  description?: string;
  steps?: SequenceStep[];
  exitOnReply?: boolean;
  exitOnUnsubscribe?: boolean;
  active?: boolean;
}): Promise<SalesSequence> {
  await getSequence(orgId, id);
  const update: Partial<typeof salesSequences.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.steps !== undefined) update.steps = patch.steps;
  if (patch.exitOnReply !== undefined) update.exitOnReply = patch.exitOnReply;
  if (patch.exitOnUnsubscribe !== undefined) update.exitOnUnsubscribe = patch.exitOnUnsubscribe;
  if (patch.active !== undefined) update.active = patch.active;

  const [row] = await db.update(salesSequences).set(update)
    .where(and(eq(salesSequences.id, id), eq(salesSequences.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteSequence(orgId: string, id: string): Promise<void> {
  await getSequence(orgId, id);
  await db.update(salesSequences).set({ deletedAt: new Date() })
    .where(and(eq(salesSequences.id, id), eq(salesSequences.orgId, orgId)));
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

export async function enrollContact(orgId: string, input: {
  sequenceId: string;
  contactId: string;
  dealId?: string | null;
  enrolledByUserId?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
}): Promise<SequenceEnrollment> {
  const seq = await getSequence(orgId, input.sequenceId);
  if (!seq.active) throw AppError.badRequest('Sequence is not active');
  if (seq.steps.length === 0) throw AppError.badRequest('Sequence has no steps');

  // Upsert — if already enrolled reuse the existing row
  const existing = await db.select().from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.sequenceId, input.sequenceId),
      eq(sequenceEnrollments.contactId, input.contactId),
    )).limit(1);

  if (existing.length > 0) {
    if (existing[0]!.status === 'active') throw AppError.conflict('Contact is already enrolled in this sequence');
    // Re-enroll: reset from the beginning
    const [row] = await db.update(sequenceEnrollments)
      .set({
        status: 'active',
        currentStepIndex: 0,
        nextStepAt: new Date(), // execute first step immediately
        completedAt: null,
        updatedAt: new Date(),
        senderEmail: input.senderEmail ?? null,
        senderName: input.senderName ?? null,
      })
      .where(eq(sequenceEnrollments.id, existing[0]!.id))
      .returning();
    return row!;
  }

  const [row] = await db.insert(sequenceEnrollments).values({
    orgId,
    sequenceId: input.sequenceId,
    contactId: input.contactId,
    dealId: input.dealId ?? null,
    enrolledByUserId: input.enrolledByUserId ?? null,
    senderEmail: input.senderEmail ?? null,
    senderName: input.senderName ?? null,
    nextStepAt: new Date(), // first step is due immediately
  }).returning();
  return row!;
}

export async function unenrollContact(orgId: string, enrollmentId: string, reason: SequenceEnrollment['status'] = 'cancelled'): Promise<void> {
  await db.update(sequenceEnrollments)
    .set({ status: reason, updatedAt: new Date() })
    .where(and(eq(sequenceEnrollments.id, enrollmentId), eq(sequenceEnrollments.orgId, orgId)));
}

export async function listEnrollments(orgId: string, opts: {
  contactId?: string;
  sequenceId?: string;
  status?: SequenceEnrollment['status'];
  limit?: number;
} = {}): Promise<SequenceEnrollment[]> {
  const conditions = [eq(sequenceEnrollments.orgId, orgId)];
  if (opts.contactId) conditions.push(eq(sequenceEnrollments.contactId, opts.contactId));
  if (opts.sequenceId) conditions.push(eq(sequenceEnrollments.sequenceId, opts.sequenceId));
  if (opts.status) conditions.push(eq(sequenceEnrollments.status, opts.status));

  return db.select().from(sequenceEnrollments)
    .where(and(...conditions))
    .orderBy(desc(sequenceEnrollments.createdAt))
    .limit(opts.limit ?? 100);
}

// ─── Step execution ───────────────────────────────────────────────────────────

/**
 * Execute all due enrollment steps across all orgs (called by periodic job).
 */
export async function processDueSequenceSteps(opts: { limit?: number } = {}): Promise<{ processed: number }> {
  const due = await db.select().from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.status, 'active'),
      lte(sequenceEnrollments.nextStepAt, new Date()),
    ))
    .limit(opts.limit ?? 200);

  let processed = 0;
  for (const enrollment of due) {
    try {
      await executeNextStep(enrollment);
      processed++;
    } catch {
      // Continue processing others
    }
  }
  return { processed };
}

async function executeNextStep(enrollment: SequenceEnrollment): Promise<void> {
  const seq = await db.select().from(salesSequences)
    .where(eq(salesSequences.id, enrollment.sequenceId)).limit(1).then(r => r[0]);
  if (!seq || !seq.active) {
    await unenrollContact(enrollment.orgId, enrollment.id, 'cancelled');
    return;
  }

  const steps = seq.steps as SequenceStep[];
  const stepIndex = enrollment.currentStepIndex;

  // Sequence complete
  if (stepIndex >= steps.length) {
    await db.update(sequenceEnrollments)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(sequenceEnrollments.id, enrollment.id));
    return;
  }

  const step = steps[stepIndex]!;

  // Fetch contact data for merge tags
  const [contact] = await db.select().from(contacts)
    .where(eq(contacts.id, enrollment.contactId)).limit(1);

  await runStep(step, enrollment, contact ?? null);

  await db.insert(sequenceStepLogs).values({
    orgId: enrollment.orgId,
    enrollmentId: enrollment.id,
    sequenceId: enrollment.sequenceId,
    contactId: enrollment.contactId,
    stepIndex,
    stepType: step.type as SequenceStep['type'],
    result: { executed: true },
  });

  // Schedule next step
  const nextIndex = stepIndex + 1;
  const nextStep = steps[nextIndex];
  const nextStepAt = nextStep
    ? new Date(Date.now() + (nextStep.delayDays ?? 1) * 86_400_000)
    : null;

  await db.update(sequenceEnrollments)
    .set({
      currentStepIndex: nextIndex,
      nextStepAt: nextStepAt,
      status: nextStep ? 'active' : 'completed',
      completedAt: nextStep ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sequenceEnrollments.id, enrollment.id));
}

async function runStep(
  step: SequenceStep,
  enrollment: SequenceEnrollment,
  contact: typeof contacts.$inferSelect | null,
): Promise<void> {
  const config = step.config as Record<string, string>;

  switch (step.type) {
    case 'email':
    case 'personal_email': {
      const vars = buildMergeVars(contact ?? {});
      const fromEmail = enrollment.senderEmail ?? config.fromEmail ?? '';
      const fromName = enrollment.senderName ?? config.fromName ?? '';
      const subject = substitutePersonalMergeTags(config.subject ?? '', vars);
      const bodyText = substitutePersonalMergeTags(config.body ?? '', vars);
      const bodyHtml = buildPersonalHtml(bodyText);

      // Queue via BullMQ
      const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
      if (queues) {
        await (queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>)
          .email?.add('sequence-email', {
            orgId: enrollment.orgId,
            contactId: enrollment.contactId,
            sequenceEnrollmentId: enrollment.id,
            fromEmail,
            fromName,
            replyTo: fromEmail,
            subject,
            bodyText,
            bodyHtml,
            isPersonal: true,
          }).catch(() => {});
      }
      break;
    }

    case 'sms': {
      const vars = buildMergeVars(contact ?? {});
      const message = substitutePersonalMergeTags(config.message ?? '', vars);
      const { queues } = await import('../../lib/queues.js').catch(() => ({ queues: null }));
      if (queues && contact?.phone) {
        await (queues as unknown as Record<string, { add: (name: string, data: unknown) => Promise<void> }>)
          .sms?.add('sequence-sms', {
            orgId: enrollment.orgId,
            contactId: enrollment.contactId,
            phone: contact.phone,
            message,
          }).catch(() => {});
      }
      break;
    }

    case 'task':
    case 'linkedin': {
      const { createTask } = await import('./tasks.js');
      await createTask(enrollment.orgId, {
        type: step.type === 'linkedin' ? 'todo' : (config.taskType as 'call' | 'email' | 'meeting' | 'todo' ?? 'todo'),
        title: config.title ?? (step.type === 'linkedin' ? 'LinkedIn touch' : 'Follow up'),
        contactId: enrollment.contactId,
        dealId: enrollment.dealId ?? null,
        dueAt: new Date(Date.now() + 86_400_000), // due tomorrow
      }).catch(() => {});
      break;
    }

    case 'wait':
      // Wait steps are handled by the delay in nextStepAt scheduling; no action needed
      break;
  }
}
