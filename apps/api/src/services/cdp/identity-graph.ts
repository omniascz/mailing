/**
 * Identity graph (#264) — extends the anonymous→known merge (services/identity-merge)
 * with a multi-signal resolution layer.
 *
 * A single customer may be represented by many identifiers over time:
 *   - email (login, newsletter signup)
 *   - phone (SMS opt-in)
 *   - cookie / visitor_id (site tracking)
 *   - device_id (mobile app)
 *   - hashed_id (CRM join key, typically SHA-256 of email)
 *   - account_id (external system identifier)
 *   - user_id (post-auth)
 *   - social_id (Messenger PSID, WA wa_id, Twitter handle)
 *
 * The graph is an append-only edge store (identity_signals). Resolution
 * walks the edges to find a single canonical contact. When multiple
 * contacts share an edge set (e.g. same email across two accidentally-
 * duplicated contacts), we merge them — loser contact's edges move to
 * winner, merge is recorded for audit.
 */

import { createHash } from 'node:crypto';
import { emitWebhookEvent, toContactSummary } from '../webhooks/emit.js';
import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  identitySignals,
  identityMerges,
  contacts,
  type IdentitySignal,
  type SignalType,
} from '../../db/schema/index.js';

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Bring signal values to a canonical form so that "User@EXAMPLE.com" and
 * "user@example.com" map to the same edge. Hashing happens only for the
 * explicit `hashed_id` type; raw PII is stored as-is (encrypt via the HIPAA
 * field-level service when required).
 */
export function normaliseSignal(type: SignalType, value: string): string {
  const v = value.trim();
  switch (type) {
    case 'email':
      return v.toLowerCase();
    case 'phone':
      return v.replace(/[^+\d]/g, '');
    case 'hashed_id':
      // Accept either already-hashed (64-hex sha256) or raw to hash
      return /^[a-f0-9]{64}$/i.test(v)
        ? v.toLowerCase()
        : createHash('sha256').update(v.toLowerCase()).digest('hex');
    case 'cookie':
    case 'device_id':
    case 'visitor_id':
    case 'social_id':
    case 'account_id':
    case 'user_id':
      return v;
    default:
      return v;
  }
}

const DEFAULT_CONFIDENCE: Record<SignalType, number> = {
  user_id: 95,
  account_id: 90,
  email: 85,
  phone: 80,
  hashed_id: 75,
  social_id: 70,
  device_id: 60,
  cookie: 40,
  visitor_id: 30,
};

// ─── Signal ingest ───────────────────────────────────────────────────────────

export interface IngestSignalInput {
  orgId: string;
  signals: Array<{
    type: SignalType;
    value: string;
    confidence?: number;
    source?: string;
    metadata?: Record<string, unknown>;
  }>;
  /**
   * If provided, all signals are attached to this contact. If absent, the
   * graph tries to resolve a contact from the signals; if none is found,
   * a new contact is created (when at least one of the signals implies a
   * useful contact row — email or phone).
   */
  contactId?: string;
}

export interface ResolutionResult {
  contactId: string;
  created: boolean;
  mergedContactIds: string[];
  signalsLinked: number;
}

