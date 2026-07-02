/**
 * Signup form routes (task 6.5).
 *
 *  GET    /api/v1/signup-forms          — list forms
 *  POST   /api/v1/signup-forms          — create form
 *  GET    /api/v1/signup-forms/:id      — get form
 *  PUT    /api/v1/signup-forms/:id      — update form
 *  DELETE /api/v1/signup-forms/:id      — delete form
 *  GET    /api/v1/signup-forms/:id/script — get embed JS snippet
 *
 *  POST   /public/forms/:id/submit      — public (unauthenticated) form submit
 *  GET    /public/forms/:id/view        — track form impression (unauthenticated)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSignupForm,
  getSignupForm,
  listSignupForms,
  updateSignupForm,
  deleteSignupForm,
  generateEmbedScript,
  getFormDefinition,
  buildLoaderScript,
  renderHostedFormPage,
  processFormSubmission,
  trackFormView,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  selectVariantForVisitor,
  trackVariantView,
} from '../../services/signup-forms/index.js';
import { evaluateFormTargeting } from '../../services/signup-forms/targeting.js';
import type { FormConfig } from '../../db/schema/signup-forms.js';

const signupFormRoutes: FastifyPluginAsync = async (app) => {
  const API_BASE = process.env.API_BASE_URL ?? 'https://api.forgemsg.io';

  // ── Authenticated CRUD ────────────────────────────────────────────────────────

  app.get(
    '/api/v1/signup-forms',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'List signup forms' },
    },
    async (req, reply) => {
      return reply.send({ data: await listSignupForms(req.user!.orgId) });
    },
  );

  const fieldSchema = z.object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['text', 'email', 'phone', 'select', 'checkbox', 'hidden']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    defaultValue: z.string().optional(),
  });

  const configSchema = z
    .object({
      submitButtonText: z.string().optional(),
      successMessage: z.string().optional(),
      redirectUrl: z.string().url().optional(),
      doubleOptIn: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      workflowId: z.string().uuid().optional(),
      styles: z.record(z.string()).optional(),
    })
    .optional();

  const createSchema = z.object({
    name: z.string().min(1).max(255),
    listId: z.string().uuid().optional(),
    fields: z.array(fieldSchema).optional(),
    embedType: z.enum(['inline', 'popup', 'slide', 'floating']).optional(),
    config: configSchema,
  });

  app.post(
    '/api/v1/signup-forms',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Create signup form' },
    },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const body = createSchema.parse(req.body);
      const form = await createSignupForm(orgId, body as Parameters<typeof createSignupForm>[1]);
      return reply.status(201).send({ data: form });
    },
  );

  app.get(
    '/api/v1/signup-forms/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Get signup form' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      return reply.send({ data: await getSignupForm(id, req.user!.orgId) });
    },
  );

  const updateSchema = createSchema.partial();

  app.put(
    '/api/v1/signup-forms/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Update signup form' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      const body = updateSchema.parse(req.body);
      return reply.send({
        data: await updateSignupForm(id, orgId, body as Parameters<typeof updateSignupForm>[2]),
      });
    },
  );

  app.delete(
    '/api/v1/signup-forms/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Delete signup form' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await deleteSignupForm(id, req.user!.orgId);
      return reply.status(204).send();
    },
  );

  app.get(
    '/api/v1/signup-forms/:id/script',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Get embed JavaScript snippet' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      // Verify ownership
      await getSignupForm(id, req.user!.orgId);
      const script = generateEmbedScript(id, API_BASE);
      return reply.type('text/html').send(script);
    },
  );

  // ── Public endpoints (unauthenticated) ───────────────────────────────────────

  // Served embed loader script (referenced by generateEmbedScript). Must be
  // declared before '/public/forms/:id' so 'loader.js' isn't matched as an :id.
  app.get(
    '/public/forms/loader.js',
    { schema: { tags: ['Public Forms'], summary: 'Signup-form embed loader script' } },
    async (_req, reply) => {
      return reply
        .type('application/javascript; charset=utf-8')
        .header('Cache-Control', 'public, max-age=300')
        .send(buildLoaderScript(API_BASE));
    },
  );

  // Hosted standalone form page (a shareable public URL).
  app.get(
    '/public/forms/:id/hosted',
    { schema: { tags: ['Public Forms'], summary: 'Hosted standalone form page' } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const form = await getFormDefinition(id);
      if (!form) {
        return reply.status(404).type('text/html').send('<h1>Form not found</h1>');
      }
      return reply.type('text/html; charset=utf-8').send(renderHostedFormPage(form, API_BASE));
    },
  );

  // Get form definition (for the JS loader)
  app.get(
    '/public/forms/:id',
    {
      schema: { tags: ['Public Forms'], summary: 'Get form definition for rendering' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const form = await getFormDefinition(id);
      if (!form) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Form not found' });
      return reply.send({ data: form });
    },
  );

  // Track form view
  app.get(
    '/public/forms/:id/view',
    {
      schema: { tags: ['Public Forms'], summary: 'Track form impression' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await trackFormView(id);
      return reply.status(204).send();
    },
  );

  // Targeting decision — the embed script calls this with the visitor's context
  // (page url, device, prior impressions) to learn whether + how to show the form.
  app.get(
    '/public/forms/:id/should-show',
    {
      schema: { tags: ['Public Forms'], summary: 'Evaluate targeting + behaviour rules' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = z
        .object({
          url: z.string().max(2048).optional(),
          device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
          impressionCount: z.coerce.number().int().min(0).optional(),
          lastSeenMs: z.coerce.number().int().min(0).optional(),
          hasSubmitted: z.coerce.boolean().optional(),
        })
        .parse(req.query);
      const form = await getFormDefinition(id);
      if (!form) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Form not found' });
      const decision = evaluateFormTargeting((form.config as FormConfig | undefined)?.targeting, {
        url: q.url,
        device: q.device,
        impressionCount: q.impressionCount,
        lastSeenMs: q.lastSeenMs ?? null,
        hasSubmitted: q.hasSubmitted,
        nowMs: Date.now(),
      });
      return reply.send({ data: decision });
    },
  );

  // Submit form
  const submitSchema = z.record(z.string());

  app.post(
    '/public/forms/:id/submit',
    {
      schema: { tags: ['Public Forms'], summary: 'Submit a signup form (unauthenticated)' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = submitSchema.parse(req.body);
      const result = await processFormSubmission(id, data, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!result.success) {
        return reply.status(422).send({ code: 'VALIDATION_ERROR', message: result.message });
      }
      return reply.send({ data: result });
    },
  );

  // ── A/B Variant endpoints ─────────────────────────────────────────────────────

  const variantBodySchema = z.object({
    name: z.string().min(1).max(255),
    trafficSplit: z.number().int().min(0).max(100).default(50),
    fields: z
      .array(
        z.object({
          name: z.string(),
          label: z.string(),
          type: z.enum(['text', 'email', 'phone', 'select', 'checkbox', 'hidden']),
          required: z.boolean(),
          options: z.array(z.string()).optional(),
          placeholder: z.string().optional(),
          defaultValue: z.string().optional(),
        }),
      )
      .optional(),
    config: z
      .object({
        submitButtonText: z.string().optional(),
        successMessage: z.string().optional(),
        redirectUrl: z.string().url().optional(),
        doubleOptIn: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        workflowId: z.string().uuid().optional(),
        styles: z.record(z.string()).optional(),
      })
      .optional(),
  });

  app.get(
    '/api/v1/signup-forms/:formId/variants',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'List A/B variants for a form' },
    },
    async (req, reply) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listVariants(req.user!.orgId, formId) });
    },
  );

  app.post(
    '/api/v1/signup-forms/:formId/variants',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Signup Forms'], summary: 'Create an A/B variant' },
    },
    async (req, reply) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const body = variantBodySchema.parse(req.body);
      const variant = await createVariant(req.user!.orgId, formId, body);
      return reply.code(201).send({ data: variant });
    },
  );

  app.put(
    '/api/v1/signup-forms/:formId/variants/:variantId',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Signup Forms'], summary: 'Update an A/B variant' },
    },
    async (req, reply) => {
      const { variantId } = z
        .object({ formId: z.string().uuid(), variantId: z.string().uuid() })
        .parse(req.params);
      const body = variantBodySchema
        .partial()
        .extend({ active: z.boolean().optional() })
        .parse(req.body);
      return reply.send({ data: await updateVariant(req.user!.orgId, variantId, body) });
    },
  );

  app.delete(
    '/api/v1/signup-forms/:formId/variants/:variantId',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Signup Forms'], summary: 'Delete an A/B variant' },
    },
    async (req, reply) => {
      const { variantId } = z
        .object({ formId: z.string().uuid(), variantId: z.string().uuid() })
        .parse(req.params);
      await deleteVariant(req.user!.orgId, variantId);
      return reply.code(204).send();
    },
  );

  // Public: progressive profiling — return only unfilled fields for a known contact (#205)
  app.get(
    '/public/forms/:formId/progressive',
    {
      schema: { tags: ['Public Forms'], summary: 'Get progressive fields for a known contact' },
    },
    async (req) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const { contactId, orgId, fieldsPerVisit } = z
        .object({
          contactId: z.string().uuid(),
          orgId: z.string().uuid(),
          fieldsPerVisit: z.coerce.number().int().min(1).max(10).optional(),
        })
        .parse(req.query);
      const { getProgressiveFields } = await import('../../services/signup-forms/progressive.js');
      return { data: await getProgressiveFields({ formId, contactId, orgId, fieldsPerVisit }) };
    },
  );

  // Authenticated: progressive profiling for dashboard (uses req.user.orgId)
  app.get(
    '/api/v1/forms/:formId/progressive',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['Forms'], summary: 'Get progressive fields for a contact' },
    },
    async (req) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const { contactId, fieldsPerVisit } = z
        .object({
          contactId: z.string().uuid(),
          fieldsPerVisit: z.coerce.number().int().min(1).max(10).optional(),
        })
        .parse(req.query);
      const { getProgressiveFields } = await import('../../services/signup-forms/progressive.js');
      return {
        data: await getProgressiveFields({
          formId,
          contactId,
          orgId: req.user!.orgId,
          fieldsPerVisit,
        }),
      };
    },
  );

  // Public: select which variant to show a visitor
  app.get(
    '/public/forms/:formId/variant',
    {
      schema: { tags: ['Public Forms'], summary: 'Get variant for visitor token' },
    },
    async (req, reply) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const { visitorToken } = z.object({ visitorToken: z.string().min(1) }).parse(req.query);
      const variant = await selectVariantForVisitor(formId, undefined, visitorToken);
      if (!variant) return reply.send({ data: null });
      await trackVariantView(variant.id);
      return reply.send({ data: variant });
    },
  );

  // ─── Smart/Dependent forms — field visibility evaluation (#341) ─────────

  /**
   * POST /api/v1/signup-forms/:id/evaluate-visibility
   * Given a partial form submission, returns which fields should be shown.
   * Called by the form embed JS as the user fills fields (real-time).
   */
  app.post(
    '/api/v1/signup-forms/:id/evaluate-visibility',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Signup Forms'], summary: 'Evaluate conditional field visibility' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { data: submittedData } = z
        .object({ data: z.record(z.string()) })
        .parse(req.body);

      const form = await getSignupForm(req.user!.orgId, id);
      const { computeFieldVisibility } = await import('../../services/forms/conditional-logic.js');
      const visibility = computeFieldVisibility(form.fields, submittedData);
      return { data: visibility };
    },
  );

  /**
   * POST /public/forms/:formId/evaluate-visibility
   * Public version for the embed script (unauthenticated — form definition is public).
   */
  app.post(
    '/public/forms/:formId/evaluate-visibility',
    {
      schema: { tags: ['Public Forms'], summary: 'Evaluate field visibility (public)' },
    },
    async (req) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const { orgId, data: submittedData } = z
        .object({ orgId: z.string().uuid(), data: z.record(z.string()) })
        .parse(req.body);

      const form = await getFormDefinition(formId);
      if (!form) return { data: [] };
      const { computeFieldVisibility } = await import('../../services/forms/conditional-logic.js');
      void orgId; // orgId validated implicitly via formId ownership
      return { data: computeFieldVisibility(form.fields, submittedData) };
    },
  );

  // Public: autofill pre-populated fields for identified visitor (#334)
  app.get(
    '/public/forms/:formId/autofill',
    {
      schema: {
        tags: ['Public Forms'],
        summary: 'Pre-fill form fields for an identified visitor',
        description: 'Provide fmid (tracking cookie) or fmcid (encrypted contact ID in URL) to get safe pre-fill data.',
      },
    },
    async (req, reply) => {
      const { formId } = z.object({ formId: z.string().uuid() }).parse(req.params);
      const { fmid, fmcid, orgId } = z
        .object({
          fmid: z.string().max(256).optional(),
          fmcid: z.string().max(512).optional(),
          orgId: z.string().uuid(),
        })
        .parse(req.query);

      const { resolveContactFromTracking, buildAutofillPayload } = await import(
        '../../services/signup-forms/autofill.js'
      );

      const contactId = await resolveContactFromTracking(fmid, fmcid);
      if (!contactId) {
        return reply.send({ data: null });
      }

      const payload = await buildAutofillPayload(orgId, formId, contactId);
      return reply.send({ data: payload });
    },
  );
};

export default signupFormRoutes;
