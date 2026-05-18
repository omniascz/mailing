/**
 * Activity feed — aggregates chronological events per contact from multiple sources:
 *   - email_events (send/open/click/bounce/unsubscribe)
 *   - sms_send_log (SMS sent, delivery status)
 *   - deal_stage_history (pipeline moves, won, lost)
 *   - crm_notes (notes added)
 *   - crm_tasks (tasks created/completed)
 *   - workflow_events (custom api events)
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  emailEvents,
  smsSendLog,
  dealStageHistory,
  deals,
  workflowEvents,
  crmNotes,
  crmTasks,
} from '../../db/schema/index.js';

export interface ActivityItem {
  id: string;
  type:
    | 'email_sent' | 'email_open' | 'email_click' | 'email_bounce' | 'email_unsubscribe'
    | 'sms_sent' | 'sms_delivered' | 'sms_failed'
    | 'deal_created' | 'deal_stage_changed' | 'deal_won' | 'deal_lost'
    | 'note_added'
    | 'task_created' | 'task_completed'
    | 'custom_event';
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

export async function getContactActivityFeed(
  orgId: string,
  contactId: string,
  opts: {
    limit?: number;
    before?: Date;
    types?: ActivityItem['type'][];
  } = {},
): Promise<{ data: ActivityItem[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const before = opts.before ?? new Date();

  // Fetch from each source in parallel, then merge-sort
  const [emails, sms, stageHistory, dealRows, events, notes, tasks] = await Promise.all([
    // Email events
    db.select({
      id: emailEvents.id,
      eventType: emailEvents.eventType,
      occurredAt: emailEvents.createdAt,
      campaignId: emailEvents.campaignId,
      linkUrl: emailEvents.linkUrl,
    }).from(emailEvents).where(and(
      eq(emailEvents.orgId, orgId),
      eq(emailEvents.contactId, contactId),
      sql`${emailEvents.createdAt} < ${before}`,
    )).orderBy(desc(emailEvents.createdAt)).limit(limit),

    // SMS send log
    db.select({
      id: smsSendLog.id,
      status: smsSendLog.status,
      createdAt: smsSendLog.createdAt,
      phone: smsSendLog.phone,
    }).from(smsSendLog).where(and(
      eq(smsSendLog.orgId, orgId),
      eq(smsSendLog.contactId, contactId),
      sql`${smsSendLog.createdAt} < ${before}`,
    )).orderBy(desc(smsSendLog.createdAt)).limit(limit),

    // Deal stage history (for deals linked to this contact)
    db.select({
      id: dealStageHistory.id,
      dealId: dealStageHistory.dealId,
      fromStageId: dealStageHistory.fromStageId,
      toStageId: dealStageHistory.toStageId,
      changedAt: dealStageHistory.changedAt,
    }).from(dealStageHistory)
      .innerJoin(deals, eq(deals.id, dealStageHistory.dealId))
      .where(and(
        eq(dealStageHistory.orgId, orgId),
        eq(deals.contactId, contactId),
        sql`${dealStageHistory.changedAt} < ${before}`,
      )).orderBy(desc(dealStageHistory.changedAt)).limit(limit),

    // Deal status changes (won/lost)
    db.select({
      id: deals.id,
      name: deals.name,
      status: deals.status,
      value: deals.value,
      actualCloseDate: deals.actualCloseDate,
      createdAt: deals.createdAt,
    }).from(deals).where(and(
      eq(deals.orgId, orgId),
      eq(deals.contactId, contactId),
      isNull(deals.deletedAt),
    )).orderBy(desc(deals.createdAt)).limit(limit),

    // Custom events
    db.select({
      id: workflowEvents.id,
      eventName: workflowEvents.eventName,
      properties: workflowEvents.properties,
      createdAt: workflowEvents.createdAt,
    }).from(workflowEvents).where(and(
      eq(workflowEvents.orgId, orgId),
      eq(workflowEvents.contactId, contactId),
      sql`${workflowEvents.createdAt} < ${before}`,
    )).orderBy(desc(workflowEvents.createdAt)).limit(limit),

    // Notes
    db.select({
      id: crmNotes.id,
      body: crmNotes.body,
      authorUserId: crmNotes.authorUserId,
      createdAt: crmNotes.createdAt,
    }).from(crmNotes).where(and(
      eq(crmNotes.orgId, orgId),
      eq(crmNotes.contactId, contactId),
      isNull(crmNotes.deletedAt),
      sql`${crmNotes.createdAt} < ${before}`,
    )).orderBy(desc(crmNotes.createdAt)).limit(limit),

    // Tasks
    db.select({
      id: crmTasks.id,
      title: crmTasks.title,
      type: crmTasks.type,
      status: crmTasks.status,
      assignedUserId: crmTasks.assignedUserId,
      completedAt: crmTasks.completedAt,
      createdAt: crmTasks.createdAt,
    }).from(crmTasks).where(and(
      eq(crmTasks.orgId, orgId),
      eq(crmTasks.contactId, contactId),
      isNull(crmTasks.deletedAt),
      sql`${crmTasks.createdAt} < ${before}`,
    )).orderBy(desc(crmTasks.createdAt)).limit(limit),
  ]);

  const items: ActivityItem[] = [];

  // Map email events
  for (const e of emails) {
    const typeMap: Record<string, ActivityItem['type']> = {
      sent: 'email_sent',
      open: 'email_open',
      click: 'email_click',
      bounce: 'email_bounce',
      unsubscribe: 'email_unsubscribe',
    };
    const mappedType = typeMap[e.eventType] ?? 'email_sent';
    if (opts.types && !opts.types.includes(mappedType)) continue;
    items.push({
      id: `email_event:${e.id}`,
      type: mappedType,
      occurredAt: e.occurredAt,
      metadata: { campaignId: e.campaignId, url: e.linkUrl },
    });
  }

  // Map SMS
  for (const s of sms) {
    const typeMap: Record<string, ActivityItem['type']> = {
      sent: 'sms_sent',
      delivered: 'sms_delivered',
      failed: 'sms_failed',
      queued: 'sms_sent',
    };
    const mappedType = typeMap[String(s.status)] ?? 'sms_sent';
    if (opts.types && !opts.types.includes(mappedType)) continue;
    items.push({
      id: `sms:${s.id}`,
      type: mappedType,
      occurredAt: s.createdAt,
      metadata: { phone: s.phone },
    });
  }

  // Map deal stage history
  for (const h of stageHistory) {
    const t: ActivityItem['type'] = h.fromStageId === null ? 'deal_created' : 'deal_stage_changed';
    if (opts.types && !opts.types.includes(t)) continue;
    items.push({
      id: `deal_history:${h.id}`,
      type: t,
      occurredAt: h.changedAt,
      metadata: { dealId: h.dealId, fromStageId: h.fromStageId, toStageId: h.toStageId },
    });
  }

  // Map deal won/lost
  for (const d of dealRows) {
    if (d.status === 'won' && d.actualCloseDate) {
      if (!opts.types || opts.types.includes('deal_won')) {
        items.push({
          id: `deal_won:${d.id}`,
          type: 'deal_won',
          occurredAt: d.actualCloseDate,
          metadata: { dealId: d.id, dealName: d.name, value: Number(d.value) },
        });
      }
    } else if (d.status === 'lost' && d.actualCloseDate) {
      if (!opts.types || opts.types.includes('deal_lost')) {
        items.push({
          id: `deal_lost:${d.id}`,
          type: 'deal_lost',
          occurredAt: d.actualCloseDate,
          metadata: { dealId: d.id, dealName: d.name, value: Number(d.value) },
        });
      }
    }
  }

  // Map custom events
  for (const e of events) {
    if (opts.types && !opts.types.includes('custom_event')) continue;
    items.push({
      id: `event:${e.id}`,
      type: 'custom_event',
      occurredAt: e.createdAt,
      metadata: { eventName: e.eventName, ...((e.properties as Record<string, unknown>) ?? {}) },
    });
  }

  // Map notes
  for (const n of notes) {
    if (opts.types && !opts.types.includes('note_added')) continue;
    items.push({
      id: `note:${n.id}`,
      type: 'note_added',
      occurredAt: n.createdAt,
      metadata: { noteId: n.id, body: n.body.slice(0, 200), authorUserId: n.authorUserId },
    });
  }

  // Map tasks
  for (const t of tasks) {
    if (t.completedAt && (!opts.types || opts.types.includes('task_completed'))) {
      items.push({
        id: `task_completed:${t.id}`,
        type: 'task_completed',
        occurredAt: t.completedAt,
        metadata: { taskId: t.id, title: t.title, type: t.type },
      });
    }
    if (!opts.types || opts.types.includes('task_created')) {
      items.push({
        id: `task_created:${t.id}`,
        type: 'task_created',
        occurredAt: t.createdAt,
        metadata: { taskId: t.id, title: t.title, type: t.type, assignedUserId: t.assignedUserId },
      });
    }
  }

  // Sort descending by occurredAt
  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const hasMore = items.length > limit;
  return { data: items.slice(0, limit), hasMore };
}
