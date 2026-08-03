/**
 * Managed pull-based event stream (SNS/SQS-style) backed by Redis Streams.
 *
 * Every org event that flows through dispatchEvent is also appended to a durable
 * per-org stream. Consumers pull with a cursor instead of hosting an HTTP
 * webhook receiver — the alternative delivery model SES (SNS/SQS) and SendGrid
 * lack a pull equivalent for.
 */

import { redis } from '@forgemsg/shared/redis';

// Cap the retained backlog per org (~ approximate trim, cheap).
const STREAM_MAXLEN = 10_000;

function streamKey(orgId: string): string {
  return `events:stream:${orgId}`;
}

/** Append an event to the org's durable stream. Fire-and-forget safe. */
export async function publishToStream(
  orgId: string,
  event: string,
  payload: Record<string, unknown>,
  timestamp: string,
): Promise<void> {
  await redis.xadd(
    streamKey(orgId),
    'MAXLEN',
    '~',
    STREAM_MAXLEN,
    '*',
    'event',
    event,
    'ts',
    timestamp,
    'data',
    JSON.stringify(payload),
  );
}

export interface StreamEvent {
  id: string;
  event: string;
  ts: string;
  data: Record<string, unknown>;
}

/**
 * Pure: turn a Redis XRANGE reply ([[id,[field,val,...]],…]) into typed events.
 * Malformed JSON in `data` degrades to {} rather than throwing.
 */
export function parseStreamEntries(rows: Array<[string, string[]]>): StreamEvent[] {
  return rows.map(([id, fields]) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i + 1 < fields.length; i += 2) obj[fields[i]!] = fields[i + 1]!;
    let data: Record<string, unknown> = {};
    try {
      data = obj.data ? (JSON.parse(obj.data) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    return { id, event: obj.event ?? '', ts: obj.ts ?? '', data };
  });
}

/**
 * Pull events after `cursor` (exclusive). Returns the events plus the next
 * cursor to pass on the following call. When cursor is omitted, reads from the
 * start of the retained backlog.
 */
export async function readStream(
  orgId: string,
  cursor: string | undefined,
  limit: number,
): Promise<{ events: StreamEvent[]; cursor: string | null; hasMore: boolean }> {
  const start = cursor ? `(${cursor}` : '-';
  const rows = (await redis.xrange(streamKey(orgId), start, '+', 'COUNT', limit)) as Array<
    [string, string[]]
  >;
  const events = parseStreamEntries(rows);
  const nextCursor = events.length ? events[events.length - 1]!.id : (cursor ?? null);
  return { events, cursor: nextCursor, hasMore: events.length === limit };
}
