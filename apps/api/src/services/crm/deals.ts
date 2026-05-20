import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals, dealStageHistory, accounts, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { getPipeline, stageFromPipeline } from './pipelines.js';
import { onApiEvent } from '../workflows/triggers.js';

type DealInsert = typeof deals.$inferInsert;
type Deal = typeof deals.$inferSelect;

async function validateLinkedRecords(
  orgId: string,
  input: { contactId?: string | null; accountId?: string | null },
) {
  if (input.contactId) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.orgId, orgId),
          isNull(contacts.deletedAt),
        ),
      );
    if (!c) throw AppError.badRequest('Contact not found');
  }
  if (input.accountId) {
    const [a] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, input.accountId),
          eq(accounts.orgId, orgId),
          isNull(accounts.deletedAt),
        ),
      );
    if (!a) throw AppError.badRequest('Account not found');
  }
}

export async function createDeal(
  orgId: string,
  input: {
    pipelineId: string;
    stageId?: string;
    name: string;
    description?: string;
    contactId?: string | null;
    accountId?: string | null;
    value?: number | string;
    currency?: string;
    expectedCloseDate?: Date | null;
    ownerUserId?: string | null;
    source?: string | null;
    customFields?: Record<string, unknown> | null;
  },
) {
  const pipeline = await getPipeline(orgId, input.pipelineId);
  if (pipeline.stages.length === 0) throw AppError.badRequest('Pipeline has no stages');

  // Default to the first (lowest-probability non-closed) stage
  const openStages = pipeline.stages.filter((s) => s.probability > 0 && s.probability < 100);
  const firstStage = openStages.sort((a, b) => a.order - b.order)[0] ?? pipeline.stages[0]!;
  const stageId = input.stageId ?? firstStage.id;

  const stage = stageFromPipeline(pipeline, stageId);
  if (!stage) throw AppError.badRequest('Stage does not belong to this pipeline');

  await validateLinkedRecords(orgId, input);

  const values: DealInsert = {
    orgId,
    pipelineId: input.pipelineId,
    stageId,
    name: input.name,
    description: input.description ?? null,
    contactId: input.contactId ?? null,
    accountId: input.accountId ?? null,
    value: typeof input.value === 'number' ? String(input.value) : (input.value ?? '0'),
    currency: input.currency ?? 'USD',
    expectedCloseDate: input.expectedCloseDate ?? null,
    ownerUserId: input.ownerUserId ?? null,
    source: input.source ?? null,
    customFields: input.customFields ?? null,
  };

  const [row] = await db.insert(deals).values(values).returning();
  const deal = row!;

  await db.insert(dealStageHistory).values({
    orgId,
    dealId: deal.id,
    fromStageId: null,
    toStageId: stageId,
  });

  if (deal.contactId) {
    await onApiEvent(orgId, deal.contactId, 'deal_created', {
      dealId: deal.id,
      value: Number(deal.value),
      stageId,
    });
  }
  return deal;
}

export async function getDeal(orgId: string, id: string): Promise<Deal> {
  const [row] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId), isNull(deals.deletedAt)));
  if (!row) throw AppError.notFound('Deal not found');
  return row;
}

export async function listDeals(
  orgId: string,
  opts: {
    pipelineId?: string;
    stageId?: string;
    status?: 'open' | 'won' | 'lost';
    contactId?: string;
    accountId?: string;
    ownerUserId?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  const conditions = [eq(deals.orgId, orgId), isNull(deals.deletedAt)];
  if (opts.pipelineId) conditions.push(eq(deals.pipelineId, opts.pipelineId));
  if (opts.stageId) conditions.push(eq(deals.stageId, opts.stageId));
  if (opts.status) conditions.push(eq(deals.status, opts.status));
  if (opts.contactId) conditions.push(eq(deals.contactId, opts.contactId));
  if (opts.accountId) conditions.push(eq(deals.accountId, opts.accountId));
  if (opts.ownerUserId) conditions.push(eq(deals.ownerUserId, opts.ownerUserId));
  if (opts.search) conditions.push(sql`${deals.name} ILIKE ${'%' + opts.search + '%'}`);

  return db
    .select()
    .from(deals)
    .where(and(...conditions))
    .orderBy(desc(deals.createdAt))
    .limit(opts.limit ?? 100);
}

export async function updateDeal(
  orgId: string,
  id: string,
  patch: {
    name?: string;
    description?: string;
    contactId?: string | null;
    accountId?: string | null;
    value?: number | string;
    currency?: string;
    expectedCloseDate?: Date | null;
    ownerUserId?: string | null;
    source?: string | null;
    customFields?: Record<string, unknown> | null;
  },
  changedByUserId?: string,
) {
  const existing = await getDeal(orgId, id);
  await validateLinkedRecords(orgId, { contactId: patch.contactId, accountId: patch.accountId });

  const update: Partial<DealInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.contactId !== undefined) update.contactId = patch.contactId;
  if (patch.accountId !== undefined) update.accountId = patch.accountId;
  if (patch.value !== undefined)
    update.value = typeof patch.value === 'number' ? String(patch.value) : patch.value;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.expectedCloseDate !== undefined) update.expectedCloseDate = patch.expectedCloseDate;
  if (patch.ownerUserId !== undefined) update.ownerUserId = patch.ownerUserId;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.customFields !== undefined) update.customFields = patch.customFields;

  const [row] = await db
    .update(deals)
    .set(update)
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .returning();

  void existing;
  void changedByUserId;
  return row!;
}

