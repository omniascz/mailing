/**
 * Ad platform lead form webhooks (#304).
 * Facebook Lead Ads and LinkedIn Lead Gen Forms push leads here.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { handleFacebookLead, handleLinkedInLead } from '../../../services/ads/lead-sync.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { adAccounts } from '../../../db/schema/index.js';
import { verifyMetaRequest } from '../../../lib/meta-signature.js';
import { env } from '../../../config/env.js';

/**
 * The sponsored ad account id out of a LinkedIn lead notification `owner`.
 *
 * LinkedIn names the owner of every lead it pushes, and for `leadType:
 * SPONSORED` that owner is a sponsored ad account URN —
 * `urn:li:sponsoredAccount:<id>`. The `<id>` is the same string
 * services/ads/accounts.ts reads from /adAccounts and stores in
 * ad_accounts.platform_account_id for linkedin_ads (:127-133, :195), so it is
 * the one thing in the payload that says whose lead this is. A bare id is
 * accepted too — the URN prefix is the only part of the shape that varies.
 *
 * Returns '' when the payload names no account; the caller must then write
 * nothing rather than choose an organisation of its own.
 */
function sponsoredAccountId(owner: unknown): string {
  const raw =
    typeof owner === 'string'
      ? owner
      : typeof (owner as { sponsoredAccount?: unknown } | null)?.sponsoredAccount === 'string'
        ? (owner as { sponsoredAccount: string }).sponsoredAccount
        : '';
  const trimmed = raw.trim();
  const prefix = 'urn:li:sponsoredAccount:';
  return (trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed).trim();
}

const adsWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Facebook Lead Ads webhook verification + delivery
  app.get('/api/v1/webhooks/ads/facebook/leads', async (req, reply) => {
    const q = z
      .object({
        'hub.mode': z.string(),
        'hub.challenge': z.string(),
        'hub.verify_token': z.string(),
      })
      .parse(req.query);
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === env.FACEBOOK_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send('Verification failed');
  });

  app.post('/api/v1/webhooks/ads/facebook/leads', async (req, reply) => {
    // Verify Meta's signature before ingesting leads (forged payloads would
    // create fake contacts + fire lead workflows).
    if (!verifyMetaRequest(req, process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET)) {
      return reply.code(401).send('Invalid signature');
    }
    const body = req.body as Record<string, unknown>;
    const entries =
      (body.entry as Array<{ id: string; changes: Array<{ value: Record<string, unknown> }> }>) ??
      [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (value.form_id) {
          // Find the org for this page. Two rows, not one: ad_accounts is
          // unique on (org_id, platform, platform_account_id), which is per
          // organisation, so two of them can register the same page id. Taking
          // the first row then hands the lead to whichever one Postgres returns
          // first and tells the other nothing.
          const pageId = String(entry.id);
          // eslint-disable-next-line forgemsgOrg/require-org-scope -- resolves the org
          const matches = await db
            .select()
            .from(adAccounts)
            .where(
              and(
                eq(adAccounts.platform, 'facebook_ads'),
                eq(adAccounts.platformAccountId, pageId),
              ),
            )
            .limit(2);

          const account = matches.length === 1 ? matches[0] : undefined;
          if (!account) {
            // Nothing written, and still the 200 below: Meta disables a
            // subscription whose endpoint keeps failing, so answering with an
            // error would cost the leads that do resolve.
            if (matches.length > 1) {
              req.log.warn(
                { pageId, matched: matches.length },
                'facebook lead webhook: page claimed by several organisations, dropping',
              );
            }
            continue;
          }

          await handleFacebookLead(account.orgId, {
            leadgenId: String(value.leadgen_id ?? ''),
            pageId,
            adId: String(value.ad_id ?? ''),
            formId: String(value.form_id ?? ''),
            fieldData: (value.field_data as Array<{ name: string; values: string[] }>) ?? [],
            createdTime: Number(value.created_time ?? Date.now() / 1000),
          }).catch(console.error);
        }
      }
    }
    return reply.code(200).send('OK');
  });

  // LinkedIn Lead Gen Form webhook
  app.post('/api/v1/webhooks/ads/linkedin/leads', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const leads = (body.leads as Array<Record<string, unknown>>) ?? [];

    for (const lead of leads) {
      const campaignId = String(lead.campaignId ?? '');

      // Whose lead this is comes from the payload, not from the table order.
      // The previous query filtered on the platform alone and took the first
      // row, so every customer's leads were written into one arbitrary
      // organisation — with its automations fired on a stranger's details.
      const accountId = sponsoredAccountId(lead.owner ?? body.owner);
      if (!accountId) {
        req.log.warn(
          { leadId: String(lead.leadId ?? '') },
          'linkedin lead webhook: notification names no sponsored account, dropping',
        );
        continue;
      }

      // Two rows, not one: ad_accounts is unique on (org_id, platform,
      // platform_account_id), so nothing stops two organisations from claiming
      // the same ad account id. If both do, there is no answer to whose lead
      // this is and taking either one would be the same bug again.
      //
      // It carries no orgId because this lookup IS how the organisation is
      // determined; the ambiguity check is what keeps it from returning an
      // arbitrary tenant the way the previous query did.
      // eslint-disable-next-line forgemsgOrg/require-org-scope -- resolves the org
      const matches = await db
        .select()
        .from(adAccounts)
        .where(
          and(eq(adAccounts.platform, 'linkedin_ads'), eq(adAccounts.platformAccountId, accountId)),
        )
        .limit(2);

      const account = matches.length === 1 ? matches[0] : undefined;
      if (!account) {
        // Nothing written, and still a 200 below: LinkedIn retries anything
        // else, so an error here would mean the same undeliverable lead
        // arriving for as long as it keeps trying.
        req.log.warn(
          { accountId, matched: matches.length, leadId: String(lead.leadId ?? '') },
          matches.length === 0
            ? 'linkedin lead webhook: no ad account for this sponsored account, dropping'
            : 'linkedin lead webhook: sponsored account claimed by several organisations, dropping',
        );
        continue;
      }

      await handleLinkedInLead(account.orgId, {
        leadId: String(lead.leadId ?? ''),
        campaignId,
        formId: String(lead.formId ?? ''),
        fields: (lead.fieldValues as Array<{ name: string; value: string }>) ?? [],
      }).catch(console.error);
    }
    return reply.code(200).send('OK');
  });
};

export default adsWebhookRoutes;
