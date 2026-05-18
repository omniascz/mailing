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

const adsWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Facebook Lead Ads webhook verification + delivery
  app.get('/api/v1/webhooks/ads/facebook/leads', async (req, reply) => {
    const q = z.object({
      'hub.mode': z.string(),
      'hub.challenge': z.string(),
      'hub.verify_token': z.string(),
    }).parse(req.query);
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === (process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? '')) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send('Verification failed');
  });

  app.post('/api/v1/webhooks/ads/facebook/leads', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const entries = (body.entry as Array<{ id: string; changes: Array<{ value: Record<string, unknown> }> }>) ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (value.form_id) {
          // Find the org for this page
          const pageId = String(entry.id);
          const [account] = await db
            .select()
            .from(adAccounts)
            .where(and(eq(adAccounts.platform, 'facebook_ads'), eq(adAccounts.platformAccountId, pageId)))
            .limit(1);

          if (!account) continue;

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
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(eq(adAccounts.platform, 'linkedin_ads'))
        .limit(1);

      if (!account) continue;

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
