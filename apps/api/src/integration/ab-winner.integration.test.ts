/**
 * What the A/B test actually decided, against a real Postgres.
 *
 * The defect these exist for: opens and clicks never carried a variant, and the
 * statistics query filtered on `ab_variant_id IS NOT NULL`, so every engagement
 * row was thrown away and every variant scored zero. With equal scores the sort
 * did nothing and the "winner" was whichever variant happened to be listed
 * first in ab_config. A customer paid for a test and got a coin flip wearing a
 * confidence percentage.
 *
 * So the first case here runs the same data twice with the variant order
 * swapped. Nothing in the old code could pass it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import {
  abTestResults,
  campaigns,
  contacts,
  emailEvents,
  organizations,
} from '../db/schema/index.js';
import {
  computeAbWinner,
  decideDispatch,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_WINNER_CRITERIA,
  type AbConfig,
  type AbVariant,
} from '../services/campaigns/ab-winner.js';

let app: FastifyInstance;
let orgId: string;
let contactIds: string[] = [];
const createdCampaigns: string[] = [];

const VARIANT_A: AbVariant = {
  id: 'a',
  subject: 'Variant A',
  content: { blocks: ['A'] },
  percentage: 40,
};
const VARIANT_B: AbVariant = {
  id: 'b',
  subject: 'Variant B',
  content: { blocks: ['B'] },
  percentage: 40,
};

/** Total contacts the fixture pool holds; cases slice what they need. */
const POOL = 400;

function abConfig(variants: AbVariant[], over: Partial<AbConfig> = {}): AbConfig {
  return {
    variants,
    testDurationHours: 4,
    autoSendWinner: true,
    ...over,
  };
}

async function makeCampaign(cfg: AbConfig): Promise<string> {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `ab-itest ${randomUUID().slice(0, 8)}`,
      subject: 'A/B probe',
      status: 'sending',
      type: 'email',
      abConfig: cfg as unknown as Record<string, unknown>,
    })
    .returning({ id: campaigns.id });
  createdCampaigns.push(c!.id);
  return c!.id;
}

/**
 * Record a cohort exactly the way production does: a `send` row per contact
 * carrying the variant (mta-sender), then engagement rows that do NOT carry it
 * (the tracking endpoints could not know it). The join is what has to recover
 * the attribution.
 */
