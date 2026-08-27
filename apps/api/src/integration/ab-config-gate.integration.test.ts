/**
 * The two API-side halves of "an A/B campaign always reaches an end state".
 *
 *  1. A config that holds contacts back but names no test window is refused at
 *     the click on Send. The splitter only schedules a winner job when there is
 *     a window to wait for, and the winner job is the only thing that can close
 *     an A/B campaign — so that config produces a campaign nothing can finish.
 *     Refusing it costs the operator an error message; accepting it costs them
 *     a campaign stuck in `sending` and a SQL console.
 *
 *  2. Resume refuses a campaign parked for A/B review. Its variants have gone
 *     out and its holdback deliberately has not, so there is nothing on the
 *     queue to carry on with; the old behaviour flipped it to `sending` with an
 *     empty queue, and since an A/B campaign arms no counter and the reaper
 *     skips those, that was permanent.
 *
 * Both run against a real database, through the same service calls the routes
 * make.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { campaigns, organizations, lists } from '../db/schema/index.js';
import { sendCampaign, resumeCampaign } from '../services/campaigns/index.js';
import { setCampaignStatusInternal } from '../services/campaigns/dispatch.js';

let orgId: string;
let listId: string;
const made: string[] = [];

/** A campaign that passes every other readiness check, so only ab_config is on trial. */
async function makeCampaign(abConfig: Record<string, unknown> | null): Promise<string> {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `ab-gate ${randomUUID().slice(0, 8)}`,
      subject: 'A/B gate probe',
      fromName: 'ForgeMsg',
      fromEmail: 'probe@test.local',
      content: { blocks: [] },
      listId,
      status: 'draft',
      type: 'email',
      ...(abConfig ? { abConfig } : {}),
    })
    .returning({ id: campaigns.id });
  made.push(c!.id);
  return c!.id;
}

const VARIANTS_80 = [
  { id: 'a', subject: 'A', content: { blocks: ['A'] }, percentage: 40 },
  { id: 'b', subject: 'B', content: { blocks: ['B'] }, percentage: 40 },
];
const VARIANTS_100 = [
  { id: 'a', subject: 'A', content: { blocks: ['A'] }, percentage: 50 },
  { id: 'b', subject: 'B', content: { blocks: ['B'] }, percentage: 50 },
];

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'ab-gate itest', slug: `ab-gate-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [list] = await db
    .insert(lists)
    .values({ orgId, name: `ab-gate ${randomUUID().slice(0, 8)}` })
    .returning({ id: lists.id });
  listId = list!.id;
});

afterAll(async () => {
  if (made.length) await db.delete(campaigns).where(inArray(campaigns.id, made));
  await db.delete(lists).where(eq(lists.id, listId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('an A/B config that could never finish is refused at Send', () => {
  it('a holdback with no test window is refused, and the campaign does not move', async () => {
    const campaignId = await makeCampaign({
      variants: VARIANTS_80, // 80% → a 20% holdback
      autoSendWinner: true,
      // testDurationHours deliberately absent
    });

    await expect(sendCampaign(orgId, campaignId)).rejects.toThrow(/test duration/i);

    // Refused BEFORE the status flip, so there is nothing to roll back and the
    // operator finds the campaign exactly where they left it.
    const [row] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(row!.status).toBe('draft');
  });

  it('the refusal names the holdback and both ways out of it', async () => {
    const campaignId = await makeCampaign({ variants: VARIANTS_80, autoSendWinner: true });

    await expect(sendCampaign(orgId, campaignId)).rejects.toThrow(
      /20\.0% of the audience[\s\S]*test duration in hours[\s\S]*100/i,
    );
  });

  it('a zero test duration is refused the same way as a missing one', async () => {
    const campaignId = await makeCampaign({
      variants: VARIANTS_80,
      testDurationHours: 0,
      autoSendWinner: true,
    });

    await expect(sendCampaign(orgId, campaignId)).rejects.toThrow(/test duration/i);
  });

  // ── What must NOT be refused ──────────────────────────────────────────────

  it('variants summing to 100 are accepted — no holdback, so nothing is waiting', async () => {
    const campaignId = await makeCampaign({ variants: VARIANTS_100, autoSendWinner: true });

    const sent = await sendCampaign(orgId, campaignId);
    expect(sent.status).toBe('queueing');
  });

  it('auto-send off is accepted — the winner job runs and parks it for a human', async () => {
    const campaignId = await makeCampaign({
      variants: VARIANTS_80,
      testDurationHours: 4,
      autoSendWinner: false,
    });

    const sent = await sendCampaign(orgId, campaignId);
    expect(sent.status).toBe('queueing');
  });

  it('a campaign with no ab_config is untouched by the gate', async () => {
    const campaignId = await makeCampaign(null);
    const sent = await sendCampaign(orgId, campaignId);
    expect(sent.status).toBe('queueing');
  });
});

describe('Resume refuses a campaign parked for A/B review', () => {
  /** A campaign in the state the winner job leaves behind on `needs_review`. */
  async function parkedForReview(): Promise<string> {
    const campaignId = await makeCampaign({
      variants: VARIANTS_80,
      testDurationHours: 4,
      autoSendWinner: false,
    });
    await sendCampaign(orgId, campaignId); // → queueing
    await setCampaignStatusInternal(campaignId, 'sending');
    await setCampaignStatusInternal(campaignId, 'paused', 'ab_needs_review');
    return campaignId;
  }

  it('refuses, and leaves the campaign paused rather than flipping it to sending', async () => {
    const campaignId = await parkedForReview();

    await expect(resumeCampaign(orgId, campaignId)).rejects.toThrow(/choose a winning variant/i);

    // The whole point: the old code answered this with `sending` and an empty
    // queue, which an A/B campaign can never leave.
    const [row] = await db
      .select({ status: campaigns.status, pausedReason: campaigns.pausedReason })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    expect(row!.status).toBe('paused');
    expect(row!.pausedReason).toBe('ab_needs_review');
  });

  it('still resumes an operator pause, which is a different pause entirely', async () => {
    const campaignId = await makeCampaign({ variants: VARIANTS_100, autoSendWinner: true });
    await sendCampaign(orgId, campaignId);
    await setCampaignStatusInternal(campaignId, 'sending');
    await setCampaignStatusInternal(campaignId, 'paused', 'operator');

    const resumed = await resumeCampaign(orgId, campaignId);
    expect(resumed.status).toBe('sending');
  });
});
