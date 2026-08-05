import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tags, contactTags, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(HEX_COLOR, 'Must be a 6-digit hex color, e.g. #64748b').optional(),
  autoTagRules: z.record(z.unknown()).optional(),
});

const updateTagSchema = createTagSchema.partial();

const idParam = z.object({ id: z.string().uuid() });

const bulkTagSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(5000),
  tag_ids: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['add', 'remove']),
});

// ─── Route plugin ────────────────────────────────────────────────────────────

export default async function tagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/tags
   * List all tags for the current organisation.
   */
  app.get('/api/v1/tags', { schema: { tags: ['Tags'], summary: 'List tags' } }, async (req) => {
    const rows = await db
      .select()
      .from(tags)
      .where(eq(tags.orgId, req.user!.orgId))
      .orderBy(asc(tags.name));
    return { data: rows };
  });

  /**
   * POST /api/v1/tags
   * Create a new tag. Names are unique per organisation.
   */
  app.post(
    '/api/v1/tags',
    { schema: { tags: ['Tags'], summary: 'Create tag' } },
    async (req, reply) => {
      const body = createTagSchema.parse(req.body);
      const [row] = await db
        .insert(tags)
        .values({ orgId: req.user!.orgId, ...body })
        .returning()
        .catch((err: Error) => {
          if (err.message.includes('tags_org_name_idx')) {
            throw AppError.conflict(`Tag "${body.name}" already exists`);
          }
          throw err;
        });
      return reply.code(201).send({ data: row });
    },
  );

  /**
   * GET /api/v1/tags/:id
   * Get a single tag.
   */
  app.get('/api/v1/tags/:id', { schema: { tags: ['Tags'], summary: 'Get tag' } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), eq(tags.orgId, req.user!.orgId)))
      .limit(1);
    if (!row) throw AppError.notFound('Tag');
    return { data: row };
  });

  /**
   * PUT /api/v1/tags/:id
   * Update tag name, color, or autoTagRules.
   */
  app.put(
    '/api/v1/tags/:id',
    { schema: { tags: ['Tags'], summary: 'Update tag' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = updateTagSchema.parse(req.body);
      const [row] = await db
        .update(tags)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tags.id, id), eq(tags.orgId, req.user!.orgId)))
        .returning()
        .catch((err: Error) => {
          if (err.message.includes('tags_org_name_idx')) {
            throw AppError.conflict(`Tag "${patch.name}" already exists`);
          }
          throw err;
        });
      if (!row) throw AppError.notFound('Tag');
      return { data: row };
    },
  );

  /**
   * DELETE /api/v1/tags/:id
   * Delete a tag and remove all contact associations.
   */
  app.delete(
    '/api/v1/tags/:id',
    { schema: { tags: ['Tags'], summary: 'Delete tag' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const [row] = await db
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Tag');
      return reply.code(204).send();
    },
  );

  /**
   * GET /api/v1/tags/:id/contacts/count
   * Return the number of contacts that have this tag.
   */
  app.get(
    '/api/v1/tags/:id/contacts/count',
    { schema: { tags: ['Tags'], summary: 'Count contacts with tag' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      // Ensure tag belongs to org
      const [tag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.orgId, req.user!.orgId)))
        .limit(1);
      if (!tag) throw AppError.notFound('Tag');

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contactTags)
        .innerJoin(
          contacts,
          and(eq(contacts.id, contactTags.contactId), isNull(contacts.deletedAt)),
        )
        .where(eq(contactTags.tagId, id));
      return { data: { count: row?.count ?? 0 } };
    },
  );

  /**
   * POST /api/v1/contacts/bulk-tag
   * Add or remove tags from multiple contacts in one request.
   *
   * Body: { contact_ids: string[], tag_ids: string[], action: 'add' | 'remove' }
   */
  app.post(
    '/api/v1/contacts/bulk-tag',
    { schema: { tags: ['Tags', 'Contacts'], summary: 'Bulk tag / untag contacts' } },
    async (req, reply) => {
      const body = bulkTagSchema.parse(req.body);
      const orgId = req.user!.orgId;

      // Verify all tags belong to this org
      const ownedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.orgId, orgId), sql`${tags.id} = ANY(${sql.param(body.tag_ids)}::uuid[])`));

      if (ownedTags.length !== body.tag_ids.length) {
        throw AppError.forbidden('One or more tags do not belong to this organisation');
      }

      // Verify all contacts belong to this org (only active, non-deleted)
      const ownedContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            isNull(contacts.deletedAt),
            sql`${contacts.id} = ANY(${sql.param(body.contact_ids)}::uuid[])`,
          ),
        );

      const validContactIds = ownedContacts.map((c) => c.id);

      if (body.action === 'add') {
        if (validContactIds.length === 0) return reply.code(200).send({ data: { affected: 0 } });

        const rows: { contactId: string; tagId: string }[] = [];
        for (const contactId of validContactIds) {
          for (const tagId of body.tag_ids) {
            rows.push({ contactId, tagId });
          }
        }
        await db.insert(contactTags).values(rows).onConflictDoNothing();

        // Fire `tag_added` workflow triggers (fire-and-forget). Resolve tag
        // names once; the trigger matches workflows by tag name.
        const nameRows = await db
          .select({ name: tags.name })
          .from(tags)
          .where(and(eq(tags.orgId, orgId), sql`${tags.id} = ANY(${sql.param(body.tag_ids)}::uuid[])`));
        const tagNames = nameRows.map((t) => t.name);
        void import('../../services/workflows/triggers.js')
          .then((m) => {
            for (const contactId of validContactIds) {
              for (const name of tagNames) {
                m.onTagAdded(orgId, contactId, name).catch(() => {});
              }
            }
          })
          .catch(() => {});

        return { data: { affected: rows.length } };
      }

      // action === 'remove'
      if (validContactIds.length === 0) return reply.code(200).send({ data: { affected: 0 } });

      const deleted = await db
        .delete(contactTags)
        .where(
          and(
            sql`${contactTags.contactId} = ANY(${sql.param(validContactIds)}::uuid[])`,
            sql`${contactTags.tagId} = ANY(${sql.param(body.tag_ids)}::uuid[])`,
          ),
        )
        .returning();
      return { data: { affected: deleted.length } };
    },
  );
}
