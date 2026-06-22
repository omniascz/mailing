/**
 * Partner provisioning API — lets a partner platform (Tixly) self-provision a
 * per-tenant ForgeMsg org + API key. Gated by a platform-level partner secret
 * (PARTNER_PROVISION_SECRET), NOT a normal org API key, since it creates orgs.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { provisionPartnerOrg } from '../../services/partner/provision.js';

function checkPartnerSecret(secret: unknown): boolean {
  const expected = process.env.PARTNER_PROVISION_SECRET;
  if (!expected) return false; // disabled unless explicitly configured
  if (typeof secret !== 'string') return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bodySchema = z.object({
  externalId: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  country: z.string().length(2).optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
});

export default async function partnerRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/partner/provision',
    { schema: { tags: ['Partner'], summary: 'Provision a per-tenant org + API key' } },
    async (req, reply) => {
      if (!checkPartnerSecret(req.headers['x-partner-secret'])) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid partner secret' });
      }
      const body = bodySchema.parse(req.body);
      const result = await provisionPartnerOrg(body);
      // apiKey is returned ONCE — the caller must store it.
      return reply.code(result.created ? 201 : 200).send({ data: result });
    },
  );
}
