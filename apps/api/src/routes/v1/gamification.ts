/**
 * Gamification routes — Wheel of Fortune.
 *
 * Public (unauthenticated):
 *   POST /public/forms/:id/spin         — spin the wheel (called from embed script)
 *   POST /public/forms/:id/spin/confirm — confirm spin + submit form data
 *
 * Authenticated (admin):
 *   GET  /api/v1/gamification/forms/:id/spins  — list all spins for a form
 *   GET  /api/v1/gamification/forms/:id/config — get wheel config
 *   PUT  /api/v1/gamification/forms/:id/config — update wheel config
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spin, confirmSpin, listSpins } from '../../services/gamification/wheel-of-fortune.js';
import { db } from '../../db/client.js';
import { signupForms } from '../../db/schema/signup-forms.js';
import type { FormConfig } from '../../db/schema/signup-forms.js';
import type { WheelConfig } from '../../db/schema/wheel-spins.js';
import { and, eq } from 'drizzle-orm';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const formIdParam = z.object({ id: z.string().uuid() });

const spinBody = z.object({
  email: z.string().email(),
});

const confirmBody = z.object({
  email: z.string().email(),
  /** Additional form field values submitted alongside the spin */
  fields: z.record(z.string()).optional(),
});

const wheelPrizeSchema = z.object({
  label: z.string().min(1).max(100),
  weight: z.number().positive(),
  couponPoolId: z.string().uuid().optional(),
  couponCode: z.string().max(128).optional(),
  color: z.string().max(20).optional(),
  noPrize: z.boolean().optional(),
});

const wheelConfigSchema = z.object({
  prizes: z.array(wheelPrizeSchema).min(2).max(12),
  maxSpinsPerEmail: z.number().int().positive().max(10).optional(),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(400).optional(),
  spinButtonText: z.string().max(50).optional(),
  primaryColor: z.string().max(20).optional(),
});

export default async function gamificationRoutes(app: FastifyInstance) {
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  // ── Public spin endpoints (no auth — called from embedded JS) ─────────────

  app.post('/public/forms/:id/spin', async (req, reply) => {
    const { id } = formIdParam.parse(req.params);
    const { email } = spinBody.parse(req.body);
    const ipAddress = req.ip;

    // Resolve orgId from formId (public endpoint — no auth token)
    const [form] = await db
      .select({ orgId: signupForms.orgId })
      .from(signupForms)
      .where(and(eq(signupForms.id, id), eq(signupForms.active, true)));

    if (!form) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Form not found' });
    }

    try {
      const result = await spin(form.orgId, id, email, ipAddress);
      return reply.send({
        data: {
          prizeIndex: result.prizeIndex,
          prizeLabel: result.prize.label,
          prizeColor: result.prize.color,
          noPrize: result.prize.noPrize ?? false,
          alreadySpun: result.alreadySpun,
          // Coupon revealed only after form confirm step
        },
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.code(statusCode).send({
        code: 'SPIN_ERROR',
        message: err instanceof Error ? err.message : 'Spin failed',
      });
    }
  });

  app.post('/public/forms/:id/spin/confirm', async (req, reply) => {
    const { id } = formIdParam.parse(req.params);
    const { email, fields } = confirmBody.parse(req.body);

    const [form] = await db
      .select({ orgId: signupForms.orgId })
      .from(signupForms)
      .where(and(eq(signupForms.id, id), eq(signupForms.active, true)));

    if (!form) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Form not found' });

    // Confirm the spin (marks as confirmed, links contactId if we create a contact)
    const confirmed = await confirmSpin(id, email);

    return reply.send({
      data: {
        confirmed: !!confirmed,
        couponCode: confirmed?.couponCode ?? null,
        fields,
      },
    });
  });

  // ── Admin: wheel config per form ──────────────────────────────────────────

  app.get('/api/v1/gamification/forms/:id/config', adminAuth, async (req, reply) => {
    const { id } = formIdParam.parse(req.params);
    const [form] = await db
      .select({ config: signupForms.config })
      .from(signupForms)
      .where(and(eq(signupForms.orgId, req.user!.orgId), eq(signupForms.id, id)));

    if (!form) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Form not found' });

    const wheelConfig = (form.config as FormConfig & { wheelConfig?: WheelConfig }).wheelConfig;
    return reply.send({ data: wheelConfig ?? null });
  });

  app.put('/api/v1/gamification/forms/:id/config', adminAuth, async (req, reply) => {
    const { id } = formIdParam.parse(req.params);
    const wheelConfig = wheelConfigSchema.parse(req.body);

    const [form] = await db
      .select({ config: signupForms.config })
      .from(signupForms)
      .where(and(eq(signupForms.orgId, req.user!.orgId), eq(signupForms.id, id)));

    if (!form) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Form not found' });

    const updatedConfig = { ...(form.config as object), wheelConfig };
    const [updated] = await db
      .update(signupForms)
      .set({ config: updatedConfig as FormConfig, updatedAt: new Date() })
      .where(and(eq(signupForms.orgId, req.user!.orgId), eq(signupForms.id, id)))
      .returning();

    return reply.send({
      data: (updated!.config as FormConfig & { wheelConfig?: WheelConfig }).wheelConfig,
    });
  });

  // ── Admin: spin analytics ─────────────────────────────────────────────────

  app.get('/api/v1/gamification/forms/:id/spins', adminAuth, async (req, reply) => {
    const { id } = formIdParam.parse(req.params);
    const data = await listSpins(req.user!.orgId, id);
    return reply.send({ data });
  });
}
