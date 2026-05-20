/**
 * CDP event ingestion (#267).
 *
 * Batch-friendly, idempotent event writer. The PG `cdp_events` table is the
 * durable store; a Kafka producer (topic `cdp.events.v1`) fans events out to
 * ClickHouse for analytics when configured via `KAFKA_BROKERS`.
 *
 * Idempotency: caller provides `eventId`. The unique partial index in PG
 * enforces at-most-once; duplicate batches are no-ops.
 *
 * Identity stitching: when a payload carries `userId` / `email` / `phone` /
 * `anonymousId`, we resolve the contact via the identity graph so the event
 * lands under the canonical contact. Anonymous events are accepted and
 * back-stitched later by the trait worker when the visitor identifies.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { cdpEvents, type CdpEvent } from '../../db/schema/index.js';
import { ingestSignals, resolveContact, normaliseSignal } from './identity-graph.js';
import { invalidateProfile } from './unified-profile.js';

export interface IngestEvent {
  /** Caller-supplied dedupe key. Generate a UUID v7 per event. */
  eventId?: string;
  /** `track` | `page` | `identify` | `group` | `alias` | custom. */
  type?: string;
  /** Domain event name (e.g. "order_placed"). */
  name: string;
  /** Where the event came from. */
  source?: string;
  /** Known identifiers — any combination will drive identity resolution. */
  userId?: string;
  anonymousId?: string;
  email?: string;
  phone?: string;
  deviceId?: string;
  cookie?: string;
  socialId?: string;
  /** Pre-resolved contact id, if caller already knows it. */
  contactId?: string;
  /** Arbitrary properties. */
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  occurredAt?: string | Date;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
  inserted: CdpEvent[];
}

const MAX_BATCH = 500;

type SignalTuple = {
  type:
    | 'email'
    | 'phone'
    | 'user_id'
    | 'account_id'
    | 'cookie'
    | 'device_id'
    | 'social_id'
    | 'visitor_id';
  value: string;
};

function extractSignals(e: IngestEvent): SignalTuple[] {
  const out: SignalTuple[] = [];
  if (e.email) out.push({ type: 'email', value: e.email });
  if (e.phone) out.push({ type: 'phone', value: e.phone });
  if (e.userId) out.push({ type: 'user_id', value: e.userId });
  if (e.deviceId) out.push({ type: 'device_id', value: e.deviceId });
  if (e.cookie) out.push({ type: 'cookie', value: e.cookie });
  if (e.socialId) out.push({ type: 'social_id', value: e.socialId });
  if (e.anonymousId) out.push({ type: 'visitor_id', value: e.anonymousId });
  return out;
}

async function resolveEventContact(orgId: string, event: IngestEvent): Promise<string | null> {
  if (event.contactId) return event.contactId;
  const signals = extractSignals(event);
  if (signals.length === 0) return null;
  return resolveContact(orgId, signals);
}

/**
 * Ingest a batch of events. Returns per-event accounting so callers can
 * retry only the failed items. Never throws on a single bad event — errors
 * are reported in `errors[]`.
 */
export async function ingestEvents(orgId: string, events: IngestEvent[]): Promise<IngestResult> {
  if (events.length === 0) {
    return { accepted: 0, duplicates: 0, failed: 0, errors: [], inserted: [] };
  }
  if (events.length > MAX_BATCH) {
    throw new Error(`Batch size ${events.length} exceeds max ${MAX_BATCH}`);
  }

  const result: IngestResult = {
    accepted: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
    inserted: [],
  };

  const touchedContacts = new Set<string>();
  const rows: (typeof cdpEvents.$inferInsert)[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    try {
      const contactId = await resolveEventContact(orgId, event);

      // For identify events, also upsert identity signals so future events stitch.
      if (event.type === 'identify' || event.name === 'identify') {
        const signals = extractSignals(event).map((s) => ({
          type: s.type,
          value: normaliseSignal(s.type, s.value),
          source: event.source,
        }));
        if (signals.length > 0 && contactId) {
          await ingestSignals({ orgId, contactId, signals });
        }
      }

      rows.push({
        orgId,
        eventId: event.eventId,
        contactId: contactId ?? undefined,
        anonymousId: event.anonymousId ?? undefined,
        eventType: event.type ?? 'track',
        name: event.name,
        source: event.source,
        properties: event.properties ?? {},
        context: event.context ?? {},
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
      });

      if (contactId) touchedContacts.add(contactId);
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        index: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (rows.length > 0) {
    const inserted = await db
      .insert(cdpEvents)
      .values(rows)
      .onConflictDoNothing({ target: [cdpEvents.orgId, cdpEvents.eventId] })
      .returning();
    result.inserted = inserted;
    result.accepted = inserted.length;
    result.duplicates = rows.length - inserted.length;
  }

  // Invalidate unified profile cache for any contact whose feed changed.
  if (touchedContacts.size > 0) {
    await Promise.all(
      [...touchedContacts].map((id) => invalidateProfile(orgId, id).catch(() => {})),
    );
  }

  // Fire-and-forget Kafka fan-out if configured. Logged & swallowed — the
  // PG row is the source of truth.
  if (process.env.KAFKA_BROKERS && result.inserted.length > 0) {
    publishToKafka(orgId, result.inserted).catch((err) => {
      console.error('[cdp] kafka publish failed', err);
    });
  }

  return result;
}

/**
 * Best-effort Kafka publish. Uses dynamic import so the dependency stays
 * optional; missing `kafkajs` just skips.
 */
async function publishToKafka(orgId: string, events: CdpEvent[]): Promise<void> {
  try {
    // @ts-expect-error optional dependency
    const { Kafka } = await import('kafkajs');
    const kafka = new Kafka({
      clientId: 'forgemsg-cdp',
      brokers: (process.env.KAFKA_BROKERS ?? '').split(',').filter(Boolean),
    });
    const producer = kafka.producer();
    await producer.connect();
    await producer.send({
      topic: process.env.CDP_EVENT_TOPIC ?? 'cdp.events.v1',
      messages: events.map((e) => ({
        key: `${orgId}:${e.contactId ?? e.anonymousId ?? e.id}`,
        value: JSON.stringify(e),
      })),
    });
    await producer.disconnect();
  } catch {
    // kafka is optional — swallow
  }
}

export interface QueryEventsInput {
  contactId?: string;
  anonymousId?: string;
  name?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

export async function queryEvents(orgId: string, input: QueryEventsInput): Promise<CdpEvent[]> {
  const limit = Math.min(Math.max(1, input.limit ?? 100), 1000);
  const conds = [eq(cdpEvents.orgId, orgId)];
  if (input.contactId) conds.push(eq(cdpEvents.contactId, input.contactId));
  if (input.anonymousId) conds.push(eq(cdpEvents.anonymousId, input.anonymousId));
  if (input.name) conds.push(eq(cdpEvents.name, input.name));
  if (input.since) conds.push(sql`${cdpEvents.occurredAt} >= ${input.since}`);
  if (input.until) conds.push(sql`${cdpEvents.occurredAt} <= ${input.until}`);
  return db
    .select()
    .from(cdpEvents)
    .where(and(...conds))
    .orderBy(sql`${cdpEvents.occurredAt} DESC`)
    .limit(limit);
}
