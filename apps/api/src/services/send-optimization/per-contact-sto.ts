/**
 * Per-contact send-time optimization (STO).
 * Unlike cohort-level STO, this predicts the best delivery hour
 * for each individual contact based on their own open history.
 *
 * Algorithm:
 *   1. Load all email opens for the contact (last 6 months)
 *   2. Build a 24-slot UTC open-rate histogram
 *   3. Apply Laplace smoothing (α=0.1) to handle sparse data
 *   4. Return the best hour + confidence (based on sample size)
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { contactSendTimePredictions, type ContactSendTimePrediction } from '../../db/schema/contact-send-time.js';

const ALPHA = 0.1; // Laplace smoothing
const MIN_SAMPLE_HIGH_CONFIDENCE = 20;

function smoothed(counts: number[], total: number): number[] {
  const slots = counts.length;
  return counts.map((c) => (c + ALPHA) / (total + ALPHA * slots));
}

export async function computeContactSendTime(
  orgId: string,
  contactId: string,
): Promise<ContactSendTimePrediction> {
  const since = new Date(Date.now() - 180 * 86400_000);

  const rows = await db
    .select({ hour: sql<number>`extract(hour from created_at at time zone 'UTC')::int` })
    .from(emailEvents)
    .where(and(
      eq(emailEvents.orgId, orgId),
      eq(emailEvents.contactId, contactId),
      eq(emailEvents.eventType, 'open'),
      gte(emailEvents.createdAt, since),
    ));

  const counts = new Array(24).fill(0) as number[];
  for (const r of rows) {
    const h = r.hour;
    if (h >= 0 && h < 24) counts[h] = (counts[h] ?? 0) + 1;
  }
  const total = rows.length;
  const rates = smoothed(counts, total);

  // Find best and second best hour
  const indexed = rates.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r);
  const bestHour = indexed[0]?.i ?? 10;
  const secondBest = indexed[1]?.i ?? null;

  // Confidence: 0 when < 5 samples, 1 at ≥ MIN_SAMPLE_HIGH_CONFIDENCE
  const confidence = Math.min(1, total / MIN_SAMPLE_HIGH_CONFIDENCE);

  const [existing] = await db.select({ id: contactSendTimePredictions.id })
    .from(contactSendTimePredictions)
    .where(and(
      eq(contactSendTimePredictions.orgId, orgId),
      eq(contactSendTimePredictions.contactId, contactId),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(contactSendTimePredictions)
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

  const [inserted] = await db.insert(contactSendTimePredictions).values({
    orgId,
    contactId,
    bestHourUtc: bestHour,
    secondBestHourUtc: secondBest,
    confidence,
    hourlyOpenRates: JSON.stringify(rates),
    sampleSize: total,
  }).returning();
  return inserted!;
}

export async function getPrediction(
  orgId: string,
  contactId: string,
): Promise<ContactSendTimePrediction | null> {
  const [row] = await db.select()
    .from(contactSendTimePredictions)
    .where(and(
      eq(contactSendTimePredictions.orgId, orgId),
      eq(contactSendTimePredictions.contactId, contactId),
    ))
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
