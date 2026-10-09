/**
 * Internal contacts batch fetch — called by batch-sender at the start of
 * each batch. One SQL hop returns all contact rows for the IDs. Avoids
 * 1000 round-trips to the public CRUD endpoint.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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
          // The batch-sender needs this to drop marketing to contacts who
          // unsubscribed. Filtering here instead would be wrong: this endpoint
          // also serves the transactional stream, and a receipt or a password
          // reset must still reach someone who left the mailing list.
          status: contacts.status,
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

  /**
   * Called by mta-sender after a hard bounce or complaint to mark the contact.
   *
   * Answers what it did, not just that it ran: `matched` is how many contacts
   * the request named, `changed` how many of them did not already have the
   * status. It used to answer `{ ok: true }` whatever the UPDATE touched — so a
   * job carrying an id no contact has was told the contact was marked.
   */
  app.patch(
    '/api/v1/internal/contacts/:contactId/status',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const { orgId, status, email } = z
        .object({
          orgId: z.string().uuid(),
          status: z.enum(['bounced', 'complained', 'unsubscribed']),
          /**
           * The address the message went to. Used only when the id names no
           * contact of this org — which is every /emails message: the caller
           * names no contact, so sendTransactionalEmail puts a random id on
           * the job (lib/queues.ts). A hard bounce belongs to the address, so
           * every live contact of the org holding it is marked; contacts has
           * no unique on email, and leaving a duplicate 'active' would put it
           * back into the status-based refusals (#234-#236) as mailable.
           */
          email: z.string().email().optional(),
        })
        .parse(req.body);

      let by: 'id' | 'email' | null = 'id';
      let matched = await db
        .select({ id: contacts.id, status: contacts.status })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
      if (matched.length === 0 && email) {
        by = 'email';
        matched = await db
          .select({ id: contacts.id, status: contacts.status })
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              sql`lower(${contacts.email}) = ${email.toLowerCase()}`,
              isNull(contacts.deletedAt),
            ),
          );
      }
      if (matched.length === 0) by = null;

      const toChange = matched.filter((c) => c.status !== status).map((c) => c.id);
      if (toChange.length > 0) {
        await db
          .update(contacts)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, toChange)));
      }

      return reply.send({ data: { matched: matched.length, changed: toChange.length, by } });
    },
  );
};

export default internalContactsRoutes;
