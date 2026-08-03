/**
 * Bulk SMS / WhatsApp / Push campaign dispatch.
 *
 * The email pipeline (campaign-splitter → batch-sender → MTA) only handles
 * type='email'. Campaigns of type sms/whatsapp/push used to flip to 'sending'
 * and then do nothing — the enum promised a channel that never dispatched.
 *
 * This resolves the campaign audience (list + segment, minus an exclude
 * segment) and fans out one job per contact onto the SAME channel queues the
 * workflow "send X" actions already use, so the existing workers deliver them:
 *   - sms      → 'sms' queue (workflow-sms-sender → routedSmsSend, with consent)
 *   - whatsapp → 'whatsapp-send' queue (Meta Cloud API adapter)
 *   - push     → 'push-send' (web push) + 'mobile-push-send' (APNs/FCM)
 */

import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, contacts, segments, type Campaign } from '../../db/schema/index.js';
import { buildSegmentWhere } from '../segments/query-builder.js';
import { smsQueue, whatsappQueue, pushQueue, mobilePushQueue, PRIORITY } from '../../lib/queues.js';
import { setCampaignStatusInternal } from './dispatch.js';
import { AppError } from '../../lib/app-error.js';

export interface ChannelAudienceRow {
  id: string;
  phone: string | null;
}

export interface ChannelDispatchResult {
  channel: 'sms' | 'whatsapp' | 'push';
  audience: number;
  enqueued: number;
  skipped: number;
}

/** Build the WHERE predicate for a stored segment, or null if missing. */
async function segmentPredicate(orgId: string, segmentId: string): Promise<SQL | null> {
  const [seg] = await db
    .select({ conditions: segments.conditions })
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .limit(1);
  if (!seg) return null;
  return buildSegmentWhere(seg.conditions);
}

/**
 * Resolve a channel campaign's audience → contact id + phone rows. Applies
 * list membership AND/OR segment conditions, subtracts an exclude segment, and
 * drops marketing-ineligible statuses (archived / non_subscribed). Suppression
 * + per-recipient consent are enforced downstream (routedSmsSend compliance).
 */