export async function ingestSignals(input: IngestSignalInput): Promise<ResolutionResult> {
  if (input.signals.length === 0) {
    throw new Error('ingestSignals requires at least one signal');
  }

  // Normalise all incoming signals up-front
  const normalised = input.signals.map((s) => ({
    type: s.type,
    value: normaliseSignal(s.type, s.value),
    confidence: s.confidence ?? DEFAULT_CONFIDENCE[s.type] ?? 50,
    source: s.source,
    metadata: s.metadata,
  }));

  // Resolve: find all existing contacts that share any of these signals
  const candidates = await db
    .select({
      contactId: identitySignals.contactId,
      type: identitySignals.signalType,
      value: identitySignals.signalValue,
      confidence: identitySignals.confidence,
    })
    .from(identitySignals)
    .where(
      and(
        eq(identitySignals.orgId, input.orgId),
        sql`(${identitySignals.signalType}, ${identitySignals.signalValue}) IN (${sql.join(
          normalised.map((s) => sql`(${s.type}, ${s.value})`),
          sql`, `,
        )})`,
      ),
    );

  const uniqueCandidates = new Set(candidates.map((c) => c.contactId));
  if (input.contactId) uniqueCandidates.add(input.contactId);

  let winnerId: string;
  let created = false;
  const mergedLosers: string[] = [];

  if (uniqueCandidates.size === 0) {
    // Create a contact from the strongest PII signal we have
    const emailSignal = normalised.find((s) => s.type === 'email');
    const phoneSignal = normalised.find((s) => s.type === 'phone');
    const [newContact] = await db
      .insert(contacts)
      .values({
        orgId: input.orgId,
        email: emailSignal?.value ?? null,
        phone: phoneSignal?.value ?? null,
        source: normalised[0]?.source ?? 'identity-graph',
      })
      .returning();
    winnerId = newContact!.id;
    emitWebhookEvent(input.orgId, 'contact.created', {
      ...toContactSummary(newContact!),
      source: 'cdp',
    });
    created = true;
  } else if (uniqueCandidates.size === 1) {
    winnerId = Array.from(uniqueCandidates)[0]!;
  } else {
    // Merge: pick winner with highest aggregate signal confidence, oldest createdAt as tiebreak
    const contactIds = Array.from(uniqueCandidates);
    const stats = await db
      .select({
        contactId: identitySignals.contactId,
        score: sql<number>`sum(${identitySignals.confidence})::int`,
      })
      .from(identitySignals)
      .where(
        and(
          eq(identitySignals.orgId, input.orgId),
          sql`${identitySignals.contactId} IN (${sql.join(
            contactIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        ),
      )
      .groupBy(identitySignals.contactId);

    const contactRows = await db
      .select({
        id: contacts.id,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(
        sql`${contacts.id} IN (${sql.join(
          contactIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );

    const scoreMap = new Map(stats.map((s) => [s.contactId, Number(s.score)]));
    const createdMap = new Map(contactRows.map((c) => [c.id, c.createdAt]));

    const sorted = [...uniqueCandidates].sort((a, b) => {
      const sa = scoreMap.get(a) ?? 0;
      const sb = scoreMap.get(b) ?? 0;
      if (sb !== sa) return sb - sa;
      const ca = createdMap.get(a)?.getTime() ?? Infinity;
      const cb = createdMap.get(b)?.getTime() ?? Infinity;
      return ca - cb;
    });
    winnerId = sorted[0]!;
    for (const loser of sorted.slice(1)) {
      const moved = await mergeContacts(input.orgId, winnerId, loser, 'identity-graph-auto');
      mergedLosers.push(loser);
      void moved;
    }
  }

  // Upsert all signals onto the winner
  let signalsLinked = 0;
  for (const s of normalised) {
    await db
      .insert(identitySignals)
      .values({
        orgId: input.orgId,
        contactId: winnerId,
        signalType: s.type,
        signalValue: s.value,
        confidence: s.confidence,
        source: s.source ?? null,
        metadata: s.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [identitySignals.orgId, identitySignals.signalType, identitySignals.signalValue],
        set: {
          contactId: winnerId,
          confidence: sql`GREATEST(${identitySignals.confidence}, ${s.confidence})`,
          source: s.source ?? null,
          lastSeenAt: new Date(),
          metadata: s.metadata ?? {},
        },
      });
    signalsLinked++;
  }

  return { contactId: winnerId, created, mergedContactIds: mergedLosers, signalsLinked };
}

// ─── Resolution (read-only) ──────────────────────────────────────────────────

export async function resolveContact(
  orgId: string,
  signals: Array<{ type: SignalType; value: string }>,
): Promise<string | null> {
  if (signals.length === 0) return null;
  const normalised = signals.map((s) => ({
    type: s.type,
    value: normaliseSignal(s.type, s.value),
  }));
  const rows = await db
    .select({
      contactId: identitySignals.contactId,
      confidence: identitySignals.confidence,
    })
    .from(identitySignals)
    .where(
      and(
        eq(identitySignals.orgId, orgId),
        sql`(${identitySignals.signalType}, ${identitySignals.signalValue}) IN (${sql.join(
          normalised.map((s) => sql`(${s.type}, ${s.value})`),
          sql`, `,
        )})`,
      ),
    );
  if (rows.length === 0) return null;
  // Pick the candidate with highest aggregate confidence
  const agg = new Map<string, number>();
  for (const r of rows) agg.set(r.contactId, (agg.get(r.contactId) ?? 0) + r.confidence);
  return [...agg.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export async function listSignals(orgId: string, contactId: string): Promise<IdentitySignal[]> {
  return db
    .select()
    .from(identitySignals)
    .where(and(eq(identitySignals.orgId, orgId), eq(identitySignals.contactId, contactId)))
    .orderBy(desc(identitySignals.confidence), desc(identitySignals.lastSeenAt));
}

// ─── Merge ───────────────────────────────────────────────────────────────────

export async function mergeContacts(
  orgId: string,
  winnerContactId: string,
  loserContactId: string,
  reason?: string,
): Promise<number> {
  if (winnerContactId === loserContactId) return 0;

  const result = await db
    .update(identitySignals)
    .set({ contactId: winnerContactId })
    .where(and(eq(identitySignals.orgId, orgId), eq(identitySignals.contactId, loserContactId)))
    .returning({ id: identitySignals.id });
  const moved = result.length;

  // Copy missing PII fields from loser → winner, then soft-delete the loser
  const [loser] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, loserContactId), eq(contacts.orgId, orgId)))
    .limit(1);
  const [winner] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, winnerContactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (loser && winner) {
    const patch: Record<string, unknown> = {};
    if (!winner.email && loser.email) patch.email = loser.email;
    if (!winner.phone && loser.phone) patch.phone = loser.phone;
    if (!winner.firstName && loser.firstName) patch.firstName = loser.firstName;
    if (!winner.lastName && loser.lastName) patch.lastName = loser.lastName;
    if (Object.keys(patch).length > 0) {
      await db
        .update(contacts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(contacts.id, winnerContactId));
    }
    await db
      .update(contacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, loserContactId));
  }

  await db.insert(identityMerges).values({
    orgId,
    winnerContactId,
    loserContactId,
    movedSignals: moved,
    reason: reason ?? null,
  });

  return moved;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export async function listDuplicates(
  orgId: string,
  limit = 50,
): Promise<
  Array<{
    signalType: string;
    signalValue: string;
    contactIds: string[];
  }>
> {
  // Any signal value that maps to >1 contact is a merge candidate.
  // Shouldn't happen with our unique index — but a race during ingest could
  // temporarily produce them, and we also want to spot legacy dupes.
  const rows = (await db.execute<{
    signal_type: string;
    signal_value: string;
    contact_ids: string[];
  }>(sql`
    SELECT signal_type, signal_value, array_agg(DISTINCT contact_id::text) AS contact_ids
    FROM identity_signals
    WHERE org_id = ${orgId}::uuid
    GROUP BY signal_type, signal_value
    HAVING count(DISTINCT contact_id) > 1
    LIMIT ${limit}
  `)) as unknown as Array<{ signal_type: string; signal_value: string; contact_ids: string[] }>;
  return rows.map((r) => ({
    signalType: r.signal_type,
    signalValue: r.signal_value,
    contactIds: r.contact_ids,
  }));
}
