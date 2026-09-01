/**
 * The two campaign reports that had no reader, pinned against a real database.
 *
 * The web page renders GET /campaigns/:id/poll-results and
 * GET /campaigns/:id/ab-result from TypeScript interfaces it declares itself.
 * Interfaces are not checked against anything at runtime, so the page would
 * happily render `undefined` for a field the API spells differently, or divide
 * by a percentage that is really a fraction. This test is where those two
 * shapes are held to the database.
 *
 * The names asserted here are the names
 * apps/web/src/app/(dashboard)/campaigns/[id]/poll-results-card.tsx and
 * ab-result-card.tsx read. Renaming a column without renaming them there is
 * meant to fail here.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - It does not render anything. That the page puts these values on the screen
 *   is the other half, in
 *   apps/web/src/app/(dashboard)/campaigns/[id]/campaign-detail-render.test.tsx.
 * - It writes the ab_test_results row directly rather than running the winner
 *   job, so it pins the READ shape, not how the row comes to exist. The winner
 *   computation has its own suite (ab-winner.integration.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, pollVotes, abTestResults } from '../db/schema/index.js';

let app: FastifyInstance;
let session: Session;

const TAG = `rep-${randomUUID().slice(0, 8)}`;
const BLOCK_ID = 'block-poll-1';

let pollCampaignId: string;
let abCampaignId: string;
let plainCampaignId: string;
const contactIds: string[] = [];
const createdCampaigns: string[] = [];

const POLL_BLOCK = {
  id: BLOCK_ID,
  type: 'poll',
  question: 'Jak se ti líbí náš newsletter?',
  options: ['Moc', 'Jde to', 'Vůbec'],
};

const AB_CONFIG = {
  variants: [
    { id: 'a', subject: 'Sleva 20 %', content: { html: '<p>A</p>' }, percentage: 10 },
    { id: 'b', subject: 'Jenom dnes', content: { html: '<p>B</p>' }, percentage: 10 },
  ],
  winnerCriteria: 'click_rate',
  testDurationHours: 4,
  autoSendWinner: true,
  confidenceThreshold: 95,
};

async function insertCampaign(values: Record<string, unknown>) {
  const [row] = await db
    .insert(campaigns)
    .values({ orgId: session.orgId, type: 'email', ...values } as never)
    .returning({ id: campaigns.id });
  createdCampaigns.push(row!.id);
  return row!.id;
}

const get = async (url: string) => {
  const res = await app.inject({ method: 'GET', url, headers: { cookie: session.cookie } });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return (res.json() as { data: unknown }).data;
};

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  pollCampaignId = await insertCampaign({
    name: `${TAG} poll`,
    subject: 'Anketa',
    // The full EmailSchema, not just { blocks }: readCampaignContent has to
    // recognise the shape before pollResultsForCampaign can see the block at
    // all, and a bare { blocks: [...] } does not parse — measured, it answered
    // [] and the poll was invisible.
    content: {
      subject: 'Anketa',
      preheader: '',
      globalStyles: {
        backgroundColor: '#f3f4f6',
        contentBackgroundColor: '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif',
        linkColor: '#2563eb',
        textColor: '#111827',
        contentWidth: 600,
      },
      blocks: [POLL_BLOCK],
    },
  });

  abCampaignId = await insertCampaign({ name: `${TAG} ab`, abConfig: AB_CONFIG });
  plainCampaignId = await insertCampaign({ name: `${TAG} plain` });

  // 30 votes for option 0, 10 for option 1, none for option 2 — the exact
  // distribution the render test asserts renders as 75.0 / 25.0 / 0.0 %.
  for (let i = 0; i < 40; i += 1) {
    const [c] = await db
      .insert(contacts)
      .values({ orgId: session.orgId, email: `${TAG}-${i}@example.test`, status: 'active' })
      .returning({ id: contacts.id });
    contactIds.push(c!.id);
    const optionIndex = i < 30 ? 0 : 1;
    await db.insert(pollVotes).values({
      orgId: session.orgId,
      campaignId: pollCampaignId,
      contactId: c!.id,
      blockId: BLOCK_ID,
      optionIndex,
      optionLabel: POLL_BLOCK.options[optionIndex]!,
    });
  }

  await db.insert(abTestResults).values({
    campaignId: abCampaignId,
    orgId: session.orgId,
    winnerVariantId: 'b',
    winnerMetric: 'click_rate',
    winnerScore: '0.184',
    runnerUpScore: '0.092',
    confidencePct: '97.3',
    holdbackCount: 800,
    autoSendDispatched: true,
    decision: 'auto_send',
  });
}, 180_000);

afterAll(async () => {
  await db.delete(pollVotes).where(eq(pollVotes.campaignId, pollCampaignId));
  await db.delete(abTestResults).where(eq(abTestResults.campaignId, abCampaignId));
  for (const id of createdCampaigns) await db.delete(campaigns).where(eq(campaigns.id, id));
  for (const id of contactIds) await db.delete(contacts).where(eq(contacts.id, id));
  await app?.close();
}, 180_000);

describe('GET /api/v1/campaigns/:id/poll-results — the shape the page reads', () => {
  it('returns one entry per poll block, with the field names the card uses', async () => {
    const data = (await get(`/api/v1/campaigns/${pollCampaignId}/poll-results`)) as {
      blockId: string;
      question: string;
      options: { index: number; label: string; votes: number }[];
      totalVotes: number;
    }[];

    expect(data).toHaveLength(1);
    const poll = data[0]!;
    expect(Object.keys(poll).sort()).toEqual(['blockId', 'options', 'question', 'totalVotes']);
    expect(poll.blockId).toBe(BLOCK_ID);
    expect(poll.question).toBe(POLL_BLOCK.question);
    expect(poll.totalVotes).toBe(40);
    expect(poll.options).toEqual([
      { index: 0, label: 'Moc', votes: 30 },
      { index: 1, label: 'Jde to', votes: 10 },
      { index: 2, label: 'Vůbec', votes: 0 },
    ]);
    // The counts are numbers, not the strings a decimal column would give —
    // the card does arithmetic on them.
    expect(typeof poll.totalVotes).toBe('number');
    expect(typeof poll.options[0]!.votes).toBe('number');
  });

  it('answers [] for a campaign with no poll block, which is how the card hides itself', async () => {
    expect(await get(`/api/v1/campaigns/${plainCampaignId}/poll-results`)).toEqual([]);
  });
});

describe('GET /api/v1/campaigns/:id/ab-result — the shape the page reads', () => {
  it('returns the decided row with scores as strings and confidence as a percentage', async () => {
    const data = (await get(`/api/v1/campaigns/${abCampaignId}/ab-result`)) as Record<
      string,
      unknown
    >;

    expect(data).not.toBeNull();
    for (const key of [
      'winnerVariantId',
      'winnerMetric',
      'winnerScore',
      'runnerUpScore',
      'confidencePct',
      'holdbackCount',
      'autoSendDispatched',
      'decision',
      'decisionReason',
      'dispatchedAt',
      'selectedAt',
    ]) {
      expect(data, `missing key ${key}`).toHaveProperty(key);
    }

    expect(data.winnerVariantId).toBe('b');
    // The two scales the card must not confuse. `decimal` comes back as a
    // STRING and the scores are fractions of 1; confidencePct is already 0–100.
    expect(typeof data.winnerScore).toBe('string');
    expect(Number(data.winnerScore)).toBeCloseTo(0.184, 6);
    expect(Number(data.runnerUpScore)).toBeCloseTo(0.092, 6);
    expect(Number(data.confidencePct)).toBeCloseTo(97.3, 2);
    expect(data.holdbackCount).toBe(800);
    expect(data.autoSendDispatched).toBe(true);
    expect(data.decision).toBe('auto_send');
  });

  it('answers null while no winner has been picked, which is how the card says "still running"', async () => {
    expect(await get(`/api/v1/campaigns/${plainCampaignId}/ab-result`)).toBeNull();
  });

  it('returns abConfig on the campaign itself, which is where the variants come from', async () => {
    const campaign = (await get(`/api/v1/campaigns/${abCampaignId}`)) as {
      abConfig: { variants: { id: string; subject: string; percentage: number }[] };
    };
    expect(campaign.abConfig.variants.map((v) => v.id)).toEqual(['a', 'b']);
    expect(campaign.abConfig.variants[1]!.subject).toBe('Jenom dnes');
    // 100 − (10 + 10) = 80 % holdback, which the card computes from these.
    expect(campaign.abConfig.variants.reduce((s, v) => s + v.percentage, 0)).toBe(20);
  });
});
