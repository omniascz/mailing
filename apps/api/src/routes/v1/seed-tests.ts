/**
 * Real seed-list inbox placement testing.
 *   Seed addresses:  GET/POST/DELETE /api/v1/seed-addresses
 *   Tests:           POST /api/v1/seed-tests, GET /api/v1/seed-tests[/:id]
 *   Result ingest:   POST /api/v1/seed-tests/:id/results  (inbox checker posts real placement)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addSeedAddress,
  listSeedAddresses,
  deleteSeedAddress,
  startSeedTest,
  recordSeedResult,
  getSeedTest,
  listSeedTests,
} from '../../services/deliverability/seed-test.js';

const idParam = z.object({ id: z.string().uuid() });
const PLACEMENT = ['inbox', 'spam', 'promotions', 'updates', 'social', 'missing'] as const;

export default async function seedTestRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Seed addresses ─────────────────────────────────────────────────────────
  app.get('/api/v1/seed-addresses', { schema: { tags: ['Deliverability'] } }, async (req) => ({
    data: await listSeedAddresses(req.user!.orgId),
  }));

  app.post(
    '/api/v1/seed-addresses',
    { schema: { tags: ['Deliverability'] } },
    async (req, reply) => {
      const body = z
        .object({ provider: z.string().min(1).max(40), email: z.string().email().max(255) })
        .parse(req.body);
      const row = await addSeedAddress(req.user!.orgId, body.provider, body.email);
      return reply.code(201).send({ data: row });
    },
  );

  app.delete(
    '/api/v1/seed-addresses/:id',
    { schema: { tags: ['Deliverability'] } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await deleteSeedAddress(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ── Seed tests ─────────────────────────────────────────────────────────────
  app.post(
    '/api/v1/seed-tests',
    { schema: { tags: ['Deliverability'], summary: 'Send content to seed inboxes' } },
    async (req, reply) => {
      const body = z
        .object({
          from: z.string().email(),
          fromName: z.string().max(100).optional(),
          subject: z.string().min(1).max(255),
          html: z.string().optional(),
          text: z.string().optional(),
          campaignId: z.string().uuid().optional(),
        })
        .refine((d) => d.html || d.text, { message: 'Provide html or text' })
        .parse(req.body);
      const test = await startSeedTest(req.user!.orgId, body);
      return reply.code(201).send({ data: test });
    },
  );

  app.get('/api/v1/seed-tests', { schema: { tags: ['Deliverability'] } }, async (req) => ({
    data: await listSeedTests(req.user!.orgId),
  }));

  app.get(
    '/api/v1/seed-tests/:id',
    { schema: { tags: ['Deliverability'], summary: 'Seed test placement results' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getSeedTest(req.user!.orgId, id) };
    },
  );

  // Real placement ingestion — posted by the inbox checker (IMAP poller /
  // provider API / manual). This is where ground-truth placement is recorded.
  app.post(
    '/api/v1/seed-tests/:id/results',
    { schema: { tags: ['Deliverability'], summary: 'Record real seed placement' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({ email: z.string().email(), placement: z.enum(PLACEMENT) })
        .parse(req.body);
      await recordSeedResult(req.user!.orgId, id, body.email, body.placement);
      return { data: { ok: true } };
    },
  );
}