async function recordCohort(
  campaignId: string,
  variantId: string,
  offset: number,
  size: number,
  opts: { opens?: number; clicks?: number } = {},
) {
  const cohort = contactIds.slice(offset, offset + size);
  await db.insert(emailEvents).values(
    cohort.map((contactId) => ({
      orgId,
      campaignId,
      contactId,
      eventType: 'send' as const,
      abVariantId: variantId,
    })),
  );
  if (opts.opens) {
    await db.insert(emailEvents).values(
      cohort.slice(0, opts.opens).map((contactId) => ({
        orgId,
        campaignId,
        contactId,
        eventType: 'open' as const,
      })),
    );
  }
  if (opts.clicks) {
    await db.insert(emailEvents).values(
      cohort.slice(0, opts.clicks).map((contactId) => ({
        orgId,
        campaignId,
        contactId,
        eventType: 'click' as const,
      })),
    );
  }
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'ab itest', slug: `ab-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const tag = randomUUID().slice(0, 8);
  const rows = await db
    .insert(contacts)
    .values(
      Array.from({ length: POOL }, (_, i) => ({
        orgId,
        email: `abw-${tag}-${i}@test.local`,
        status: 'active' as const,
      })),
    )
    .returning({ id: contacts.id });
  contactIds = rows.map((r) => r.id);
}, 120_000);

afterAll(async () => {
  if (createdCampaigns.length > 0) {
    await db.delete(emailEvents).where(inArray(emailEvents.campaignId, createdCampaigns));
    await db.delete(abTestResults).where(inArray(abTestResults.campaignId, createdCampaigns));
    await db.delete(campaigns).where(inArray(campaigns.id, createdCampaigns));
  }
  await db.delete(contacts).where(eq(contacts.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app.close();
}, 60_000);

describe('computeAbWinner — the better variant wins', () => {
  // Both orderings, same underlying data. B is sent to the same number of
  // people as A and gets four times the clicks, so B has to win either way.
  for (const order of [
    ['a', 'b'],
    ['b', 'a'],
  ] as const) {
    it(`ab_config ordered [${order.join(', ')}] — B wins on merit, not position`, async () => {
      const variants = order.map((id) => (id === 'a' ? VARIANT_A : VARIANT_B));
      const campaignId = await makeCampaign(abConfig(variants));

      await recordCohort(campaignId, 'a', 0, 150, { opens: 30, clicks: 10 });
      await recordCohort(campaignId, 'b', 150, 150, { opens: 120, clicks: 40 });

      const result = await computeAbWinner(orgId, campaignId);

      expect(result.winnerVariantId).toBe('b');
      expect(result.metric).toBe(DEFAULT_WINNER_CRITERIA);
      expect(result.rankings[0]!.variantId).toBe('b');
      expect(result.rankings[0]!.sent).toBe(150);
      expect(result.rankings[0]!.uniqueClicks).toBe(40);
      // The counts come from joining engagement back to the send row — the
      // open/click rows themselves carry no variant here, on purpose.
      expect(result.rankings[0]!.clickRate).toBeCloseTo(40 / 150, 5);
      expect(result.rankings[1]!.variantId).toBe('a');
    }, 60_000);
  }

  it('a variant with no sends is left out of the rankings entirely', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    // Only A was ever sent. B must not appear with a fabricated denominator —
    // the old code gave it `sent || 1`, so one stray open read as 100%.
    await recordCohort(campaignId, 'a', 0, 100, { opens: 20, clicks: 8 });

    const result = await computeAbWinner(orgId, campaignId);

    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0]!.variantId).toBe('a');
    expect(result.winnerVariantId).toBe('a');
    // One arm, nothing to compare against.
    expect(result.confidencePct).toBe(0);
    expect(result.decision).toBe('needs_review');
  }, 60_000);

  it('the cached second call still returns usable rankings', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    await recordCohort(campaignId, 'a', 0, 150, { clicks: 10 });
    await recordCohort(campaignId, 'b', 150, 150, { clicks: 40 });

    const first = await computeAbWinner(orgId, campaignId);
    const second = await computeAbWinner(orgId, campaignId);

    expect(second.winnerVariantId).toBe(first.winnerVariantId);
    // The worker builds its batch jobs from these; an empty array is what
    // stopped every repeat dispatch dead.
    expect(second.rankings.length).toBeGreaterThan(0);
    const winner = second.rankings.find((r) => r.variantId === second.winnerVariantId);
    expect(winner).toBeDefined();
    expect(winner!.subject).toBe('Variant B');
    expect(winner!.content).toEqual({ blocks: ['B'] });
  }, 60_000);
});

describe('confidenceThreshold gates the automatic dispatch', () => {
  it('a decisive result is dispatched automatically', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    await recordCohort(campaignId, 'a', 0, 150, { clicks: 5 });
    await recordCohort(campaignId, 'b', 150, 150, { clicks: 60 });

    const result = await computeAbWinner(orgId, campaignId);

    expect(result.confidencePct).toBeGreaterThanOrEqual(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(result.decision).toBe('auto_send');
    expect(result.autoSendWinner).toBe(true);
    expect(result.decisionReason).toBeNull();
  }, 60_000);

  it('a result too close to call is held back for a human', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    // 20 vs 22 clicks out of 150 — a real but statistically unconvincing gap.
    await recordCohort(campaignId, 'a', 0, 150, { clicks: 20 });
    await recordCohort(campaignId, 'b', 150, 150, { clicks: 22 });

    const result = await computeAbWinner(orgId, campaignId);

    expect(result.confidencePct).toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(result.decision).toBe('needs_review');
    expect(result.autoSendWinner).toBe(false);
    expect(result.decisionReason).toMatch(/below the 95% this test requires/);

    // And it is persisted, so the customer's result page can explain itself.
    const [row] = await db
      .select({ decision: abTestResults.decision, reason: abTestResults.decisionReason })
      .from(abTestResults)
      .where(eq(abTestResults.campaignId, campaignId));
    expect(row!.decision).toBe('needs_review');
    expect(row!.reason).toBeTruthy();
  }, 60_000);

  it('a custom threshold is honoured', async () => {
    const campaignId = await makeCampaign(
      abConfig([VARIANT_A, VARIANT_B], { confidenceThreshold: 50 }),
    );
    await recordCohort(campaignId, 'a', 0, 150, { clicks: 20 });
    await recordCohort(campaignId, 'b', 150, 150, { clicks: 32 });

    const result = await computeAbWinner(orgId, campaignId);

    // The same gap that fails at 95 clears a threshold the customer set lower.
    expect(result.confidencePct).toBeGreaterThanOrEqual(50);
    expect(result.confidencePct).toBeLessThan(95);
    expect(result.decision).toBe('auto_send');
  }, 60_000);

  it('decideDispatch is the single place the rule lives', () => {
    const base = { hasRunnerUp: true, autoSendConfigured: true };
    expect(decideDispatch({ ...base, confidencePct: 96, threshold: 95 }).decision).toBe(
      'auto_send',
    );
    expect(decideDispatch({ ...base, confidencePct: 94.9, threshold: 95 }).decision).toBe(
      'needs_review',
    );
    expect(decideDispatch({ ...base, confidencePct: 10, threshold: 0 }).decision).toBe('auto_send');
    expect(
      decideDispatch({ ...base, hasRunnerUp: false, confidencePct: 0, threshold: 95 }).decision,
    ).toBe('needs_review');
    expect(
      decideDispatch({ ...base, autoSendConfigured: false, confidencePct: 99, threshold: 95 })
        .decision,
    ).toBe('needs_review');
  });
});

describe('variant attribution is written onto the engagement row', () => {
  beforeEach(async () => {
    // The attribution subquery reads any prior row for the pair, so each case
    // needs its own campaign; that is handled by makeCampaign per test.
  });

  it('an open recorded after the send carries the send row variant', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    await recordCohort(campaignId, 'b', 0, 1);
    const contactId = contactIds[0]!;

    // Exactly what routes/v1/tracking.ts now does: the variant is a scalar
    // subquery inside the INSERT, not a value the caller had.
    await db.execute(sql`
      INSERT INTO "email_events" ("org_id", "campaign_id", "contact_id", "event_type", "ab_variant_id")
      VALUES (
        ${orgId}::uuid, ${campaignId}::uuid, ${contactId}::uuid, 'open',
        (SELECT prior."ab_variant_id" FROM "email_events" prior
          WHERE prior."campaign_id" = ${campaignId}::uuid
            AND prior."contact_id" = ${contactId}::uuid
            AND prior."ab_variant_id" IS NOT NULL
          LIMIT 1)
      )
    `);

    const [row] = await db
      .select({ abVariantId: emailEvents.abVariantId })
      .from(emailEvents)
      .where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.eventType, 'open')));
    expect(row!.abVariantId).toBe('b');
  }, 60_000);

  it('leaves it NULL when there is no send row to attribute to', async () => {
    const campaignId = await makeCampaign(abConfig([VARIANT_A, VARIANT_B]));
    const contactId = contactIds[399]!;

    await db.execute(sql`
      INSERT INTO "email_events" ("org_id", "campaign_id", "contact_id", "event_type", "ab_variant_id")
      VALUES (
        ${orgId}::uuid, ${campaignId}::uuid, ${contactId}::uuid, 'click',
        (SELECT prior."ab_variant_id" FROM "email_events" prior
          WHERE prior."campaign_id" = ${campaignId}::uuid
            AND prior."contact_id" = ${contactId}::uuid
            AND prior."ab_variant_id" IS NOT NULL
          LIMIT 1)
      )
    `);

    const [row] = await db
      .select({ abVariantId: emailEvents.abVariantId })
      .from(emailEvents)
      .where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.eventType, 'click')));
    expect(row!.abVariantId).toBeNull();
  }, 60_000);
});
