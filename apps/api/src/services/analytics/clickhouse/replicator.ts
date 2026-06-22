/**
 * Postgres → ClickHouse replicator for email_events.
 *
 * Postgres stays the operational source of truth (recent slice, FK integrity);
 * ClickHouse holds the full history for fast aggregation. A watermarked batch
 * job copies new rows over — no Kafka required.
 *
 * Correctness: keyset watermark on (created_at, id) avoids both skips and
 * duplicates across batches, and a settle-lag (only replicate rows older than
 * SETTLE_MS) avoids racing rows committed out of timestamp order.
 *
 * Note: PII columns (ip_address, user_agent, metadata) are intentionally NOT
 * copied — the analytics warehouse only needs the non-PII analytical fields,
 * which also keeps it out of GDPR-erasure scope.
 */
import { and, or, eq, gt, lte, sql, asc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { emailEvents } from '../../../db/schema/index.js';
import { redis } from '../../../lib/redis.js';
import { chInsert, isClickHouseEnabled } from './client.js';

const WM_KEY = 'ch:repl:email_events:wm';
const BATCH = 5000;
const SETTLE_MS = 5000;

interface Watermark {
  ts: string; // ISO of created_at
  id: string;
}

export function chDateTime(d: Date): string {
  // 'YYYY-MM-DD HH:MM:SS.mmm' — ClickHouse DateTime64(3) JSONEachRow format.
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

async function readWatermark(): Promise<Watermark> {
  const raw = await redis.get(WM_KEY);
  if (!raw) return { ts: '1970-01-01T00:00:00.000Z', id: '' };
  try {
    return JSON.parse(raw) as Watermark;
  } catch {
    return { ts: '1970-01-01T00:00:00.000Z', id: '' };
  }
}

async function writeWatermark(wm: Watermark): Promise<void> {
  await redis.set(WM_KEY, JSON.stringify(wm));
}

/** Map a Postgres email_events row to a ClickHouse JSONEachRow object. */
export function mapRowToClickHouse(r: {
  id: string;
  orgId: string;
  campaignId: string | null;
  contactId: string | null;
  stream: string | null;
  eventType: string | null;
  bounceType: string | null;
  messageId: string | null;
  linkUrl: string | null;
  deviceType: string | null;
  emailClient: string | null;
  abVariantId: string | null;
  isBot: boolean | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: r.id,
    org_id: r.orgId,
    campaign_id: r.campaignId ?? '',
    contact_id: r.contactId ?? '',
    stream: r.stream ?? '',
    event_type: r.eventType ?? '',
    bounce_type: r.bounceType ?? '',
    message_id: r.messageId ?? '',
    link_url: r.linkUrl ?? '',
    device_type: r.deviceType ?? '',
    email_client: r.emailClient ?? '',
    ab_variant_id: r.abVariantId ?? '',
    is_bot: r.isBot ? 1 : 0,
    created_at: chDateTime(r.createdAt),
  };
}

export interface ReplicationResult {
  replicated: number;
  enabled: boolean;
  watermark?: Watermark;
}

/** Copy one batch (up to BATCH rows) of new email_events into ClickHouse. */
export async function replicateEmailEvents(nowMs: number = Date.now()): Promise<ReplicationResult> {
  if (!isClickHouseEnabled()) return { replicated: 0, enabled: false };

  const wm = await readWatermark();
  const wmDate = new Date(wm.ts);
  const cutoff = new Date(nowMs - SETTLE_MS);

  const rows = await db
    .select({
      id: emailEvents.id,
      orgId: emailEvents.orgId,
      campaignId: emailEvents.campaignId,
      contactId: emailEvents.contactId,
      stream: emailEvents.stream,
      eventType: emailEvents.eventType,
      bounceType: emailEvents.bounceType,
      messageId: emailEvents.messageId,
      linkUrl: emailEvents.linkUrl,
      deviceType: emailEvents.deviceType,
      emailClient: emailEvents.emailClient,
      abVariantId: emailEvents.abVariantId,
      isBot: emailEvents.isBot,
      createdAt: emailEvents.createdAt,
    })
    .from(emailEvents)
    .where(
      and(
        lte(emailEvents.createdAt, cutoff),
        or(
          gt(emailEvents.createdAt, wmDate),
          and(eq(emailEvents.createdAt, wmDate), sql`${emailEvents.id} > ${wm.id}`),
        ),
      ),
    )
    .orderBy(asc(emailEvents.createdAt), asc(emailEvents.id))
    .limit(BATCH);

  if (rows.length === 0) return { replicated: 0, enabled: true, watermark: wm };

  await chInsert('email_events', rows.map(mapRowToClickHouse));

  const last = rows[rows.length - 1]!;
  const newWm: Watermark = { ts: last.createdAt.toISOString(), id: last.id };
  await writeWatermark(newWm);

  return { replicated: rows.length, enabled: true, watermark: newWm };
}

/** Drain all pending batches (used by the cron tick). */
export async function replicateUntilCaughtUp(maxBatches = 20): Promise<ReplicationResult> {
  if (!isClickHouseEnabled()) return { replicated: 0, enabled: false };
  let total = 0;
  let last: Watermark | undefined;
  for (let i = 0; i < maxBatches; i++) {
    const r = await replicateEmailEvents();
    total += r.replicated;
    last = r.watermark;
    if (r.replicated < BATCH) break; // caught up
  }
  return { replicated: total, enabled: true, watermark: last };
}
