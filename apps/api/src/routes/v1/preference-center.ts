/**
 * Public preference-center routes (Sprint D.1).
 *
 *   GET  /p/center/:token       — fetch current preferences
 *   POST /p/center/:token       — update preferences (toggle lists, opt out)
 *
 * Both are unauthenticated; the signed token IS the auth. Path is /p/* (not
 * /api/v1/*) because the URL ends up in customer emails and we want it short
 * + visibly distinct from API endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPreferences, updatePreferences } from '../../services/preference-center/index.js';

const updateBody = z.object({
  globalUnsubscribe: z.boolean().optional(),
  globalResubscribe: z.boolean().optional(),
  unsubscribeFromLists: z.array(z.string().uuid()).max(200).optional(),
  resubscribeToLists: z.array(z.string().uuid()).max(200).optional(),
  reason: z.string().max(255).optional(),
});

export default async function preferenceCenterRoutes(app: FastifyInstance) {
  app.get(
    '/p/center/:token',
    {
      schema: {
        tags: ['Preference Center'],
        summary: "Public — recipient's current subscription preferences",
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const view = await getPreferences(token);
      return reply.send({ data: view });
    },
  );

  app.post(
    '/p/center/:token',
    {
      schema: {
        tags: ['Preference Center'],
        summary: 'Public — apply unsubscribe / resubscribe / per-list changes',
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const body = updateBody.parse(req.body ?? {});
      const result = await updatePreferences(token, body);
      return reply.send({ data: result });
    },
  );
}
