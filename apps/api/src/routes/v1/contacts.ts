import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listContacts,
  getContact,
  createContact,
  createContactsBatch,
  updateContact,
  deleteContact,
  type ListContactsOpts,
} from '../../services/contacts/index.js';
import { validateEmail } from '../../services/email-validation/index.js';
import { checkContactCapacity } from '../../services/billing/plan-enforcement.js';
import {
  getContactActivity,
  formatActivityCsv,
  generateFilename,
} from '../../services/contacts/activity-export.js';
import { anonymizeContact, exportContactData } from '../../services/contacts/gdpr.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const STATUS = [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
  'non_subscribed',
  'archived',
] as const;

const contactWriteSchema = z.object({
  email: z.string().email().max(255).optional(),
  phone: z.string().max(32).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  status: z.enum(STATUS).optional(),
  isVip: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
  source: z.string().max(100).optional(),
  sourceDetails: z.record(z.unknown()).optional(),
});

const contactUpdateSchema = contactWriteSchema.extend({
  leadScore: z.string().optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(STATUS).optional(),
  list_id: z.string().uuid().optional(),
  tag_id: z.string().uuid().optional(),
  phone_operator: z.string().max(50).optional(),
  phone_district: z.string().max(100).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

// ─── Route plugin ────────────────────────────────────────────────────────────

export default async function contactRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/contacts
   * List contacts with cursor pagination, search, and filters.
   */
  app.get(
    '/api/v1/contacts',
    { schema: { tags: ['Contacts'], summary: 'List contacts' } },
    async (req) => {
      const query = listQuerySchema.parse(req.query);
      const opts: ListContactsOpts = {
        cursor: query.cursor,
        limit: query.limit,
        search: query.search,
        status: query.status,
        list_id: query.list_id,
        tag_id: query.tag_id,
        phone_operator: query.phone_operator,
        phone_district: query.phone_district,
      };
      return listContacts(req.user!.orgId, opts);
    },
  );

  /**
   * GET /api/v1/contacts/:id
   * Fetch a single contact by ID.
   */
  app.get(
    '/api/v1/contacts/:id',
    { schema: { tags: ['Contacts'], summary: 'Get contact' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getContact(req.user!.orgId, id) };
    },
  );

  /**
   * POST /api/v1/contacts
   * Create a single contact. Email is validated (with MX lookup) before insert.
   */
  app.post(
    '/api/v1/contacts',
    { schema: { tags: ['Contacts'], summary: 'Create contact' } },
    async (req, reply) => {
      // Plan gate: free tier refuses past contact limit.
      await checkContactCapacity(req.user!.orgId, 1);

      const body = contactWriteSchema.parse(req.body);
      let emailValidationScore: string | undefined;
      let emailValidatedAt: Date | undefined;

      if (body.email) {
        const result = await validateEmail(body.email, { checkMx: true });
        emailValidationScore = String(result.score);
        emailValidatedAt = new Date();
      }

      const contact = await createContact(req.user!.orgId, {
        ...body,
        emailValidationScore,
        emailValidatedAt,
      });
      return reply.code(201).send({ data: contact });
    },
  );

  /**
   * POST /api/v1/contacts/batch
   * Create up to 500 contacts in one request.
   * Uses synchronous email validation (no MX lookup) for speed.
   */
  app.post(
    '/api/v1/contacts/batch',
    { schema: { tags: ['Contacts'], summary: 'Batch create contacts' } },
    async (req, reply) => {
      const body = z
        .object({ contacts: z.array(contactWriteSchema).min(1).max(500) })
        .parse(req.body);

      const rows = await createContactsBatch(req.user!.orgId, body.contacts);
      return reply.code(201).send({ data: rows, total: rows.length });
    },
  );

  /**
   * PUT /api/v1/contacts/:id
   * Full or partial update. Re-validates email if email field is changed.
   */
  app.put(
    '/api/v1/contacts/:id',
    { schema: { tags: ['Contacts'], summary: 'Update contact' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = contactUpdateSchema.parse(req.body);

      let emailValidationScore: string | undefined;
      let emailValidatedAt: Date | undefined;

      if (patch.email) {
        const result = await validateEmail(patch.email, { checkMx: true });
        emailValidationScore = String(result.score);
        emailValidatedAt = new Date();
      }

      const contact = await updateContact(req.user!.orgId, id, {
        ...patch,
        ...(emailValidationScore !== undefined ? { emailValidationScore, emailValidatedAt } : {}),
      });
      return { data: contact };
    },
  );

  /**
   * PATCH /api/v1/contacts/:id/vip
   * Toggle the manual VIP designation.
   */
  app.patch(
    '/api/v1/contacts/:id/vip',
    { schema: { tags: ['Contacts'], summary: 'Set/unset VIP flag' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { isVip } = z.object({ isVip: z.boolean() }).parse(req.body);
      const contact = await updateContact(req.user!.orgId, id, { isVip });
      return { data: contact };
    },
  );

  /**
   * POST /api/v1/contacts/:id/archive
   * Archive a contact — removed from marketing + billing, data retained,
   * reversible. Distinct from soft-delete.
   */
  app.post(
    '/api/v1/contacts/:id/archive',
    { schema: { tags: ['Contacts'], summary: 'Archive contact (exclude from marketing + billing)' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const contact = await updateContact(req.user!.orgId, id, { status: 'archived' });
      return { data: contact };
    },
  );

  /**
   * POST /api/v1/contacts/:id/unarchive
   * Restore an archived contact back to active.
   */
  app.post(
    '/api/v1/contacts/:id/unarchive',
    { schema: { tags: ['Contacts'], summary: 'Unarchive contact' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const contact = await updateContact(req.user!.orgId, id, { status: 'active' });
      return { data: contact };
    },
  );

  /**
   * DELETE /api/v1/contacts/:id
   * Soft-delete a contact (sets deleted_at, not physically removed).
   */
  app.delete(
    '/api/v1/contacts/:id',
    { schema: { tags: ['Contacts'], summary: 'Delete contact' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await deleteContact(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/contacts/:id/anonymize
   * GDPR Art. 17 (right to be forgotten). Scrubs PII from the contact
   * row + behavioral PII (IP, UA) from related email_events. Inserts a
   * hash-based suppression so a future re-import can't resurrect the
   * identity. Returns { contactId, emailHash, anonymizedAt, emailEventsScrubbed }.
   * Requires admin or owner role.
   */
  app.post(
    '/api/v1/contacts/:id/anonymize',
    {
      preHandler: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Contacts', 'GDPR'],
        summary: 'Anonymize contact (GDPR right to be forgotten)',
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const result = await anonymizeContact(req.user!.orgId, id);
      return reply.send({ data: result });
    },
  );

  /**
   * GET /api/v1/contacts/:id/export-data
   * GDPR Art. 20 (data portability). Returns a JSON envelope with the
   * contact profile + last 365 days of email events. Stable shape for
   * hand-off to another ESP. Owner/admin can also pull it via
   * activity-export.csv; this endpoint is the JSON twin.
   */
  app.get(
    '/api/v1/contacts/:id/export-data',
    {
      schema: {
        tags: ['Contacts', 'GDPR'],
        summary: 'Export contact data (GDPR data portability)',
      },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const data = await exportContactData(req.user!.orgId, id);
      return reply
        .header('Content-Disposition', `attachment; filename="contact-${id}.json"`)
        .send({ data });
    },
  );

  /**
   * GET /api/v1/contacts/:id/activity
   * JSON timeline used by the contact detail page. Same source as
   * /activity-export, just unwrapped. Limited to 100 rows by default
   * since the UI paginates client-side via "load more".
   */
  app.get(
    '/api/v1/contacts/:id/activity',
    { schema: { tags: ['Contacts'], summary: 'Get contact activity timeline (JSON)' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const q = z
        .object({ limit: z.coerce.number().int().min(1).max(500).optional() })
        .parse(req.query);
      const activities = await getContactActivity(req.user!.orgId, id, q.limit ?? 100);
      return { data: activities };
    },
  );

  /**
   * GET /api/v1/contacts/:id/activity-export
   * Export contact activity (emails, orders, events, tickets) as CSV.
   */
  app.get(
    '/api/v1/contacts/:id/activity-export',
    { schema: { tags: ['Contacts'], summary: 'Download contact activity as CSV' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const q = z
        .object({ limit: z.coerce.number().int().min(1).max(50_000).optional() })
        .parse(req.query);
      const contact = await getContact(req.user!.orgId, id);
      const activities = await getContactActivity(req.user!.orgId, id, q.limit);
      const csv = formatActivityCsv(contact, activities);
      const filename = generateFilename(contact);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    },
  );
}
