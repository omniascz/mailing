/**
 * View-in-browser (#3) — renders a hosted copy of the exact email a contact
 * received, from a signed `view` token. Stateless: re-renders from the campaign
 * content + contact instead of storing per-recipient HTML.
 *
 * Handles both content shapes: block JSON (via the editor renderer) and the
 * legacy `{ html }` shape (merge-tag substitution only).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, contacts, organizations } from '../../db/schema/index.js';
import { verifyTrackingToken, createTrackingToken } from '@forgemsg/shared';
import { renderEmail as renderBlocks, parseMergeTags } from '@forgemsg/editor/render';
import { emailSchema } from '@forgemsg/editor/schema';
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
  const unsubToken = createTrackingToken({ type: 'unsub', orgId, contactId, campaignId, ts: UNSUB_TTL_TS() });
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

  // Block JSON → full editor render.
  if ('blocks' in content && Array.isArray((content as { blocks?: unknown }).blocks)) {
    const parsed = emailSchema.safeParse({ preheader: campaign.preheader ?? '', ...content });
    if (parsed.success) {
      return renderBlocks(parsed.data, { context: ctx }).html;
    }
  }

  // Legacy { html } → merge-tag substitution only.
  const html = (content as { html?: string }).html;
  if (typeof html === 'string' && html) {
    return parseMergeTags(html, ctx);
  }

  return null;
}
