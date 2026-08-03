import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  computeFatigueScore,
  batchFatigueScores,
  getMostFatiguedContacts,
} from '../../services/campaigns/fatigue-score.js';
import {
  computeUnsubscribeRisk,
  getAtRiskContacts,
} from '../../services/contacts/unsubscribe-prediction.js';

export default async function campaignFatigueRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** Get Email Pressure Index for a single contact. */
  app.get('/api/v1/campaign-fatigue/:contactId', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const [fatigue, unsubRisk] = await Promise.all([
      computeFatigueScore(req.user!.orgId, contactId),
      computeUnsubscribeRisk(req.user!.orgId, contactId),
    ]);
    return { data: { fatigue, unsubRisk } };
  });

  /** Batch EPI for up to 200 contacts. */
  app.post('/api/v1/campaign-fatigue/batch', async (req) => {
    const body = z
      .object({ contactIds: z.array(z.string().uuid()).min(1).max(200) })
      .parse(req.body);
    const scores = await batchFatigueScores(req.user!.orgId, body.contactIds);
    return { data: scores };
  });

  /** Most fatigued contacts org-wide. */
  app.get('/api/v1/campaign-fatigue/most-fatigued', async (req) => {
    const q = z
      .object({
        minEpi: z.coerce.number().int().min(0).max(100).default(60),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const contacts = await getMostFatiguedContacts(req.user!.orgId, q.minEpi, q.limit);
    return { data: contacts };
  });

  /** At-risk contacts (high unsubscribe prediction). */
  app.get('/api/v1/campaign-fatigue/at-risk', async (req) => {
    const q = z
      .object({
        minRisk: z.coerce.number().min(0).max(1).default(0.6),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .parse(req.query);
    const contacts = await getAtRiskContacts(req.user!.orgId, q.minRisk, q.limit);
    return { data: contacts };
  });
}
