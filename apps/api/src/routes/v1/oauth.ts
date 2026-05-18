import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  registerApp, issueAuthCode, exchangeCode, refreshToken,
  introspectToken, revokeToken,
} from '../../services/oauth/index.js';

const oauthRoutes: FastifyPluginAsync = async (app) => {
  // ── App management (authenticated) ────────────────────────────────────────
  app.post('/api/v1/oauth/apps', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['OAuth'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      redirectUris: z.array(z.string().url()).min(1),
      scopes: z.array(z.string()).default([]),
    }).parse(req.body);
    const result = await registerApp(req.user!.orgId, body);
    return reply.code(201).send({
      data: {
        app: { ...result.app, clientSecretHash: undefined },
        clientSecret: result.clientSecret, // shown once
      },
    });
  });

  // ── Authorize endpoint (user consent) ─────────────────────────────────────
  app.post('/api/v1/oauth/authorize', {
    preHandler: [app.authenticate],
    schema: { tags: ['OAuth'] },
  }, async (req, reply) => {
    const body = z.object({
      clientId: z.string().min(1),
      redirectUri: z.string().url(),
      scopes: z.array(z.string()).default([]),
    }).parse(req.body);

    const code = await issueAuthCode({
      clientId: body.clientId,
      userId: req.user!.userId,
      orgId: req.user!.orgId,
      redirectUri: body.redirectUri,
      scopes: body.scopes,
    });
    return reply.send({ data: { code, redirectUri: body.redirectUri } });
  });

  // ── Token endpoint (public, OAuth spec) ───────────────────────────────────
  app.post('/oauth/token', {
    schema: { tags: ['OAuth'] },
  }, async (req, reply) => {
    const body = z.object({
      grant_type: z.enum(['authorization_code', 'refresh_token']),
      code: z.string().optional(),
      client_id: z.string().optional(),
      client_secret: z.string().optional(),
      redirect_uri: z.string().optional(),
      refresh_token: z.string().optional(),
    }).parse(req.body);

    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.client_id || !body.client_secret || !body.redirect_uri) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const tok = await exchangeCode({
        code: body.code,
        clientId: body.client_id,
        clientSecret: body.client_secret,
        redirectUri: body.redirect_uri,
      });
      return reply.send({
        access_token: tok.accessToken,
        refresh_token: tok.refreshToken,
        token_type: 'Bearer',
        expires_in: tok.expiresIn,
        scope: tok.scope,
      });
    }
    if (!body.refresh_token) return reply.code(400).send({ error: 'invalid_request' });
    const tok = await refreshToken(body.refresh_token);
    return reply.send({ access_token: tok.accessToken, token_type: 'Bearer', expires_in: tok.expiresIn });
  });

  app.post('/oauth/introspect', { schema: { tags: ['OAuth'] } }, async (req, reply) => {
    const body = z.object({ token: z.string().min(1) }).parse(req.body);
    return reply.send(await introspectToken(body.token));
  });

  app.post('/oauth/revoke', { schema: { tags: ['OAuth'] } }, async (req, reply) => {
    const body = z.object({ token: z.string().min(1) }).parse(req.body);
    await revokeToken(body.token);
    return reply.send({ revoked: true });
  });
};

export default oauthRoutes;
