/**
 * Inbox preview routes (Sprint E.8) — Litmus / Email on Acid bridge.
 *
 *  GET  /api/v1/inbox-preview/clients         — list supported email clients
 *  POST /api/v1/inbox-preview                  — start a render job
 *  GET  /api/v1/inbox-preview/:id              — fetch job result (lazy-polls provider)
 *  GET  /api/v1/inbox-preview?campaignId=...   — list jobs for org / campaign
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createPreviewJob,
  getPreviewJob,
  listPreviewJobs,
  listSupportedClients,
} from '../../services/preview/inbox-preview.js';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  html: z.string().min(20).max(2_000_000),
  subject: z.string().max(255).optional(),
  campaignId: z.string().uuid().optional(),
  clients: z.array(z.string().min(1).max(64)).max(50).optional(),
});

const listQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

export default async function inboxPreviewRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/inbox-preview/clients',
    {
      schema: { tags: ['InboxPreview'], summary: 'List supported email clients' },
    },
    async () => {
      return { data: await listSupportedClients() };
    },
  );

  app.post(
    '/api/v1/inbox-preview',
    {
      schema: { tags: ['InboxPreview'], summary: 'Start an inbox preview render job' },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const job = await createPreviewJob(req.user!.orgId, body);
      return reply.code(201).send({ data: job });
    },
  );

  app.get(
    '/api/v1/inbox-preview/:id',
    {
      schema: { tags: ['InboxPreview'], summary: 'Get an inbox preview job' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getPreviewJob(req.user!.orgId, id) };
    },
  );

  app.get(
    '/api/v1/inbox-preview',
    {
      schema: { tags: ['InboxPreview'], summary: 'List inbox preview jobs' },
    },
    async (req) => {
      const q = listQuerySchema.parse(req.query);
      return { data: await listPreviewJobs(req.user!.orgId, q) };
    },
  );
}
