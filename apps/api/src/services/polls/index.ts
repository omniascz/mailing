/**
 * Recording a poll vote, and the three decisions inside it.
 *
 * ─── 1. A second click does not change the answer ────────────────────────────
 *
 * Mail clients and security products fetch links before a human sees them —
 * Outlook Safe Links walks every URL in a message. So a vote URL is going to be
 * requested more than once, and often by nobody. First vote wins: the insert
 * carries `onConflictDoNothing` against the (campaign, block, contact) unique
 * index, and a later click is read back and reported, not applied.
 *
 * Counting every click would let a scanner outvote the recipient. Overwriting
 * on each click would mean the last scanner to run decides, which is worse: it
 * looks like the recipient changed their mind. Neither is a poll.
 *
 * ─── 2. The label is resolved from the campaign, not from the URL ────────────
 *
 * The token carries an option INDEX. The label is looked up in the campaign's
 * stored schema at vote time and snapshotted onto the row. If the label came
 * from the URL, a recipient could vote for an answer that was never offered by
 * typing one in; if it were only referenced by index, editing the block after
 * the send would silently rewrite what people voted for.
 *
 * ─── 3. The answer lands on the contact as a custom field ────────────────────
 *
 * Because that is what the segment builder reads: query-builder.ts:91 emits
 * `contacts.custom_fields ->> key`. A tag would say only that they answered,
 * not what. The key is `poll_<blockId>` so two polls in one campaign do not
 * collide and a segment can name one of them.
 */
import { and, eq } from 'drizzle-orm';
import { readCampaignContent } from '@forgemsg/editor/schema';
import type { PollVotePayload } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import { campaigns, contacts, pollVotes } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface RecordedVote {
  question: string;
  /** The answer that counts — the earlier one if this is a repeat click. */
  optionLabel: string;
  /** True when an earlier vote already existed and this click changed nothing. */
  alreadyVoted: boolean;
}

/**
 * The custom-field key a poll answer is stored under.
 *
 * Underscore, not a colon: the segment builder validates custom field keys
 * against `/^[A-Za-z0-9_-]{1,64}$/` (query-builder.ts:88) and refuses anything
 * else. A key the segment builder cannot name is a key the answer cannot be
 * segmented on, which is the whole reason it is stored on the contact.
 */
export function pollFieldKey(blockId: string): string {
  return `poll_${blockId}`;
}

interface PollBlockShape {
  id: string;
  type: string;
  question?: unknown;
  options?: unknown;
}

export async function recordPollVote(payload: PollVotePayload): Promise<RecordedVote> {
  const [campaign] = await db
    .select({ id: campaigns.id, content: campaigns.content })
    .from(campaigns)
    .where(and(eq(campaigns.id, payload.campaignId), eq(campaigns.orgId, payload.orgId)))
    .limit(1);
  if (!campaign) throw AppError.notFound('Campaign');

  const parsed = readCampaignContent((campaign.content ?? {}) as Record<string, unknown>);
  const blocks = (parsed.schema?.blocks ?? []) as unknown as PollBlockShape[];
  const block = blocks.find((b) => b.id === payload.blockId && b.type === 'poll');
  if (!block) throw AppError.notFound('Poll');

  const options = Array.isArray(block.options) ? (block.options as string[]) : [];
  const optionLabel = options[payload.optionIndex];
  // The signature covers the index, so this is not a tampering check — it is the
  // case where the block was edited after the send and now has fewer answers.
  if (typeof optionLabel !== 'string') {
    throw AppError.badRequest('That answer is no longer part of this poll');
  }
  const question = typeof block.question === 'string' ? block.question : '';

  const [contact] = await db
    .select({ id: contacts.id, customFields: contacts.customFields })
    .from(contacts)
    .where(and(eq(contacts.id, payload.contactId), eq(contacts.orgId, payload.orgId)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact');

  const inserted = await db
    .insert(pollVotes)
    .values({
      orgId: payload.orgId,
      campaignId: payload.campaignId,
      contactId: payload.contactId,
      blockId: payload.blockId,
      optionIndex: payload.optionIndex,
      optionLabel,
    })
    .onConflictDoNothing()
    .returning({ id: pollVotes.id });

  if (inserted.length === 0) {
    // Somebody — or something — already voted. Report the answer that stands.
    const [existing] = await db
      .select({ optionLabel: pollVotes.optionLabel })
      .from(pollVotes)
      .where(
        and(
          eq(pollVotes.campaignId, payload.campaignId),
          eq(pollVotes.blockId, payload.blockId),
          eq(pollVotes.contactId, payload.contactId),
        ),
      )
      .limit(1);
    return { question, optionLabel: existing?.optionLabel ?? optionLabel, alreadyVoted: true };
  }

  const current = (contact.customFields ?? {}) as Record<string, unknown>;
  await db
    .update(contacts)
    .set({ customFields: { ...current, [pollFieldKey(payload.blockId)]: optionLabel } })
    .where(eq(contacts.id, payload.contactId));

  return { question, optionLabel, alreadyVoted: false };
}

export interface PollResult {
  blockId: string;
  question: string;
  options: { index: number; label: string; votes: number }[];
  totalVotes: number;
}

/** Per-answer counts for every poll in a campaign. */
export async function pollResultsForCampaign(
  orgId: string,
  campaignId: string,
): Promise<PollResult[]> {
  const [campaign] = await db
    .select({ content: campaigns.content })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!campaign) throw AppError.notFound('Campaign');

  const parsed = readCampaignContent((campaign.content ?? {}) as Record<string, unknown>);
  const blocks = (parsed.schema?.blocks ?? []) as unknown as PollBlockShape[];
  const polls = blocks.filter((b) => b.type === 'poll');
  if (polls.length === 0) return [];

  const rows = await db
    .select({ blockId: pollVotes.blockId, optionIndex: pollVotes.optionIndex })
    .from(pollVotes)
    .where(and(eq(pollVotes.orgId, orgId), eq(pollVotes.campaignId, campaignId)));

  return polls.map((block) => {
    const options = Array.isArray(block.options) ? (block.options as string[]) : [];
    const counts = options.map((label, index) => ({
      index,
      label,
      votes: rows.filter((r) => r.blockId === block.id && r.optionIndex === index).length,
    }));
    return {
      blockId: block.id,
      question: typeof block.question === 'string' ? block.question : '',
      options: counts,
      totalVotes: counts.reduce((sum, o) => sum + o.votes, 0),
    };
  });
}
