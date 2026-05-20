/**
 * Organization (workspace) routes.
 *
 *   GET    /api/v1/organizations/current   — current user's org
 *   PATCH  /api/v1/organizations/current   — update name, settings,
 *                                            tracking/compliance toggles
 *
 * Data-region and slug are intentionally NOT in the patch shape —
 * dataRegion has compliance implications (EU residency) and slug is
 * surfaced in public DOI URLs; both should require explicit support
 * intervention rather than a self-serve patch.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  /** Free-form workspace settings — timezone, default locale, brand color, etc. */
  settings: z.record(z.unknown()).optional(),
  ipRestrictionsEnabled: z.boolean().optional(),
  trackingEuStrict: z.boolean().optional(),
  hipaaMode: z.boolean().optional(),
});

export default async function organizationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // POST /api/v1/organizations/current/complete-onboarding
  // Sets onboardingCompletedAt on the current org. Idempotent — calling
  // it again just bumps the timestamp. Used by the /onboarding wizard.
  app.post(
    '/api/v1/organizations/current/complete-onboarding',
    { schema: { tags: ['Organizations'], summary: 'Mark onboarding as complete' } },
    async (req) => {
      const [row] = await db
        .update(organizations)
        .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
        .where(eq(organizations.id, req.user!.orgId))
        .returning();
      if (!row) throw AppError.notFound('Organization');
      return { data: { onboardingCompletedAt: row.onboardingCompletedAt } };
    },
  );

  app.get(
    '/api/v1/organizations/current',
    { schema: { tags: ['Organizations'], summary: "Get current user's organization" } },
    async (req) => {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, req.user!.orgId), isNull(organizations.deletedAt)))
        .limit(1);
      if (!row) throw AppError.notFound('Organization');
      return { data: row };
    },
  );

  app.patch(
    '/api/v1/organizations/current',
    {
      preHandler: [app.requireRole('owner', 'admin')],
      schema: { tags: ['Organizations'], summary: 'Update current organization' },
    },
    async (req) => {
      const patch = updateSchema.parse(req.body);

      // settings is JSONB — merge with existing instead of replace so a
      // partial patch (e.g. just timezone) doesn't wipe locale + brand.
      if (patch.settings !== undefined) {
        const [existing] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, req.user!.orgId))
          .limit(1);
        patch.settings = { ...(existing?.settings ?? {}), ...patch.settings };
      }

      const [row] = await db
        .update(organizations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(organizations.id, req.user!.orgId))
        .returning();
      if (!row) throw AppError.notFound('Organization');
      return { data: row };
    },
  );
}
