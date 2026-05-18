/**
 * Identity graph routes (#264) — CDP multi-signal resolution.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ingestSignals,
  resolveContact,
  listSignals,
  mergeContacts,
  listDuplicates,
  type ResolutionResult,
} from '../../services/cdp/identity-graph.js';

const SIGNAL_TYPE = z.enum([
  'email', 'phone', 'cookie', 'device_id',
  'hashed_id', 'account_id', 'user_id',
  'social_id', 'visitor_id',
]);

const identityGraphRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/identity-graph/ingest', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const body = z.object({
      contactId: z.string().uuid().optional(),
      signals: z.array(z.object({
        type: SIGNAL_TYPE,
        value: z.string().min(1).max(512),
        confidence: z.number().int().min(1).max(100).optional(),
        source: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })).min(1),
    }).parse(req.body);
    const result: ResolutionResult = await ingestSignals({
      orgId: req.user!.orgId,
      contactId: body.contactId,
      signals: body.signals,
    });
    return reply.code(201).send({ data: result });
  });

  app.post('/api/v1/identity-graph/resolve', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const body = z.object({
      signals: z.array(z.object({
        type: SIGNAL_TYPE,
        value: z.string().min(1).max(512),
      })).min(1),
    }).parse(req.body);
    const contactId = await resolveContact(req.user!.orgId, body.signals);
    return reply.send({ data: { contactId } });
  });

  app.get('/api/v1/identity-graph/contacts/:id/signals', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await listSignals(req.user!.orgId, id) });
  });

  app.post('/api/v1/identity-graph/merge', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const body = z.object({
      winnerContactId: z.string().uuid(),
      loserContactId: z.string().uuid(),
      reason: z.string().max(255).optional(),
    }).parse(req.body);
    const moved = await mergeContacts(
      req.user!.orgId, body.winnerContactId, body.loserContactId, body.reason,
    );
    return reply.send({ data: { movedSignals: moved } });
  });

  app.get('/api/v1/identity-graph/duplicates', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).parse(req.query);
    return reply.send({ data: await listDuplicates(req.user!.orgId, q.limit) });
  });
};

export default identityGraphRoutes;
