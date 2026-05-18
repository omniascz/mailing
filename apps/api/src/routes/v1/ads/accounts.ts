import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { initiateAdOAuth, handleAdOAuthCallback, listAdAccounts, disconnectAdAccount } from '../../../services/ads/accounts.js';
import { AD_PLATFORMS } from '../../../db/schema/ad-accounts.js';

const adAccountRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  const callbackBase = process.env.API_BASE_URL ?? 'http://localhost:3001';
  const platformSchema = z.enum(AD_PLATFORMS);

  app.get('/api/v1/ads/accounts', auth, async (req, reply) => {
    const data = await listAdAccounts(req.user!.orgId);
    return reply.send({ data });
  });

  app.get('/api/v1/ads/accounts/connect/:platform', auth, async (req, reply) => {
    const { platform } = z.object({ platform: platformSchema }).parse(req.params);
    const authUrl = await initiateAdOAuth(req.user!.orgId, req.user!.userId, platform, callbackBase);
    return reply.send({ data: { authUrl } });
  });

  app.get('/api/v1/ads/accounts/callback/:platform', async (req, reply) => {
    const { platform } = z.object({ platform: platformSchema }).parse(req.params);
    const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    const data = await handleAdOAuthCallback(platform, code, state, callbackBase);
    return reply.send({ data });
  });

  app.delete('/api/v1/ads/accounts/:accountId', auth, async (req, reply) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(req.params);
    await disconnectAdAccount(req.user!.orgId, accountId);
    return reply.code(204).send();
  });
};

export default adAccountRoutes;
