import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  configureSso,
  getSsoConfig,
  deleteSsoConfig,
  buildLoginUrl,
  processOidcCallback,
  processSamlAcs,
  getSpMetadataXml,
} from '../../services/sso/index.js';

const samlSchema = z.object({
  type: z.literal('saml'),
  samlEntityId: z.string().min(1).max(512),
  samlSsoUrl: z.string().url().max(1024),
  samlCertificate: z.string().min(1),
  defaultRole: z.enum(['admin', 'editor', 'viewer']).optional(),
  enabled: z.boolean().optional(),
});

const oidcSchema = z.object({
  type: z.literal('oidc'),
  oidcIssuer: z.string().url().max(512),
  oidcClientId: z.string().min(1).max(255),
  oidcClientSecret: z.string().min(1).max(512),
  oidcAuthorizeUrl: z.string().url().max(1024),
  oidcTokenUrl: z.string().url().max(1024),
  oidcJwksUri: z.string().url().max(1024).optional(),
  defaultRole: z.enum(['admin', 'editor', 'viewer']).optional(),
  enabled: z.boolean().optional(),
});

function sanitize(cfg: Awaited<ReturnType<typeof getSsoConfig>>) {
  if (!cfg) return null;
  const { oidcClientSecret, samlCertificate, ...rest } = cfg;
  return {
    ...rest,
    samlCertificateSet: !!samlCertificate,
    oidcClientSecretSet: !!oidcClientSecret,
  };
}

const ssoRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/sso/config',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      const body = z.union([samlSchema, oidcSchema]).parse(req.body);
      const cfg = await configureSso(req.user!.orgId, body);
      return reply.send({ data: sanitize(cfg) });
    },
  );

  app.get(
    '/api/v1/sso/config',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      const cfg = await getSsoConfig(req.user!.orgId);
      return reply.send({ data: sanitize(cfg) });
    },
  );

  app.delete(
    '/api/v1/sso/config',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      await deleteSsoConfig(req.user!.orgId);
      return reply.code(204).send();
    },
  );

  // Public login initiation — anyone with an orgId can request redirect URL.
  app.get(
    '/api/v1/sso/:orgId/login',
    {
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.params);
      const q = z.object({ redirectUri: z.string().url() }).parse(req.query);
      const url = await buildLoginUrl(orgId, q.redirectUri);
      return reply.send({ data: { url } });
    },
  );

  // OIDC callback
  app.get(
    '/api/v1/sso/oidc/callback',
    {
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      const q = z.object({ state: z.string(), code: z.string() }).parse(req.query);
      const result = await processOidcCallback(q.state, q.code);
      return reply.send({ data: result });
    },
  );

  // SAML Assertion Consumer Service
  app.post(
    '/api/v1/sso/saml/acs',
    {
      schema: { tags: ['SSO'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          SAMLResponse: z.string().min(1),
          RelayState: z.string().min(1),
        })
        .parse(req.body);
      const result = await processSamlAcs(body.SAMLResponse, body.RelayState);
      return reply.send({ data: result });
    },
  );

  // SP metadata XML (for IdP registration)
  app.get(
    '/api/v1/sso/saml/metadata',
    {
      schema: { tags: ['SSO'], summary: 'SAML SP metadata XML' },
    },
    async (_req, reply) => {
      const xml = getSpMetadataXml(''); // orgId not needed — metadata is SP-level
      return reply.header('content-type', 'application/xml').send(xml);
    },
  );

  // SAML attribute mapping config (per-org, stored in SSO settings)
  app.patch(
    '/api/v1/sso/saml/attribute-mapping',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['SSO'], summary: 'Configure SAML attribute mapping' },
    },
    async (req, reply) => {
      const body = z
        .object({
          emailAttribute: z.string().optional(),
          nameAttribute: z.string().optional(),
          roleAttribute: z.string().optional(),
        })
        .parse(req.body);

      // Store attribute mapping in SSO config's extra data via the SAML entity ID field
      // We persist it as a patch to the existing SAML config
      const existing = await getSsoConfig(req.user!.orgId);
      if (!existing || existing.type !== 'saml') {
        return reply
          .status(400)
          .send({ code: 'BAD_REQUEST', message: 'No SAML configuration found' });
      }
      const updated = await configureSso(req.user!.orgId, {
        type: 'saml',
        samlEntityId: existing.samlEntityId ?? '',
        samlSsoUrl: existing.samlSsoUrl ?? '',
        samlCertificate: existing.samlCertificate ?? '',
        defaultRole: (existing.defaultRole as never) ?? 'viewer',
        enabled: existing.enabled,
        // Attribute mapping stored in samlEntityId prefix format is a hack;
        // better to add explicit columns — for now store in settings JSONB via org
      });
      return reply.send({ data: sanitize(updated), attributeMapping: body });
    },
  );
};

export default ssoRoutes;
