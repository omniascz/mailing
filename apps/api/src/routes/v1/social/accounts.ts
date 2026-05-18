import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { initiateOAuth, handleOAuthCallback, listSocialAccounts, disconnectSocialAccount } from '../../../services/social/accounts.js';
import { SOCIAL_PLATFORMS } from '../../../db/schema/social-accounts.js';

const platformSchema = z.enum(SOCIAL_PLATFORMS);

const socialAccountRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  const callbackBase = process.env.API_BASE_URL ?? 'http://localhost:3001';

  // List connected accounts
  app.get('/api/v1/social/accounts', auth, async (req, reply) => {
    const data = await listSocialAccounts(req.user!.orgId);
    return reply.send({ data });
  });

  // Initiate OAuth (returns auth URL for redirect)
  app.get('/api/v1/social/accounts/connect/:platform', auth, async (req, reply) => {
    const { platform } = z.object({ platform: platformSchema }).parse(req.params);
    const authUrl = await initiateOAuth(req.user!.orgId, req.user!.userId, platform, callbackBase);
    return reply.send({ data: { authUrl } });
  });

  // OAuth callback — called by platform after user grants permission
  app.get('/api/v1/social/accounts/callback/:platform', async (req, reply) => {
    const { platform } = z.object({ platform: platformSchema }).parse(req.params);
    const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    const account = await handleOAuthCallback(platform, code, state, callbackBase);
    // Redirect to settings page (or return JSON for SPA)
    return reply.send({ data: account });
  });

  // Disconnect
  app.delete('/api/v1/social/accounts/:accountId', auth, async (req, reply) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(req.params);
    await disconnectSocialAccount(req.user!.orgId, accountId);
    return reply.code(204).send();
  });
};

export default socialAccountRoutes;
