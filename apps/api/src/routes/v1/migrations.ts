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
import { startSmartEmailingMigration } from '../../services/migrations/smartemailing.js';
import { startKlaviyoMigration } from '../../services/migrations/klaviyo.js';
import { rollbackMigration } from '../../services/migrations/rollback.js';

const migrationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/migrations',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'List migration jobs' },
    },
    async (req, reply) => {
      return reply.send({ data: await listMigrationJobs(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/migrations/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'Get migration job details and progress' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      return reply.send({ data: await getMigrationJob(id, req.user!.orgId) });
    },
  );

  const mailchimpSchema = z.object({
    apiKey: z.string().min(10),
  });

  app.post(
    '/api/v1/migrations/mailchimp',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'Start Mailchimp import' },
    },
    async (req, reply) => {
      const { apiKey } = mailchimpSchema.parse(req.body);
      const job = await startMailchimpMigration(req.user!.orgId, apiKey);
      return reply.status(202).send({ data: job });
    },
  );

  const ecomailSchema = z.object({
    apiKey: z.string().min(10),
  });

  app.post(
    '/api/v1/migrations/ecomail',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'Start Ecomail import (CZ source)' },
    },
    async (req, reply) => {
      const { apiKey } = ecomailSchema.parse(req.body);
      const job = await startEcomailMigration(req.user!.orgId, apiKey);
      return reply.status(202).send({ data: job });
    },
  );

  const smartemailingSchema = z.object({
    username: z.string().min(1),
    apiKey: z.string().min(10),
  });

  app.post(
    '/api/v1/migrations/smartemailing',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'Start SmartEmailing import (CZ source)' },
    },
    async (req, reply) => {
      const { username, apiKey } = smartemailingSchema.parse(req.body);
      const job = await startSmartEmailingMigration(req.user!.orgId, username, apiKey);
      return reply.status(202).send({ data: job });
    },
  );

  const klaviyoSchema = z.object({
    apiKey: z.string().min(10),
  });

  app.post(
    '/api/v1/migrations/klaviyo',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Migrations'], summary: 'Start Klaviyo import (DTC e-commerce)' },
    },
    async (req, reply) => {
      const { apiKey } = klaviyoSchema.parse(req.body);
      const job = await startKlaviyoMigration(req.user!.orgId, apiKey);
      return reply.status(202).send({ data: job });
    },
  );

  const rollbackSchema = z.object({
    force: z.boolean().optional(),
    includeSent: z.boolean().optional(),
  });

  app.post(
    '/api/v1/migrations/:id/rollback',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Migrations'],
        summary: 'Roll back a completed migration — soft-deletes imported contacts',
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = rollbackSchema.parse(req.body ?? {});
      const result = await rollbackMigration(id, req.user!.orgId, body);
      return reply.send({ data: result });
    },
  );
};

export default migrationRoutes;
