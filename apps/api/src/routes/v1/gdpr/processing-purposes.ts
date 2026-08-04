/**
 * GDPR processing purposes routes.
 *
 *   GET    /api/v1/gdpr/purposes                          — list org purposes
 *   POST   /api/v1/gdpr/purposes                          — create purpose
 *   GET    /api/v1/gdpr/purposes/:id                      — get purpose
 *   PUT    /api/v1/gdpr/purposes/:id                      — update purpose
 *   DELETE /api/v1/gdpr/purposes/:id                      — archive purpose
 *
 *   GET    /api/v1/contacts/:contactId/gdpr/consents      — contact consent states
 *   GET    /api/v1/contacts/:contactId/gdpr/history       — full consent history
 *   POST   /api/v1/contacts/:contactId/gdpr/consents      — grant consent
 *   DELETE /api/v1/contacts/:contactId/gdpr/consents/:purposeId — revoke consent
 *   DELETE /api/v1/contacts/:contactId/gdpr              — revoke ALL (erasure)
 *
 *   GET    /api/v1/contacts/:contactId/gdpr/check/:purposeId — quick consent check
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listPurposes,
  getPurpose,
  createPurpose,
  updatePurpose,
  archivePurpose,
  grantConsent,
  revokeConsent,
  revokeAllConsents,
  getContactConsentStates,
  getConsentHistory,
  hasActiveConsent,
} from '../../../services/gdpr/processing-purposes.js';
import { GDPR_LEGAL_BASES } from '../../../db/schema/index.js';

const idParam = z.object({ id: z.string().uuid() });
const contactParam = z.object({ contactId: z.string().uuid() });
const contactPurposeParam = z.object({
  contactId: z.string().uuid(),
  purposeId: z.string().uuid(),
});

const createPurposeBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric with _ or -'),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  legalBasis: z.enum(GDPR_LEGAL_BASES).default('consent'),
  retentionDays: z.number().int().positive().optional(),
});

const updatePurposeBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  legalBasis: z.enum(GDPR_LEGAL_BASES).optional(),
  retentionDays: z.number().int().positive().nullable().optional(),
});

const grantConsentBody = z.object({
  purposeId: z.string().uuid(),
  source: z.string().min(1).max(64),
  consentText: z.string().max(8000).optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().max(1024).optional(),
});

const revokeConsentBody = z.object({
  reason: z.string().max(255).optional(),
});

export default async function gdprPurposesRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner')] };

  // ── Purpose CRUD ──────────────────────────────────────────────────────────

  app.get('/api/v1/gdpr/purposes', auth, async (req, reply) => {
    const data = await listPurposes(req.user!.orgId);
    return reply.send({ data });
  });

  app.post('/api/v1/gdpr/purposes', adminAuth, async (req, reply) => {
    const body = createPurposeBody.parse(req.body);
    const row = await createPurpose({ ...body, orgId: req.user!.orgId });
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/gdpr/purposes/:id', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const row = await getPurpose(req.user!.orgId, id);
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Purpose not found' });
    return reply.send({ data: row });
  });

  app.put('/api/v1/gdpr/purposes/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updatePurposeBody.parse(req.body);
    const row = await updatePurpose(req.user!.orgId, id, body);
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Purpose not found' });
    return reply.send({ data: row });
  });

  app.delete('/api/v1/gdpr/purposes/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await archivePurpose(req.user!.orgId, id);
    return reply.code(204).send();
  });

  // ── Contact consent management ────────────────────────────────────────────

  app.get('/api/v1/contacts/:contactId/gdpr/consents', auth, async (req, reply) => {
    const { contactId } = contactParam.parse(req.params);
    const statesMap = await getContactConsentStates(req.user!.orgId, contactId);
    const data = Array.from(statesMap.values());
    return reply.send({ data });
  });

  app.get('/api/v1/contacts/:contactId/gdpr/history', auth, async (req, reply) => {
    const { contactId } = contactParam.parse(req.params);
    const data = await getConsentHistory(req.user!.orgId, contactId);
    return reply.send({ data });
  });

  app.post(
    '/api/v1/contacts/:contactId/gdpr/consents',
    { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] },
    async (req, reply) => {
      const { contactId } = contactParam.parse(req.params);
      const body = grantConsentBody.parse(req.body);
      const row = await grantConsent({
        orgId: req.user!.orgId,
        contactId,
        ...body,
      });
      return reply.code(201).send({ data: row });
    },
  );

  app.delete(
    '/api/v1/contacts/:contactId/gdpr/consents/:purposeId',
    { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] },
    async (req, reply) => {
      const { contactId, purposeId } = contactPurposeParam.parse(req.params);
      const body = revokeConsentBody.parse(req.body ?? {});
      const row = await revokeConsent({
        orgId: req.user!.orgId,
        contactId,
        purposeId,
        reason: body.reason,
      });
      return reply.send({ data: row });
    },
  );

  // Full erasure — revoke ALL active consents for a contact
  app.delete(
    '/api/v1/contacts/:contactId/gdpr',
    { preHandler: [app.authenticate, app.requireRole('admin', 'owner')] },
    async (req, reply) => {
      const { contactId } = contactParam.parse(req.params);
      await revokeAllConsents(req.user!.orgId, contactId);
      return reply.code(204).send();
    },
  );

  // Quick consent check (used by workflow conditions)
  app.get('/api/v1/contacts/:contactId/gdpr/check/:purposeId', auth, async (req, reply) => {
    const { contactId, purposeId } = contactPurposeParam.parse(req.params);
    const active = await hasActiveConsent(req.user!.orgId, contactId, purposeId);
    return reply.send({ data: { active, contactId, purposeId } });
  });

  // ── Preference centre (#646) ───────────────────────────────────────────────

  // Generate a preference-centre link token for a contact (authenticated)
  app.post('/api/v1/contacts/:contactId/gdpr/preference-centre-token', auth, async (req, reply) => {
    const { contactId } = contactParam.parse(req.params);
    const { generatePreferenceCentreToken } =
      await import('../../../services/gdpr/preference-centre.js');
    const token = generatePreferenceCentreToken(req.user!.orgId, contactId);
    const baseUrl = process.env['APP_BASE_URL'] ?? 'https://app.forgemsg.com';
    const url = `${baseUrl}/preferences?token=${token}`;
    return reply.send({ data: { token, url } });
  });

  // Public (unauthenticated) — load preference centre state via token
  app.get('/public/preferences', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.code(400).send({ code: 'MISSING_TOKEN', message: 'Token required' });
    const { verifyPreferenceCentreToken, getPreferenceCentreState } =
      await import('../../../services/gdpr/preference-centre.js');
    const payload = verifyPreferenceCentreToken(token);
    if (!payload)
      return reply.code(410).send({ code: 'EXPIRED', message: 'Token expired or invalid' });
    const state = await getPreferenceCentreState(payload.orgId, payload.contactId);
    return reply.send({ data: state });
  });

  // Public — update a single consent via preference centre
  app.post('/public/preferences/update', async (req, reply) => {
    const { token, purposeId, grant } = req.body as {
      token?: string;
      purposeId?: string;
      grant?: boolean;
    };
    if (!token || !purposeId || grant === undefined) {
      return reply
        .code(400)
        .send({ code: 'INVALID_BODY', message: 'token, purposeId, grant required' });
    }
    const { verifyPreferenceCentreToken, updatePreferenceCentreConsent } =
      await import('../../../services/gdpr/preference-centre.js');
    const payload = verifyPreferenceCentreToken(token);
    if (!payload)
      return reply.code(410).send({ code: 'EXPIRED', message: 'Token expired or invalid' });
    await updatePreferenceCentreConsent(
      payload.orgId,
      payload.contactId,
      purposeId,
      !!grant,
      req.ip,
    );
    return reply.send({ data: { ok: true } });
  });

  // ── Per-purpose double opt-in (#647) ──────────────────────────────────────

  // Initiate DOI for a purpose (authenticated — called from automation action)
  app.post('/api/v1/contacts/:contactId/gdpr/doi/:purposeSlug', auth, async (req, reply) => {
    const { contactId, purposeSlug } = req.params as { contactId: string; purposeSlug: string };
    const body = (req.body ?? {}) as { redirectUrl?: string };
    const { initiatePurposeDoi } = await import('../../../services/gdpr/per-purpose-doi.js');
    await initiatePurposeDoi(req.user!.orgId, contactId, purposeSlug, {
      ipAddress: req.ip,
      redirectUrl: body.redirectUrl,
    });
    return reply.send({ data: { ok: true } });
  });

  // Public — confirm DOI via email link click
  app.get('/public/gdpr/doi/confirm', async (req, reply) => {
    const { token, redirect } = req.query as { token?: string; redirect?: string };
    if (!token) return reply.code(400).send({ code: 'MISSING_TOKEN', message: 'Token required' });
    const { confirmDoiConsent } = await import('../../../services/gdpr/per-purpose-doi.js');
    try {
      const result = await confirmDoiConsent(token, req.ip);
      const redirectUrl =
        redirect ??
        `${process.env['APP_BASE_URL'] ?? ''}/gdpr/confirmed?purpose=${result.purposeSlug}`;
      return reply.redirect(redirectUrl, 302);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(410).send({ code: 'INVALID_TOKEN', message: msg });
    }
  });
}
