/**
 * Internal ePrivacy endpoints (Sprint D.8) — called by batch-sender
 * once per batch to learn whether tracking-strict mode is on for the
 * org and (when it is) which recipients have opted in to tracking.
 *
 * Without these, the worker would have to either:
 *   a) always track (the pre-D.8 behaviour, fine for B2B + CZ/SK
 *      legitimate-interest senders), or
 *   b) make N consent calls per batch (defeats the Sprint B.8 perf
 *      improvement).
 *
 * Two endpoints, both POST so the contactIds payload doesn't run
 * into URL-length limits:
 *
 *   GET  /api/v1/internal/org/tracking-strict?orgId=
 *        → { strict: boolean }
 *   POST /api/v1/internal/consent/opted-in-batch
 *        body: { orgId, channel, contactIds[] }
 *        → { optedIn: string[] }
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import {
  listOptedInContacts,
  KNOWN_CHANNELS,
} from '../../../services/consent/index.js';

const internalEPrivacyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/internal/org/tracking-strict', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.query);

    const [row] = await db
      .select({ strict: organizations.trackingEuStrict })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return reply.send({ data: { strict: row?.strict ?? false } });
  });

  app.post('/api/v1/internal/consent/opted-in-batch', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const body = z.object({
      orgId: z.string().uuid(),
      channel: z.enum(KNOWN_CHANNELS),
      contactIds: z.array(z.string().uuid()).max(1000),
    }).parse(req.body);

    const optedInSet = await listOptedInContacts(
      body.orgId,
      body.channel,
      body.contactIds,
    );

    return reply.send({ data: { optedIn: Array.from(optedInSet) } });
  });
};

export default internalEPrivacyRoutes;
