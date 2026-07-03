/**
 * Mail settings routes (SendGrid Mail Settings parity).
 *   GET   /api/v1/mail-settings
 *   PATCH /api/v1/mail-settings
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getMailSettings, updateMailSettings } from '../../services/settings/mail-settings.js';

const patchSchema = z.object({
  footer: z
    .object({
      enabled: z.boolean().optional(),
      html: z.string().max(20_000).optional(),
      text: z.string().max(20_000).optional(),
    })
    .optional(),
  openTracking: z.boolean().optional(),
  clickTracking: z.boolean().optional(),
  subscriptionTracking: z.boolean().optional(),
});

export default async function mailSettingsRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/mail-settings',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Settings'], summary: 'Get org mail settings' },
    },
    async (req) => ({ data: await getMailSettings(req.user!.orgId) }),
  );

  app.patch(
    '/api/v1/mail-settings',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['Settings'], summary: 'Update org mail settings' },
    },
    async (req) => {
      const patch = patchSchema.parse(req.body);
      return { data: await updateMailSettings(req.user!.orgId, patch) };
    },
  );
}
