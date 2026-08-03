/**
 * Zapier bridge routes (#6 CC-gap).
 *
 * A minimal but complete Zapier app surface authenticated with a ForgeMsg API
 * key (via app.authenticate):
 *   - GET  /api/v1/zapier/me                       — connection/auth test
 *   - GET  /api/v1/zapier/triggers/new-contacts    — polling trigger
 *   - POST /api/v1/zapier/actions/create-contact   — action
 *   - POST /api/v1/zapier/actions/add-tag          — action
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createContact } from '../../services/contacts/index.js';
import { listRecentContacts, zapierAddTagByName } from '../../services/integrations/zapier.js';

const zapierRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // Auth test — Zapier calls this to validate the API key + label the account.
  app.get(
    '/api/v1/zapier/me',
    { schema: { tags: ['Zapier'], summary: 'Zapier auth test' } },
    async (req) => {
      return { data: { orgId: req.user!.orgId, userId: req.user!.userId ?? null, ok: true } };
    },
  );

  // Polling trigger: new contacts (newest first).
  app.get(
    '/api/v1/zapier/triggers/new-contacts',
    { schema: { tags: ['Zapier'], summary: 'New contact trigger (polling)' } },
    async (req) => {
      const q = z
        .object({
          since: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        })
        .parse(req.query);
      const data = await listRecentContacts(req.user!.orgId, { sinceIso: q.since, limit: q.limit });
      return { data };
    },
  );

  // Action: create a contact.
  app.post(
    '/api/v1/zapier/actions/create-contact',
    { schema: { tags: ['Zapier'], summary: 'Create contact action' } },
    async (req, reply) => {
      const body = z
        .object({
          email: z.string().email(),
          firstName: z.string().max(255).optional(),
          lastName: z.string().max(255).optional(),
          phone: z.string().max(32).optional(),
        })
        .parse(req.body);
      const contact = await createContact(req.user!.orgId, body);
      return reply.code(201).send({ data: contact });
    },
  );

  // Action: add a tag (by name) to a contact.
  app.post(
    '/api/v1/zapier/actions/add-tag',
    { schema: { tags: ['Zapier'], summary: 'Add tag action' } },
    async (req) => {
      const body = z
        .object({ contactId: z.string().uuid(), tag: z.string().min(1).max(100) })
        .parse(req.body);
      const result = await zapierAddTagByName(req.user!.orgId, body.contactId, body.tag);
      return { data: result };
    },
  );
};

export default zapierRoutes;