export async function moveDealToStage(
  orgId: string,
  id: string,
  newStageId: string,
  changedByUserId?: string,
) {
  const deal = await getDeal(orgId, id);
  if (deal.status !== 'open') throw AppError.badRequest('Cannot move a closed deal');
  if (deal.stageId === newStageId) return deal;

  const pipeline = await getPipeline(orgId, deal.pipelineId);
  const newStage = stageFromPipeline(pipeline, newStageId);
  if (!newStage) throw AppError.badRequest('Stage does not belong to this pipeline');

  const durationSeconds = Math.floor((Date.now() - deal.stageChangedAt.getTime()) / 1000);

  await db.insert(dealStageHistory).values({
    orgId,
    dealId: id,
    fromStageId: deal.stageId,
    toStageId: newStageId,
    durationSeconds,
    changedByUserId: changedByUserId ?? null,
  });

  const now = new Date();
  const [updated] = await db
    .update(deals)
    .set({ stageId: newStageId, stageChangedAt: now, updatedAt: now })
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .returning();

  if (updated!.contactId) {
    await onApiEvent(orgId, updated!.contactId, 'deal_stage_changed', {
      dealId: id,
      fromStageId: deal.stageId,
      toStageId: newStageId,
      probability: newStage.probability,
    });
  }

  return updated!;
}

export async function markDealWon(
  orgId: string,
  id: string,
  closeDate?: Date,
  changedByUserId?: string,
) {
  const deal = await getDeal(orgId, id);
  if (deal.status !== 'open') throw AppError.badRequest('Deal is already closed');

  const now = closeDate ?? new Date();
  const [updated] = await db
    .update(deals)
    .set({ status: 'won', actualCloseDate: now, updatedAt: new Date() })
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .returning();

  if (updated!.contactId) {
    await onApiEvent(orgId, updated!.contactId, 'deal_won', {
      dealId: id,
      value: Number(updated!.value),
    });
  }
  void changedByUserId;
  return updated!;
}

export async function markDealLost(
  orgId: string,
  id: string,
  reason: string,
  closeDate?: Date,
  changedByUserId?: string,
) {
  const deal = await getDeal(orgId, id);
  if (deal.status !== 'open') throw AppError.badRequest('Deal is already closed');

  const now = closeDate ?? new Date();
  const [updated] = await db
    .update(deals)
    .set({ status: 'lost', lostReason: reason, actualCloseDate: now, updatedAt: new Date() })
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .returning();

  if (updated!.contactId) {
    await onApiEvent(orgId, updated!.contactId, 'deal_lost', { dealId: id, reason });
  }
  void changedByUserId;
  return updated!;
}

export async function deleteDeal(orgId: string, id: string) {
  await getDeal(orgId, id);
  await db
    .update(deals)
    .set({ deletedAt: new Date() })
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)));
}

export async function dealStageHistoryForDeal(orgId: string, dealId: string) {
  await getDeal(orgId, dealId);
  return db
    .select()
    .from(dealStageHistory)
    .where(and(eq(dealStageHistory.dealId, dealId), eq(dealStageHistory.orgId, orgId)))
    .orderBy(dealStageHistory.changedAt);
}
