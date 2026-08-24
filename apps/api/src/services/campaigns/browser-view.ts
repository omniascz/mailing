/**
 * View-in-browser (#3) — renders a hosted copy of the exact email a contact
 * received, from a signed `view` token. Stateless: re-renders from the campaign
 * content + contact instead of storing per-recipient HTML.
 *
 * Content shapes are resolved by readCampaignContent, the same function the
 * send path uses, so the archive cannot disagree with the email about which
 * branch a campaign takes. It disagreed for `{ schema, html }` — the shape the
 * visual editor writes — because both asked `'blocks' in content` and both got
 * false.
 *
 * Raw `{ html }` still cannot go through the block renderer (see the note at
 * the bottom), but it does not reach this page unsanitised: it is a browser
 * page on our own domain, where a `<script>` the customer typed stops being a
 * tag a mail client ignores and starts executing.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, contacts, organizations } from '../../db/schema/index.js';
import { verifyTrackingToken, createTrackingToken } from '@forgemsg/shared';
import {
  renderEmail as renderBlocks,
  parseMergeTags,
  sanitizeUserHtml,
} from '@forgemsg/editor/render';
import { readCampaignContent } from '@forgemsg/editor/schema';
import type { MergeTagContext } from '@forgemsg/editor/render';

const UNSUB_TTL_TS = () => Math.floor(Date.now() / 1000);

export async function renderCampaignForToken(token: string): Promise<string | null> {
  const payload = verifyTrackingToken(token);
  if (!payload || payload.type !== 'view') return null;
  const { orgId, campaignId, contactId } = payload;

  const [campaign] = await db
    .select({
      content: campaigns.content,
      subject: campaigns.subject,
      preheader: campaigns.preheader,
      utmTracking: campaigns.utmTracking,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!campaign) return null;

  const [contact] = await db
    .select({
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  const [org] = await db
    .select({ companyName: organizations.companyName, postalAddress: organizations.postalAddress })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Rebuild the same merge context the send used so the copy matches.
  const prefToken = createTrackingToken({ type: 'pref', orgId, contactId, ts: UNSUB_TTL_TS() });
  const unsubToken = createTrackingToken({
    type: 'unsub',
    orgId,
    contactId,
    campaignId,
    ts: UNSUB_TTL_TS(),
  });
  const ctx: MergeTagContext = {
    contact: contact
      ? {
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          ...((contact.customFields as Record<string, unknown>) ?? {}),
        }
      : null,
    system: {
      unsubscribeUrl: `/api/v1/unsubscribe/${unsubToken}`,
      preferenceCenterUrl: `/p/center/${prefToken}`,
      currentDate: new Date().toISOString().slice(0, 10),
      currentYear: String(new Date().getFullYear()),
      companyName: org?.companyName ?? undefined,
      companyAddress: org?.postalAddress ?? undefined,
    },
  };

  const content = (campaign.content ?? {}) as Record<string, unknown>;

  // Blocks, or the visual editor's { schema, html } — full editor render.
  const parsed = readCampaignContent(content, campaign.preheader ?? undefined);
  if (parsed.schema) {
    return renderBlocks(parsed.schema, { context: ctx }).html;
  }
  if (parsed.error) {
    console.warn(`[browser-view] ${parsed.shape} content did not parse:`, parsed.error);
  }

  // Raw { html } → merge tags, then the allowlist.
  //
  // Not the block renderer: this shape holds a complete document, and the
  // allowlist has no `html`, `head`, `body` or `style`, so rendering it as a
  // code block would drop the whole stylesheet an externally-designed email
  // depends on. What it does get is the SAME sanitizeUserHtml the code block
  // runs — one allowlist, not a second opinion — which is what stops a
  // `<script>` in customer content from executing on our domain. The document
  // wrapper goes with it; the visible body does not.
  const html = (content as { html?: string }).html;
  if (typeof html === 'string' && html) {
    return sanitizeUserHtml(parseMergeTags(html, ctx));
  }

  return null;
}
