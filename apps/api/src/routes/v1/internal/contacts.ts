/**
 * Internal contacts batch fetch — called by batch-sender at the start of
 * each batch. One SQL hop returns all contact rows for the IDs. Avoids
 * 1000 round-trips to the public CRUD endpoint.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { contacts } from '../../../db/schema/index.js';

const internalContactsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/contacts/batch',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactIds: z.array(z.string().uuid()).max(1000),
        })
        .parse(req.body);

      if (body.contactIds.length === 0) {
        return reply.send({ data: [] });
      }

      const rows = await db
        .select({
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          customFields: contacts.customFields,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, body.orgId),
            inArray(contacts.id, body.contactIds),
            isNull(contacts.deletedAt),
          ),
        );

      return reply.send({ data: rows });
    },
  );

  // Called by mta-sender after hard bounce or complaint to mark contact status
  app.patch(
    '/api/v1/internal/contacts/:contactId/status',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const { contactId } = req.params as { contactId: string };
      const { orgId, status } = z
        .object({
          orgId: z.string().uuid(),
          status: z.enum(['bounced', 'complained', 'unsubscribed']),
        })
        .parse(req.body);

      await db
        .update(contacts)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));

      return reply.send({ data: { ok: true } });
    },
  );
};

export default internalContactsRoutes;
