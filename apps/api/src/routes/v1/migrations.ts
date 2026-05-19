/**
 * Migration routes.
 *
 *  POST /api/v1/migrations/mailchimp  — start Mailchimp import job (task 6.7)
 *  POST /api/v1/migrations/ecomail    — start Ecomail import job (Sprint C — CZ)
 *  GET  /api/v1/migrations            — list migration jobs
 *  GET  /api/v1/migrations/:id        — get job + progress
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  startMailchimpMigration,
  getMigrationJob,
  listMigrationJobs,
} from '../../services/migrations/mailchimp.js';
import { startEcomailMigration } from '../../services/migrations/ecomail.js';

const migrationRoutes: FastifyPluginAsync = async (app) => {

  app.get('/api/v1/migrations', {
    preHandler: [app.authenticate],
    schema: { tags: ['Migrations'], summary: 'List migration jobs' },
  }, async (req, reply) => {
    return reply.send({ data: await listMigrationJobs(req.user!.orgId) });
  });

  app.get('/api/v1/migrations/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Migrations'], summary: 'Get migration job details and progress' },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ data: await getMigrationJob(id, req.user!.orgId) });
  });

  const mailchimpSchema = z.object({
    apiKey: z.string().min(10),
  });

  app.post('/api/v1/migrations/mailchimp', {
    preHandler: [app.authenticate],
    schema: { tags: ['Migrations'], summary: 'Start Mailchimp import' },
  }, async (req, reply) => {
    const { apiKey } = mailchimpSchema.parse(req.body);
    const job = await startMailchimpMigration(req.user!.orgId, apiKey);
    return reply.status(202).send({ data: job });
  });

  const ecomailSchema = z.object({
    apiKey: z.string().min(10),
  });

  app.post('/api/v1/migrations/ecomail', {
    preHandler: [app.authenticate],
    schema: { tags: ['Migrations'], summary: 'Start Ecomail import (CZ source)' },
  }, async (req, reply) => {
    const { apiKey } = ecomailSchema.parse(req.body);
    const job = await startEcomailMigration(req.user!.orgId, apiKey);
    return reply.status(202).send({ data: job });
  });
};

export default migrationRoutes;
