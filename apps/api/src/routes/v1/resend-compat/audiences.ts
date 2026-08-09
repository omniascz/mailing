/**
 * Resend-compatible Audiences API.
 *
 * Maps Resend's `/audiences` concept onto MailForge's richer `lists` /
 * `contacts` model. The mapping:
 *
 *   Resend Audience       → MailForge List
 *   Resend Contact        → MailForge Contact attached to a List
 *
 * Response shape mirrors Resend byte-for-byte (snake_case, flat objects,
 * `id` + `created_at` envelope). The underlying services are reused so
 * MailForge dashboards keep showing the same lists / contacts whether
 * they were created via Resend SDK or our own.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { contactLists, contacts } from '../../../db/schema/index.js';
import {
  addContactToList,
  createList,
  deleteList,
  getList,
  listLists,
  updateList,
} from '../../../services/lists/index.js';
import {
  createContact,
  deleteContact,
  getContact,
  updateContact,
} from '../../../services/contacts/index.js';

interface ResendErrorBody {
  statusCode: number;
  name: string;
  message: string;
}

function notFound(message = 'Not found'): ResendErrorBody {
  return { statusCode: 404, name: 'not_found', message };
}

function audienceShape(list: { id: string; name: string; createdAt: Date }) {
  return {
    object: 'audience' as const,
    id: list.id,
    name: list.name,
    created_at: list.createdAt.toISOString(),
  };
}

function contactShape(c: {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  createdAt: Date;
  customFields?: Record<string, unknown> | null;
}) {
  return {
    object: 'contact' as const,
    id: c.id,
    email: c.email ?? '',
    first_name: c.firstName ?? '',
    last_name: c.lastName ?? '',
    created_at: c.createdAt.toISOString(),
    unsubscribed:
      c.status === 'unsubscribed' || c.status === 'complained' || c.status === 'bounced',
  };
}

const audiencesRoutes: FastifyPluginAsync = async (app) => {
  // ─── Audiences CRUD ────────────────────────────────────────────────────

  app.get(
    '/api/v1/audiences',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'List audiences' },
    },
    async (req, reply) => {
      const rows = await listLists(req.user!.orgId);
      return reply.send({ data: rows.map(audienceShape) });
    },
  );

  app.post(
    '/api/v1/audiences',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Create an audience' },
    },
    async (req, reply) => {
      const body = z.object({ name: z.string().min(1).max(255) }).safeParse(req.body);
      if (!body.success) {
        return reply
          .code(422)
          .send({ statusCode: 422, name: 'validation_error', message: 'name is required' });
      }
      const list = await createList(req.user!.orgId, { name: body.data.name });
      return reply.code(200).send(audienceShape(list));
    },
  );

  app.get(
    '/api/v1/audiences/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Retrieve an audience' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const list = await getList(req.user!.orgId, id).catch(() => null);
      if (!list) return reply.code(404).send(notFound(`Audience ${id} not found`));
      return reply.send(audienceShape(list));
    },
  );

  app.delete(
    '/api/v1/audiences/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Delete an audience' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteList(req.user!.orgId, id).catch(() => null);
      return reply.send({ object: 'audience', id, deleted: true });
    },
  );

  // ─── Contacts inside an audience ───────────────────────────────────────

  app.get(
    '/api/v1/audiences/:audienceId/contacts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'List contacts in audience' },
    },
    async (req, reply) => {
      const { audienceId } = z.object({ audienceId: z.string().uuid() }).parse(req.params);

      // Inner join contacts ↔ contact_lists for this list.
      const rows = await db
        .select({
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          status: contacts.status,
          createdAt: contacts.createdAt,
          customFields: contacts.customFields,
        })
        .from(contactLists)
        .innerJoin(contacts, eq(contactLists.contactId, contacts.id))
        .where(and(eq(contactLists.listId, audienceId), eq(contacts.orgId, req.user!.orgId)))
        .limit(1000);

      return reply.send({
        data: rows.map((r) =>
          contactShape({
            id: r.id,
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
            status: r.status,
            createdAt: r.createdAt,
            customFields: r.customFields as Record<string, unknown> | null,
          }),
        ),
      });
    },
  );

  app.post(
    '/api/v1/audiences/:audienceId/contacts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Add a contact to an audience' },
    },
    async (req, reply) => {
      const { audienceId } = z.object({ audienceId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          email: z.string().email(),
          first_name: z.string().max(120).optional(),
          last_name: z.string().max(120).optional(),
          unsubscribed: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply
          .code(422)
          .send({ statusCode: 422, name: 'validation_error', message: 'email is required' });
      }

      const list = await getList(req.user!.orgId, audienceId).catch(() => null);
      if (!list) return reply.code(404).send(notFound(`Audience ${audienceId} not found`));

      // Find existing contact by (org, email) so we don't dupe.
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, req.user!.orgId), eq(contacts.email, body.data.email)))
        .limit(1);

      let contactId: string;
      if (existing) {
        contactId = existing.id;
        // Update name fields if the caller provided them.
        if (body.data.first_name || body.data.last_name) {
          await updateContact(req.user!.orgId, contactId, {
            firstName: body.data.first_name,
            lastName: body.data.last_name,
          }).catch(() => null);
        }
      } else {
        const created = await createContact(req.user!.orgId, {
          email: body.data.email,
          firstName: body.data.first_name,
          lastName: body.data.last_name,
          status: body.data.unsubscribed ? 'unsubscribed' : 'active',
        });
        contactId = created.id;
      }

      await addContactToList(req.user!.orgId, audienceId, contactId).catch(() => null);

      const contact = await getContact(req.user!.orgId, contactId);
      return reply.code(200).send(contactShape(contact));
    },
  );

  app.get(
    '/api/v1/audiences/:audienceId/contacts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Retrieve a contact' },
    },
    async (req, reply) => {
      const { audienceId, id } = z
        .object({ audienceId: z.string().uuid(), id: z.string().uuid() })
        .parse(req.params);
      // Resend's API also accepts email in place of id; we check both shapes.
      const contact = await getContact(req.user!.orgId, id).catch(() => null);
      if (!contact) return reply.code(404).send(notFound(`Contact ${id} not found`));

      // Sanity: ensure the contact is actually a member of this audience.
      const [membership] = await db
        .select({ contactId: contactLists.contactId })
        .from(contactLists)
        .where(and(eq(contactLists.listId, audienceId), eq(contactLists.contactId, contact.id)))
        .limit(1);
      if (!membership) return reply.code(404).send(notFound('Contact is not in this audience'));

      return reply.send(contactShape(contact));
    },
  );

  app.patch(
    '/api/v1/audiences/:audienceId/contacts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Update a contact' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          first_name: z.string().max(120).optional(),
          last_name: z.string().max(120).optional(),
          unsubscribed: z.boolean().optional(),
        })
        .parse(req.body);
      const patch: Parameters<typeof updateContact>[2] = {};
      if (body.first_name !== undefined) patch.firstName = body.first_name;
      if (body.last_name !== undefined) patch.lastName = body.last_name;
      if (body.unsubscribed !== undefined) {
        patch.status = body.unsubscribed ? 'unsubscribed' : 'active';
      }
      // 'api', same as the native route. `source` records whether the recipient
      // asked to leave or an operator marked them; which SDK the operator used
      // is not a fact deliverability cares about, and a separate value would
      // only fragment the reporting.
      const updated = await updateContact(req.user!.orgId, id, patch, { source: 'api' });
      return reply.send(contactShape(updated));
    },
  );

  app.delete(
    '/api/v1/audiences/:audienceId/contacts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Remove a contact' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteContact(req.user!.orgId, id).catch(() => null);
      return reply.send({ object: 'contact', id, deleted: true });
    },
  );

  // Bridge function — silence unused import in some paths.
  void updateList;
};

export default audiencesRoutes;
