/**
 * Transactional batch runner + scheduled-batch lifecycle (SendGrid parity).
 *
 * A batch can be sent immediately or scheduled for a future `sendAt`. Scheduled
 * batches are held in Redis and dispatched by the campaign-dispatch cron. Before
 * a scheduled batch fires it can be paused/resumed or cancelled — mirroring
 * SendGrid's `POST /v3/user/scheduled_sends` (status: pause | cancel).
 */

import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';
import { checkSendCapacity } from '../billing/plan-enforcement.js';
import { assertSenderVerified, sendTransactionalMessage } from './send-message.js';

export interface BatchRecipient {
  to: string;
  mergeVars?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface BatchPayload {
  from: string;
  fromName?: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  recipients: BatchRecipient[];
  tags?: string[];
  /** Scheduled with a test key: sandboxed when it fires, as it would have been now. */
  testMode?: boolean;
}

export type BatchStatus = 'scheduled' | 'paused' | 'processing' | 'queued' | 'cancelled' | 'failed';

export interface BatchRecord {
  batchId: string;
  orgId: string;
  status: BatchStatus;
  total: number;
  queued: number;
  failed: number;
  deduplicated: number;
  createdAt: string;
  sendAt?: string;
  /** Retained only while status is scheduled/paused so the cron can send it. */
  payload?: BatchPayload;
  /** Why a batch that came due could not be sent at all (status 'failed'). */
  error?: string;
}

const BATCH_TTL_SECONDS = 604800; // 7 days
const SCHEDULED_ZSET = 'scheduled:txn:batches';

export function batchKey(orgId: string, batchId: string): string {
  return `batch:txn:${orgId}:${batchId}`;
}

function member(orgId: string, batchId: string): string {
  return `${orgId}:${batchId}`;
}

async function saveRecord(rec: BatchRecord): Promise<void> {
  await redis.set(batchKey(rec.orgId, rec.batchId), JSON.stringify(rec), 'EX', BATCH_TTL_SECONDS);
}

export async function getBatch(orgId: string, batchId: string): Promise<BatchRecord | null> {
  const raw = await redis.get(batchKey(orgId, batchId));
  return raw ? (JSON.parse(raw) as BatchRecord) : null;
}

/** Dedup recipients by lowercased email, preserving first occurrence. */
export function dedupeRecipients(recipients: BatchRecipient[]): {
  unique: BatchRecipient[];
  removed: number;
} {
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    const key = r.to.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { unique, removed: recipients.length - unique.length };
}

/**
 * Run a batch: dedup, then each message down the path POST /transactional/email
 * takes — verified sender, plan, configuration set, sandbox, suppression,
 * template, queue, send event, email.sent webhook, metering. Shared by the
 * immediate route and the scheduled dispatcher, so a scheduled batch goes that
 * path at the moment it is sent.
 *
 * It used to enqueue straight onto the MTA queue: no send event was written, so
 * batches were never billed (found in Z121), no suppression or sender check ran,
 * and templateId was ignored. Batches now write a send event per message and
 * are billed — a deliberate change of behaviour (Z133).
 *
 * The per-second send rate is paced by the MTA worker when each message is
 * sent, exactly as for a single message (Z134). An unverified sender refuses the whole batch
 * before anything is written; any other refusal is that message's.
 */
export async function runTransactionalBatch(
  orgId: string,
  payload: BatchPayload,
): Promise<{
  total: number;
  queued: number;
  failed: number;
  deduplicated: number;
  results: Array<{ to: string; messageId: string; status: string; reason?: string }>;
}> {
  const { unique, removed } = dedupeRecipients(payload.recipients);
  await assertSenderVerified(orgId, payload.from);
  const testMode = payload.testMode === true;
  const results: Array<{ to: string; messageId: string; status: string; reason?: string }> = [];
  let queued = 0;

  for (const recipient of unique) {
    try {
      const outcome = await sendTransactionalMessage({
        orgId,
        testMode,
        to: recipient.to,
        from: payload.from,
        fromName: payload.fromName,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        templateId: payload.templateId,
        mergeVars: recipient.mergeVars,
        tags: payload.tags,
        metadata: { batch: true, ...recipient.metadata },
      });
      if (outcome.status === 'rejected' || outcome.status === 'rendering_failed') {
        const reason = outcome.status === 'rejected' ? outcome.reason : outcome.message;
        results.push({ to: recipient.to, messageId: '', status: outcome.status, reason });
        continue;
      }
      results.push({ to: recipient.to, messageId: outcome.messageId, status: 'queued' });
      queued++;
    } catch (err) {
      results.push({
        to: recipient.to,
        messageId: '',
        status: 'failed',
        reason: (err as Error).message,
      });
    }
  }

  return {
    total: unique.length,
    queued,
    failed: unique.length - queued,
    deduplicated: removed,
    results,
  };
}

/**
 * Persist a batch for future dispatch. Capacity is checked up front so an
 * over-quota batch is rejected at schedule time, not silently at send time.
 */
export async function scheduleBatch(
  orgId: string,
  batchId: string,
  payload: BatchPayload,
  sendAt: Date,
): Promise<BatchRecord> {
  const { unique, removed } = dedupeRecipients(payload.recipients);
  await checkSendCapacity(orgId, unique.length);

  const rec: BatchRecord = {
    batchId,
    orgId,
    status: 'scheduled',
    total: unique.length,
    queued: 0,
    failed: 0,
    deduplicated: removed,
    createdAt: new Date().toISOString(),
    sendAt: sendAt.toISOString(),
    payload: { ...payload, recipients: unique },
  };
  await saveRecord(rec);
  await redis.zadd(SCHEDULED_ZSET, sendAt.getTime(), member(orgId, batchId));
  return rec;
}

/** Cancel a scheduled/paused batch. No-op-safe if already sent. */
export async function cancelBatch(orgId: string, batchId: string): Promise<BatchRecord> {
  const rec = await getBatch(orgId, batchId);
  if (!rec) throw new Error('BATCH_NOT_FOUND');
  if (rec.status !== 'scheduled' && rec.status !== 'paused') {
    throw new Error('BATCH_NOT_CANCELLABLE');
  }
  rec.status = 'cancelled';
  delete rec.payload;
  await saveRecord(rec);
  await redis.zrem(SCHEDULED_ZSET, member(orgId, batchId));
  return rec;
}

/** Pause a scheduled batch (holds it out of dispatch until resumed). */
export async function pauseBatch(orgId: string, batchId: string): Promise<BatchRecord> {
  const rec = await getBatch(orgId, batchId);
  if (!rec) throw new Error('BATCH_NOT_FOUND');
  if (rec.status !== 'scheduled') throw new Error('BATCH_NOT_PAUSABLE');
  rec.status = 'paused';
  await saveRecord(rec);
  await redis.zrem(SCHEDULED_ZSET, member(orgId, batchId));
  return rec;
}

/** Resume a paused batch back into the scheduled queue. */
export async function resumeBatch(orgId: string, batchId: string): Promise<BatchRecord> {
  const rec = await getBatch(orgId, batchId);
  if (!rec) throw new Error('BATCH_NOT_FOUND');
  if (rec.status !== 'paused') throw new Error('BATCH_NOT_RESUMABLE');
  rec.status = 'scheduled';
  await saveRecord(rec);
  const when = rec.sendAt ? new Date(rec.sendAt).getTime() : Date.now();
  await redis.zadd(SCHEDULED_ZSET, when, member(orgId, batchId));
  return rec;
}

/**
 * Dispatch every scheduled batch whose sendAt has arrived. Called by the
 * campaign-dispatch cron. Each batch is isolated so one failure doesn't block
 * the rest. Returns how many batches were dispatched.
 */
export async function dispatchDueBatches(
  now: Date = new Date(),
): Promise<{ dispatched: number; errors: number }> {
  const due = await redis.zrangebyscore(SCHEDULED_ZSET, 0, now.getTime());
  let dispatched = 0;
  let errors = 0;

  for (const m of due) {
    const sep = m.indexOf(':');
    const orgId = m.slice(0, sep);
    const batchId = m.slice(sep + 1);
    try {
      const rec = await getBatch(orgId, batchId);
      // Skip anything cancelled/paused/already-sent that lingers in the set.
      if (!rec || rec.status !== 'scheduled' || !rec.payload) {
        await redis.zrem(SCHEDULED_ZSET, m);
        continue;
      }
      rec.status = 'processing';
      await saveRecord(rec);

      const out = await runTransactionalBatch(orgId, rec.payload);

      rec.status = 'queued';
      rec.queued = out.queued;
      rec.failed = out.failed;
      delete rec.payload;
      await saveRecord(rec);
      await redis.zrem(SCHEDULED_ZSET, m);
      dispatched++;
    } catch (err) {
      errors++;
      console.error(`[dispatch-batch] batch ${m} failed:`, err);
      // A refusal that will not change (an unverified sender) would be retried
      // every minute for ever; it fails the batch instead, with the reason.
      if (
        err instanceof AppError &&
        err.statusCode >= 400 &&
        err.statusCode < 500 &&
        err.statusCode !== 429
      ) {
        const rec = await getBatch(orgId, batchId).catch(() => null);
        if (rec) {
          rec.status = 'failed';
          rec.error = err.message;
          delete rec.payload;
          await saveRecord(rec).catch(() => {});
        }
        await redis.zrem(SCHEDULED_ZSET, m).catch(() => {});
      }
    }
  }
  return { dispatched, errors };
}
