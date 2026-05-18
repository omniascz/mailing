import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ingestDocument, search, getDocument, listDocuments, deleteDocument,
} from '../../services/rag/index.js';

const SOURCE_TYPES = [
  'kb_article', 'helpdesk_ticket', 'blog_post', 'url', 'upload', 'template', 'custom',
] as const;

const ragRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.post('/api/v1/rag/documents', auth, async (req, reply) => {
    const body = z.object({
      sourceType: z.enum(SOURCE_TYPES),
      sourceId: z.string().max(255).optional(),
      externalRef: z.string().max(1024).optional(),
      title: z.string().min(1).max(500),
      body: z.string().min(1),
      url: z.string().url().max(2000).optional(),
      language: z.string().max(8).optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body);
    const data = await ingestDocument(req.user!.orgId, body);
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/rag/documents', auth, async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const data = await listDocuments(req.user!.orgId, q.limit);
    return reply.send({ data });
  });

  app.get('/api/v1/rag/documents/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = await getDocument(req.user!.orgId, id);
    return reply.send({ data });
  });

  app.delete('/api/v1/rag/documents/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteDocument(req.user!.orgId, id);
    return reply.code(204).send();
  });

  app.post('/api/v1/rag/search', auth, async (req, reply) => {
    const body = z.object({
      query: z.string().min(1),
      topK: z.number().int().min(1).max(20).optional(),
      sourceTypes: z.array(z.enum(SOURCE_TYPES)).optional(),
      minSimilarity: z.number().min(0).max(1).optional(),
    }).parse(req.body);
    const data = await search(req.user!.orgId, body.query, body);
    return reply.send({ data });
  });
};

export default ragRoutes;
