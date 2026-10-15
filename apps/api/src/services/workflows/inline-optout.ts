/**
 * The opt-out of an inline e-mail from a flow — the one place that adds it.
 *
 * An inline e-mail (a flow's send_email with config.html, a personal e-mail, a
 * review request, a sales-sequence step) goes from
 * /api/v1/internal/workflow/send-email straight to sendTransactionalEmail with
 * the html and text the job carried. Nothing renders it, so nothing gave it
 * what the renderer gives every campaign and every templated flow e-mail: a
 * footer naming the sender with a link to unsubscribe, and List-Unsubscribe
 * headers. A marketing message without them is an unsolicited commercial
 * communication under § 7(4) of 480/2004 Sb. — measured in Z151, Z152 and
 * Z156: headers {}, no link, no sender, and the seeded ticketing wrapper's
 * literal {{unsubscribe}} delivered as text.
 *
 * Michal, 14. 10. 22:10, point 2: the system adds the unsubscribe link and the
 * footer to the inline flow e-mail itself (marketing nodes). The
 * commissioner's decisions a–h (DENIK.md, 15. 10.) fix the rest, and this
 * module follows them:
 *  a) every inline e-mail sent with purpose 'workflow_marketing' gets the
 *     footer — `marketing` true;
 *  b) an e-mail with the flow's transactional exception (Z156) gets neither
 *     the footer nor List-Unsubscribe — `marketing` false;
 *  c) {{unsubscribe}} and {{unsubscribe_url}} are replaced with a working
 *     link in EVERY inline e-mail, the exception included: a literal tag in a
 *     delivered e-mail is a bug (Z156 MIMO 1);
 *  d) the link is the signed unsub token on /api/v1/unsubscribe/:token that
 *     batch-sender builds for a templated flow e-mail — same shared
 *     createTrackingToken, no campaignId (there is no campaign), and the same
 *     host (resolveTrackingBaseUrl, which batch-sender reads over
 *     /internal/tracking-domain);
 *  e) the sender is the org's companyName + postalAddress, read by
 *     resolveOrgFooterIdentity — the function the templated flow e-mail uses;
 *  f) List-Unsubscribe + List-Unsubscribe-Post: List-Unsubscribe=One-Click in
 *     batch-sender's form, the mailto only with UNSUBSCRIBE_MAILBOX;
 *  g) the footer is in Czech (recipients get Czech e-mails, by law): the
 *     renderer's own Czech label and sender lines (unsubscribeLabel('cs'),
 *     postalAddressLines), so it reads the same as a campaign's;
 *  h) the stream (transactional), the plan counter and the move to
 *     batch-sender are not changed here.
 *
 * With no postal address the renderer prints no sender lines — the name alone
 * is not printed either — and the campaign and the templated flow e-mail are
 * sent all the same (measured, Z157 probe 3). postalAddressLines makes this
 * footer behave identically: link only, no new refusal.
 *
 * The footer is appended even when the html already carries a link: two links
 * are acceptable, none is not. Z157.
 */

import { eq } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { postalAddressLines, unsubscribeLabel } from '@forgemsg/editor/render';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { resolveTrackingBaseUrl } from '../sending/tracking-base-url.js';
import { escapeHtml } from '../rss/email-schema.js';

/**
 * {{unsubscribe}} or {{unsubscribe_url}}, spaces inside the braces allowed — the
 * forms the tag parser accepts, as UNRESOLVED_OPT_OUT_TAG in the workers'
 * optout-guard.ts. {{unsubscribe}} is what the seeded ticketing wrapper writes
 * (services/ticketing/seed-workflows.ts); batch-sender knows only the _url form.
 */
const OPT_OUT_TAG_SOURCE = String.raw`\{\{\s*unsubscribe(?:_url)?\s*\}\}`;

function hasOptOutTag(s: string | undefined): boolean {
  return !!s && new RegExp(OPT_OUT_TAG_SOURCE).test(s);
}

function replaceOptOutTags(s: string, url: string): string {
  // A function, so a `$` in the URL is never read as a replacement pattern.
  return s.replace(new RegExp(OPT_OUT_TAG_SOURCE, 'g'), () => url);
}

export interface InlineOptOutInput {
  orgId: string;
  contactId: string;
  html: string;
  text?: string;
  /** False only for the flow's transactional exception (Z156). */
  marketing: boolean;
}

export interface InlineOptOut {
  html: string;
  text?: string;
  customHeaders: Record<string, string>;
}

/** What the footer and the headers are made of, resolved by applyInlineOptOut. */
export interface InlineOptOutParts {
  unsubscribeUrl: string;
  unsubToken: string;
  companyName?: string;
  companyAddress?: string;
  /** UNSUBSCRIBE_MAILBOX; absent = no mailto. */
  mailbox?: string;
}

