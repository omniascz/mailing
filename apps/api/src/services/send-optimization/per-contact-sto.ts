/**
 * Per-contact send-time optimization (STO).
 * Predicts the best delivery hour for each contact from their own open history,
 * shrunk toward the org's population hour distribution (empirical Bayes) so
 * sparse contacts don't get a confident "best hour" from one open. See sto-pure.ts.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import {
  contactSendTimePredictions,
  type ContactSendTimePrediction,
} from '../../db/schema/contact-send-time.js';
import { redis } from '@forgemsg/shared/redis';
import { computeStoFromCounts, normalizeHistogram, uniformPrior, HOURS } from './sto-pure.js';

const PRIOR_KEY = (orgId: string) => `sto:hour-prior:${orgId}`;
const PRIOR_TTL = 86_400; // 24h

/**
 * Org-wide open-hour distribution used as the Bayesian prior. Cached 24h so the
 * per-contact batch doesn't re-aggregate the whole org each time.
 */
export async function getOrgHourPrior(orgId: string): Promise<number[]> {
  const cached = await redis.get(PRIOR_KEY(orgId)).catch(() => null);
  if (cached) {
    try {
      const arr = JSON.parse(cached) as number[];
      if (Array.isArray(arr) && arr.length === HOURS) return arr;
    } catch {
      /* refit */
    }
  }

  const since = new Date(Date.now() - 180 * 86400_000);
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from created_at at time zone 'UTC')::int`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'open'),
        gte(emailEvents.createdAt, since),
      ),
    )
    .groupBy(sql`extract(hour from created_at at time zone 'UTC')::int`);

  const counts = new Array(HOURS).fill(0) as number[];
  for (const r of rows) {
    if (r.hour >= 0 && r.hour < HOURS) counts[r.hour] = Number(r.cnt);
  }
  const prior = counts.reduce((a, b) => a + b, 0) > 0 ? normalizeHistogram(counts) : uniformPrior();
  await redis.set(PRIOR_KEY(orgId), JSON.stringify(prior), 'EX', PRIOR_TTL).catch(() => {});
  return prior;
}

export async function computeContactSendTime(
  orgId: string,
  contactId: string,
): Promise<ContactSendTimePrediction> {
  const since = new Date(Date.now() - 180 * 86400_000);

  const rows = await db
    .select({ hour: sql<number>`extract(hour from created_at at time zone 'UTC')::int` })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
        eq(emailEvents.eventType, 'open'),
        gte(emailEvents.createdAt, since),
      ),
    );

  const counts = new Array(HOURS).fill(0) as number[];
  for (const r of rows) {
    const h = r.hour;
    if (h >= 0 && h < HOURS) counts[h] = (counts[h] ?? 0) + 1;
  }

  // Empirical-Bayes shrinkage toward the org's hour distribution.
  const prior = await getOrgHourPrior(orgId);
  const sto = computeStoFromCounts(counts, prior);
  const bestHour = sto.bestHourUtc;
  const secondBest = sto.secondBestHourUtc;
  const confidence = sto.confidence;
  const rates = sto.rates;
  const total = sto.sampleSize;

  const [existing] = await db
    .select({ id: contactSendTimePredictions.id })
    .from(contactSendTimePredictions)
    .where(
      and(
        eq(contactSendTimePredictions.orgId, orgId),
        eq(contactSendTimePredictions.contactId, contactId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(contactSendTimePredictions)
      .set({
        bestHourUtc: bestHour,
        secondBestHourUtc: secondBest,
        confidence,
        hourlyOpenRates: JSON.stringify(rates),
        sampleSize: total,
        computedAt: new Date(),
      })
      .where(eq(contactSendTimePredictions.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db
    .insert(contactSendTimePredictions)
    .values({
      orgId,
      contactId,
      bestHourUtc: bestHour,
      secondBestHourUtc: secondBest,
      confidence,
      hourlyOpenRates: JSON.stringify(rates),
      sampleSize: total,
    })
    .returning();
  return inserted!;
}

export async function getPrediction(
  orgId: string,
  contactId: string,
): Promise<ContactSendTimePrediction | null> {
  const [row] = await db
    .select()
    .from(contactSendTimePredictions)
    .where(
      and(
        eq(contactSendTimePredictions.orgId, orgId),
        eq(contactSendTimePredictions.contactId, contactId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Given a desired send time, find the next occurrence of the contact's
 * best hour at or after `notBefore`.
 */
export function nextOptimalSendTime(bestHourUtc: number, notBefore: Date): Date {
  const d = new Date(notBefore);
  d.setUTCMinutes(0, 0, 0);
  if (d.getUTCHours() <= bestHourUtc) {
    d.setUTCHours(bestHourUtc);
  } else {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(bestHourUtc);
  }
  return d;
}