export async function resolveChannelAudience(
  orgId: string,
  campaign: Pick<Campaign, 'listId' | 'segmentId' | 'excludeSegmentId'>,
): Promise<ChannelAudienceRow[]> {
  const conds: SQL[] = [
    eq(contacts.orgId, orgId),
    isNull(contacts.deletedAt),
    sql`${contacts.status} NOT IN ('archived', 'non_subscribed')`,
  ];

  let hasSource = false;
  if (campaign.listId) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM contact_lists cl WHERE cl.contact_id = ${contacts.id} AND cl.list_id = ${campaign.listId} AND cl.unsubscribed_at IS NULL)`,
    );
    hasSource = true;
  }
  if (campaign.segmentId) {
    const w = await segmentPredicate(orgId, campaign.segmentId);
    if (!w) return [];
    conds.push(w);
    hasSource = true;
  }
  if (!hasSource) return [];

  if (campaign.excludeSegmentId) {
    const ew = await segmentPredicate(orgId, campaign.excludeSegmentId);
    if (ew) conds.push(sql`NOT (${ew})`);
  }

  return db
    .select({ id: contacts.id, phone: contacts.phone })
    .from(contacts)
    .where(and(...conds));
}

// ── Content extraction (content is free-form jsonb per campaign type) ──────────

export function smsBody(campaign: Campaign): string | null {
  const c = (campaign.content ?? {}) as Record<string, unknown>;
  const body = (c.body ?? c.text ?? c.message ?? c.plainText ?? '') as string;
  return String(body).trim() || null;
}

export function whatsappContent(campaign: Campaign): {
  templateId?: string;
  language?: string;
  body?: string;
} {
  const c = (campaign.content ?? {}) as Record<string, unknown>;
  return {
    templateId: (c.templateId ?? c.templateName) as string | undefined,
    language: (c.language as string | undefined) ?? 'en',
    body: (c.body ?? c.text ?? c.message) as string | undefined,
  };
}

export function pushContent(campaign: Campaign): { title: string; body: string; url?: string } {
  const c = (campaign.content ?? {}) as Record<string, unknown>;
  return {
    title: String(c.title ?? campaign.subject ?? '').trim(),
    body: String(c.body ?? c.message ?? '').trim(),
    url: (c.url ?? c.actionUrl) as string | undefined,
  };
}

// ── Bulk enqueue helper ────────────────────────────────────────────────────────

export interface BulkJob {
  name: string;
  data: Record<string, unknown>;
  opts: { priority: number };
}

export async function addBulkChunked(
  queue: { addBulk: (jobs: BulkJob[]) => Promise<unknown> },
  jobs: BulkJob[],
  chunk = 1000,
): Promise<void> {
  for (let i = 0; i < jobs.length; i += chunk) {
    await queue.addBulk(jobs.slice(i, i + chunk));
  }
}

/**
 * Dispatch a channel (sms/whatsapp/push) campaign: resolve audience, fan out
 * per-contact jobs, mark the campaign sent, and record totalSent.
 */
export async function dispatchChannelCampaign(
  orgId: string,
  campaign: Campaign,
): Promise<ChannelDispatchResult> {
  const type = campaign.type as string;
  if (type !== 'sms' && type !== 'whatsapp' && type !== 'push') {
    throw AppError.badRequest(`dispatchChannelCampaign does not handle type '${type}'`);
  }

  const audience = await resolveChannelAudience(orgId, campaign);
  const prio = { priority: PRIORITY.CAMPAIGN };
  let enqueued = 0;
  let skipped = 0;

  if (type === 'sms') {
    const message = smsBody(campaign);
    if (!message) throw AppError.badRequest('SMS campaign has no message (set content.body)');
    const jobs: BulkJob[] = [];
    for (const r of audience) {
      if (!r.phone) {
        skipped++;
        continue;
      }
      jobs.push({
        name: `sms-${campaign.id}-${r.id}`,
        data: { orgId, contactId: r.id, phone: r.phone, message, campaignId: campaign.id },
        opts: prio,
      });
    }
    await addBulkChunked(smsQueue, jobs);
    enqueued = jobs.length;
  } else if (type === 'whatsapp') {
    const wa = whatsappContent(campaign);
    if (!wa.templateId && !wa.body) {
      throw AppError.badRequest('WhatsApp campaign needs content.templateId or content.body');
    }
    const jobs: BulkJob[] = [];
    for (const r of audience) {
      if (!r.phone) {
        skipped++;
        continue;
      }
      jobs.push({
        name: `wa-${campaign.id}-${r.id}`,
        data: {
          orgId,
          contactId: r.id,
          phone: r.phone,
          templateId: wa.templateId,
          language: wa.language,
          body: wa.body,
          campaignId: campaign.id,
        },
        opts: prio,
      });
    }
    await addBulkChunked(whatsappQueue, jobs);
    enqueued = jobs.length;
  } else {
    // push — fan out to BOTH web push and native mobile push.
    const p = pushContent(campaign);
    if (!p.title && !p.body) {
      throw AppError.badRequest('Push campaign needs content.title / content.body');
    }
    const webJobs: BulkJob[] = [];
    const mobileJobs: BulkJob[] = [];
    for (const r of audience) {
      const data = { orgId, contactId: r.id, title: p.title, body: p.body, url: p.url };
      webJobs.push({ name: `push-${campaign.id}-${r.id}`, data, opts: prio });
      mobileJobs.push({
        name: `mpush-${campaign.id}-${r.id}`,
        data: { ...data, campaignId: campaign.id },
        opts: prio,
      });
    }
    await addBulkChunked(pushQueue, webJobs);
    await addBulkChunked(mobilePushQueue, mobileJobs);
    enqueued = webJobs.length;
  }

  await setCampaignStatusInternal(campaign.id, 'sent');
  await db.update(campaigns).set({ totalSent: enqueued }).where(eq(campaigns.id, campaign.id));

  return { channel: type, audience: audience.length, enqueued, skipped };
}