/**
 * Put the parts into the message. No I/O, so a test can call it.
 *
 * - The tags are replaced always.
 * - Marketing only: the footer goes before the last </body> (at the end when
 *   there is none) and at the end of the text, and List-Unsubscribe(-Post) is
 *   returned. A message with no text part gets one holding the footer, so both
 *   halves of the multipart carry the opt-out, as on the campaign path.
 */
export function composeInlineOptOut(
  message: { html: string; text?: string; marketing: boolean },
  parts: InlineOptOutParts,
): InlineOptOut {
  const url = parts.unsubscribeUrl;
  let html = replaceOptOutTags(message.html, url);
  let text = message.text === undefined ? undefined : replaceOptOutTags(message.text, url);
  if (!message.marketing) return { html, text, customHeaders: {} };

  const ctx = { system: { companyName: parts.companyName, companyAddress: parts.companyAddress } };
  const lines = postalAddressLines(ctx);
  const label = unsubscribeLabel('cs');

  // The renderer's compliance footer (apps/editor render.ts complianceFooter),
  // as a block instead of a table row: the inline html is not the renderer's
  // table, so a <tr> would have no parent.
  const colour = '#6b7280';
  const sender = lines.length
    ? `<div style="margin-top:8px;">${lines.map((l) => escapeHtml(l)).join('<br/>')}</div>`
    : '';
  const footerHtml =
    `<div data-fm-optout="1" style="padding:16px 24px;font-size:12px;color:${colour};text-align:center;">` +
    `${sender}<div style="margin-top:8px;"><a href="${escapeHtml(url)}" style="color:${colour};text-decoration:underline;">${escapeHtml(label)}</a></div>` +
    `</div>`;
  const at = html.toLowerCase().lastIndexOf('</body>');
  html = at < 0 ? html + footerHtml : html.slice(0, at) + footerHtml + html.slice(at);

  // The plain-text renderer's footer (plain-text.ts complianceFooter): the
  // sender lines, then "label: url", after a blank line.
  const footerText = [...lines, `${label}: ${url}`].join('\n');
  text = text?.trim() ? `${text}\n\n${footerText}` : footerText;

  // batch-sender's List-Unsubscribe: the https URI always, the mailto only
  // when there is a mailbox behind it.
  const listUnsubscribe = parts.mailbox
    ? `<mailto:${parts.mailbox}?subject=${parts.unsubToken}>, <${url}>`
    : `<${url}>`;
  return {
    html,
    text,
    customHeaders: {
      'List-Unsubscribe': listUnsubscribe,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * Who sent it, for the footer: the same two columns the campaign dispatch reads
 * (services/campaigns/dispatch.ts). The renderer appends the name and postal
 * address to the footer, and only when it has an address; a flow that left
 * them out sent every email with no sender in it.
 *
 * Moved here from routes/v1/internal/workflow-dispatch.ts, whose templated
 * branch still calls it for batch-sender, so the inline footer reads the very
 * same function (Z157, decision e).
 */
export async function resolveOrgFooterIdentity(
  orgId: string,
): Promise<{ companyName?: string; companyAddress?: string }> {
  const [org] = await db
    .select({ companyName: organizations.companyName, postalAddress: organizations.postalAddress })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return {
    companyName: org?.companyName ?? undefined,
    companyAddress: org?.postalAddress ?? undefined,
  };
}

/**
 * The inline e-mail as it should leave: tags replaced; for marketing also the
 * footer and the List-Unsubscribe headers.
 *
 * Reads the database only when there is something to add: the tracking host
 * when a link is needed, the sender only for marketing. An exception e-mail
 * without a tag goes through untouched and costs no query.
 */
export async function applyInlineOptOut(input: InlineOptOutInput): Promise<InlineOptOut> {
  if (!input.marketing && !hasOptOutTag(input.html) && !hasOptOutTag(input.text)) {
    return { html: input.html, text: input.text, customHeaders: {} };
  }

  const { baseUrl } = await resolveTrackingBaseUrl(input.orgId);
  // batch-sender's token for a flow's templated e-mail: no campaignId, since
  // the event the unsubscribe writes has a foreign key to campaigns and a flow
  // has no campaign.
  const unsubToken = createTrackingToken({
    type: 'unsub',
    orgId: input.orgId,
    contactId: input.contactId,
    ts: Math.floor(Date.now() / 1000),
  });

  const identity = input.marketing ? await resolveOrgFooterIdentity(input.orgId) : {};

  return composeInlineOptOut(input, {
    unsubscribeUrl: `${baseUrl}/api/v1/unsubscribe/${unsubToken}`,
    unsubToken,
    ...identity,
    mailbox: env.UNSUBSCRIBE_MAILBOX,
  });
}
