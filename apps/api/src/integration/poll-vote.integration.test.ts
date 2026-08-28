/**
 * A poll vote, end to end against a real database.
 *
 * The three things that decide whether a poll is a poll:
 *
 *   - a link that carries somebody's identity has to be signed, or anyone can
 *     vote as anybody by editing a URL;
 *   - a second request must not move the number, because mail clients and
 *     security scanners fetch every link in a message before a human sees it;
 *   - the answer has to land where the segment builder can find it, or
 *     "segment on the answer" is a claim rather than a feature.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { db } from '../db/client.js';
import { organizations, campaigns, contacts, pollVotes } from '../db/schema/index.js';
import { createTestApp } from './setup/harness.js';
import { buildSegmentWhere } from '../services/segments/query-builder.js';

const TAG = `poll-${randomUUID().slice(0, 8)}`;
const BLOCK_ID = 'p1';

let app: FastifyInstance;
let orgId: string;
let campaignId: string;
let contactId: string;
let otherContactId: string;

const pollBlock = {
  id: BLOCK_ID,
  type: 'poll',
  question: 'Jak se vám líbil tenhle e-mail?',
  options: ['Skvělý', 'Ujde', 'Nic moc'],
  helpText: '',
  align: 'left',
  fontSize: '15px',
  color: '#111827',
  buttonBackgroundColor: '#f3f4f6',
  buttonTextColor: '#111827',
};

function voteToken(over: Partial<Record<string, unknown>> = {}): string {
  return createTrackingToken({
    type: 'poll',
    orgId,
    campaignId,
    contactId,
    blockId: BLOCK_ID,
    optionIndex: 0,
    ts: Math.floor(Date.now() / 1000),
    ...over,
  } as never);
}

const vote = (token: string) => app.inject({ method: 'GET', url: `/api/v1/poll/${token}` });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: `${TAG} org`, slug: `${TAG}-org` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `${TAG} campaign`,
      type: 'email',
      subject: 'Anketa',
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
        blocks: [pollBlock],
      },
    })
    .returning({ id: campaigns.id });
  campaignId = c!.id;

  const [ct] = await db
    .insert(contacts)
    .values({ orgId, email: `${TAG}-voter@example.test`, firstName: 'Jana', status: 'active' })
    .returning({ id: contacts.id });
  contactId = ct!.id;

  const [other] = await db
    .insert(contacts)
    .values({ orgId, email: `${TAG}-other@example.test`, firstName: 'Petr', status: 'active' })
    .returning({ id: contacts.id });
  otherContactId = other!.id;
}, 120_000);

afterAll(async () => {
  await db.delete(pollVotes).where(eq(pollVotes.orgId, orgId));
  await db.delete(campaigns).where(eq(campaigns.orgId, orgId));
  await db.delete(contacts).where(eq(contacts.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
}, 120_000);

async function votesFor(cid: string) {
  return db.select().from(pollVotes).where(eq(pollVotes.contactId, cid));
}

describe('a vote link that cannot be verified records nothing', () => {
  it('a tampered token is refused', async () => {
    // Flip the last character of the signature. This is the attack the whole
    // token exists for: without a signature, changing contactId in a URL votes
    // as somebody else.
    const good = voteToken();
    const tampered = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');

    const res = await vote(tampered);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Tenhle odkaz neplatí');
    expect(await votesFor(contactId)).toHaveLength(0);
  }, 120_000);

  it('a token signed for a different contact cannot be re-pointed', async () => {
    // Take a legitimate token for someone else and swap the payload: the
    // signature no longer matches, so nothing is recorded for either of them.
    const forOther = createTrackingToken({
      type: 'poll',
      orgId,
      campaignId,
      contactId: otherContactId,
      blockId: BLOCK_ID,
      optionIndex: 1,
      ts: Math.floor(Date.now() / 1000),
    } as never);
    const [encoded, sig] = forOther.split('.');
    const swapped = Buffer.from(
      JSON.stringify({
        type: 'poll',
        orgId,
        campaignId,
        contactId,
        blockId: BLOCK_ID,
        optionIndex: 1,
        ts: Math.floor(Date.now() / 1000),
      }),
    )
      .toString('base64url')
      .replace(/=+$/, '');
    expect(swapped).not.toBe(encoded);

    const res = await vote(`${swapped}.${sig}`);
    expect(res.statusCode).toBe(400);
    expect(await votesFor(contactId)).toHaveLength(0);
    expect(await votesFor(otherContactId)).toHaveLength(0);
  }, 120_000);

  it('a token of another kind is not accepted as a vote', async () => {
    // The unsubscribe token is signed with the same secret. Type is part of the
    // payload precisely so one cannot be spent as the other.
    const unsub = createTrackingToken({
      type: 'unsub',
      orgId,
      contactId,
      ts: Math.floor(Date.now() / 1000),
    });
    const res = await vote(unsub);
    expect(res.statusCode).toBe(400);
    expect(await votesFor(contactId)).toHaveLength(0);
  }, 120_000);
});

describe('a valid vote is recorded, once', () => {
  it('records the answer and confirms it on a page', async () => {
    const res = await vote(voteToken({ optionIndex: 2 }));
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
    expect(res.body).toContain('Nic moc');
    expect(res.body).toContain('Jak se vám líbil tenhle e-mail?');

    const rows = await votesFor(contactId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ optionIndex: 2, optionLabel: 'Nic moc', blockId: BLOCK_ID });
  }, 120_000);

  it('a repeated click — a scanner prefetching the link — changes nothing', async () => {
    await vote(voteToken({ optionIndex: 2 }));
    await vote(voteToken({ optionIndex: 2 }));
    const rows = await votesFor(contactId);
    expect(rows, 'a prefetch became a second vote').toHaveLength(1);
  }, 120_000);

  it('clicking a DIFFERENT answer afterwards does not overwrite the first', async () => {
    // First vote wins, and the page says so rather than pretending.
    const res = await vote(voteToken({ optionIndex: 0 }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Nic moc');
    expect(res.body).toContain('už dřív');

    const rows = await votesFor(contactId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.optionIndex).toBe(2);
  }, 120_000);
});

describe('the answer lands where a segment can find it', () => {
  it('is written to the contact as a custom field', async () => {
    const [row] = await db
      .select({ customFields: contacts.customFields })
      .from(contacts)
      .where(eq(contacts.id, contactId));
    expect((row!.customFields as Record<string, unknown>)[`poll_${BLOCK_ID}`]).toBe('Nic moc');
  }, 120_000);

  it('and the segment builder selects the contact by that answer', async () => {
    // The point of storing it as a custom field rather than a tag: the value is
    // queryable, so "everyone who answered X" is an ordinary segment.
    const where = buildSegmentWhere({
      operator: 'AND',
      rules: [{ field: `custom.poll_${BLOCK_ID}`, op: 'eq', value: 'Nic moc' }],
    } as never);
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), where));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(contactId);
    expect(ids).not.toContain(otherContactId);
  }, 120_000);
});

describe('the campaign report counts the answers', () => {
  it('reports one vote for the answer that was chosen and none for the others', async () => {
    const { pollResultsForCampaign } = await import('../services/polls/index.js');
    const results = await pollResultsForCampaign(orgId, campaignId);
    expect(results).toHaveLength(1);
    expect(results[0]!.question).toBe('Jak se vám líbil tenhle e-mail?');
    expect(results[0]!.totalVotes).toBe(1);
    expect(results[0]!.options.find((o) => o.label === 'Nic moc')!.votes).toBe(1);
    expect(results[0]!.options.find((o) => o.label === 'Skvělý')!.votes).toBe(0);
  }, 120_000);
});
