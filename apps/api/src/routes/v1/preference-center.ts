/**
 * Public preference-center routes (Sprint D.1).
 *
 *   GET  /p/center/:token       — fetch current preferences
 *   POST /p/center/:token       — update preferences (toggle lists, opt out)
 *
 * Both are unauthenticated; the signed token IS the auth. Path is /p/* (not
 * /api/v1/*) because the URL ends up in customer emails and we want it short
 * + visibly distinct from API endpoints.
 *
 * Unsubscribe A/B testing (#leapfrog): when an active experiment exists, the
 * GET response carries the assigned "save the subscriber" variant (and records
 * an impression); the POST records the outcome (kept subscribed vs unsubscribed)
 * so save-rate per variant can be analysed.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPreferences, updatePreferences } from '../../services/preference-center/index.js';
import { verifyTrackingToken } from '../../services/sending/tracking.js';
import {
  assignVariant,
  recordImpression,
  recordOutcome,
} from '../../services/contacts/unsubscribe-ab.js';

const updateBody = z.object({
  globalUnsubscribe: z.boolean().optional(),
  globalResubscribe: z.boolean().optional(),
  unsubscribeFromLists: z.array(z.string().uuid()).max(200).optional(),
  resubscribeToLists: z.array(z.string().uuid()).max(200).optional(),
  reason: z.string().max(255).optional(),
});

/** Decode the signed pref token to { orgId, contactId } (null if invalid). */
function prefIdentity(token: string): { orgId: string; contactId: string } | null {
  const payload = verifyTrackingToken(token);
  if (!payload || payload.type !== 'pref') return null;
  const p = payload as { orgId: string; contactId: string };
  return { orgId: p.orgId, contactId: p.contactId };
}

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

      // Unsubscribe A/B: pick the save-the-subscriber variant for this contact.
      let experiment = null;
      const id = prefIdentity(token);
      if (id) {
        experiment = await assignVariant(id.orgId, id.contactId);
        if (experiment) recordImpression(experiment.variantId).catch(() => {});
      }

      return reply.send({ data: { ...view, experiment } });
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

      // Unsubscribe A/B: record the outcome. "Saved" = the recipient did NOT
      // globally unsubscribe (they kept at least their global subscription).
      const id = prefIdentity(token);
      if (id) {
        const variant = await assignVariant(id.orgId, id.contactId);
        if (variant) recordOutcome(variant.variantId, !body.globalUnsubscribe).catch(() => {});
      }

      return reply.send({ data: result });
    },
  );
}
