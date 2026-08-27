/**
 * Refuse to send marketing mail whose body has no opt-out.
 *
 * ─── Why it is a module of its own ───────────────────────────────────────────
 *
 * It used to live inside batch-sender.ts, which opens Redis connections the
 * moment it is imported. So the only test that could reach it read the file as
 * TEXT and asserted on the source — and a source assertion cannot tell you the
 * guard throws, only that the word `throw` appears near it. That the guard
 * actually refuses an RSS campaign was first demonstrated by a live probe, not
 * by the suite that exists to demonstrate it.
 *
 * Moving the function here changes no behaviour: batch-sender imports it and
 * calls it in the same place with the same arguments. What changes is that a
 * test can call it.
 *
 * ─── What it is for ──────────────────────────────────────────────────────────
 *
 * The renderer is the barrier for block templates: it appends a compliance
 * footer when the template has none, so no template can produce marketing HTML
 * without an opt-out. This covers the paths it cannot reach — a campaign stored
 * as raw `{ html }`, copied to the wire as written, and anything the renderer
 * did not recognise at all.
 *
 * It throws rather than skipping the contact. A campaign that cannot produce a
 * lawful body is not a per-recipient problem; sending it to the other 9,999
 * would be the same violation nine thousand more times.
 */

import type { CampaignContentShape } from '@forgemsg/editor/schema';
import type { MessageStream } from '../queues/index.js';

/**
 * An opt-out merge tag a later step still has to resolve, in any of the forms
 * the tag parser accepts. Written as a named constant because the inline
 * version of this pattern had lost its escapes: `/{{s*unsubscribe_url/` reads
 * as "zero or more letters s", so `{{ unsubscribe_url }}` — spaces and all,
 * which the parser accepts — did not match, and the guard refused a campaign
 * that was in fact compliant.
 */
export const UNRESOLVED_OPT_OUT_TAG = /\{\{\s*unsubscribe_url/;

/** The two halves of the message, plus what readCampaignContent made of it. */
export interface OptOutCandidate {
  html: string;
  text: string;
  /**
   * Which branch of readCampaignContent produced this body. Only used to word
   * the failure — the check itself is the same for every shape.
   */
  shape: CampaignContentShape;
}

/**
 * What to tell the operator, given the shape the content actually had.
 *
 * The single sentence this replaces said "this is a raw-HTML campaign, so the
 * link has to be in the content — add {{unsubscribe_url}}" for EVERY shape.
 * For an RSS campaign that is twice wrong: it is not raw HTML, and the content
 * is generated from a feed by a cron, so there is nothing for the operator to
 * add it to. Advice that cannot be followed reads as a bug in the product,
 * which is what it was.
 */
function adviceFor(shape: CampaignContentShape): string {
  switch (shape) {
    case 'raw-html':
      return (
        'This campaign is stored as raw HTML, which the renderer does not touch, ' +
        'so the link has to be in the content — add {{unsubscribe_url}}.'
      );
    case 'blocks':
    case 'schema':
      return (
        'This campaign is a block template, which normally gets a compliance ' +
        'footer from the renderer. Getting here means the schema did not parse ' +
        'and the send fell back to the raw branch — fix the schema rather than ' +
        'the body.'
      );
    case 'unknown':
    default:
      return (
        'The renderer did not recognise this content as a block schema or as raw ' +
        'HTML, so nothing added a footer and the body is whatever the fallback ' +
        'produced. This is a bug in whatever wrote campaigns.content, not ' +
        'something to fix in the campaign.'
      );
  }
}

export function assertOptOutPresent(
  rendered: OptOutCandidate,
  stream: MessageStream,
  unsubscribeUrl: string,
  campaignId: string,
): void {
  if (stream === 'transactional') return;
  // Both halves of the multipart, because both are the message. Checking only
  // the HTML let a text alternative go out with no way to opt out — which is
  // the half a filter reads when it scores the message, and the half a reader
  // in a text-only client sees.
  const missing = (['html', 'text'] as const).filter(
    (part) =>
      !rendered[part].includes(unsubscribeUrl) && !UNRESOLVED_OPT_OUT_TAG.test(rendered[part]),
  );
  if (missing.length === 0) return;
  throw new Error(
    `Campaign ${campaignId}: rendered ${missing.join(' and ')} has no unsubscribe link. ` +
      `Marketing mail must carry one in every part. ${adviceFor(rendered.shape)}`,
  );
}
