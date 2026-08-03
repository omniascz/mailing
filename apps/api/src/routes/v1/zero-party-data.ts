import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client.js';
import { zpCollectionForms, zpContactData } from '../../db/schema/zero-party-data.js';
import { sql } from 'drizzle-orm';

export default async function zeroPartyDataRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // ── Collection forms ──────────────────────────────────────────────────────

  app.get('/api/v1/zero-party/forms', async (req) => {
    const rows = await db
      .select()
      .from(zpCollectionForms)
      .where(eq(zpCollectionForms.orgId, req.user!.orgId));
    return { data: rows };
  });

  const formSchema = z.object({
    name: z.string().min(1).max(100),
    questions: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          dataType: z.string(),
          options: z.array(z.string()).optional(),
          required: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(20),
  });

  app.post('/api/v1/zero-party/forms', async (req, reply) => {
    const body = formSchema.parse(req.body);
    const [row] = await db
      .insert(zpCollectionForms)
      .values({
        orgId: req.user!.orgId,
        name: body.name,
        questions: body.questions,
        embedToken: randomUUID(),
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.put('/api/v1/zero-party/forms/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = formSchema.partial().parse(req.body);
    const [row] = await db
      .update(zpCollectionForms)
      .set(body as never)
      .where(and(eq(zpCollectionForms.id, id), eq(zpCollectionForms.orgId, req.user!.orgId)))
      .returning();
    return { data: row };
  });

  app.delete('/api/v1/zero-party/forms/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .delete(zpCollectionForms)
      .where(and(eq(zpCollectionForms.id, id), eq(zpCollectionForms.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  // ── Contact preferences (submitted data) ─────────────────────────────────

  app.get('/api/v1/zero-party/contacts/:contactId', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const rows = await db
      .select()
      .from(zpContactData)
      .where(and(eq(zpContactData.orgId, req.user!.orgId), eq(zpContactData.contactId, contactId)));
    return { data: rows };
  });

  const preferenceSchema = z.object({
    contactId: z.string().uuid(),
    preferences: z
      .array(
        z.object({
          key: z.string().min(1),
          dataType: z.string(),
          value: z.unknown(),
        }),
      )
      .min(1)
      .max(50),
    source: z.enum(['form', 'api', 'import']).default('api'),
    formId: z.string().uuid().optional(),
  });

  app.post('/api/v1/zero-party/submit', async (req) => {
    const body = preferenceSchema.parse(req.body);
    const orgId = req.user!.orgId;
    const now = new Date();

    for (const pref of body.preferences) {
      await db
        .insert(zpContactData)
        .values({
          orgId,
          contactId: body.contactId,
          dataType: pref.dataType as (typeof zpContactData.$inferInsert)['dataType'],
          key: pref.key,
          value: pref.value,
          source: body.source,
          formId: body.formId,
          collectedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [zpContactData.orgId, zpContactData.contactId, zpContactData.key],
          set: { value: pref.value, updatedAt: now },
        });
    }

    // Update submission count on form
    if (body.formId) {
      await db.execute(
        sql`UPDATE zp_collection_forms SET submission_count = (submission_count::int + 1)::text WHERE id = ${body.formId} AND org_id = ${orgId}`,
      );
    }

    return { data: { saved: body.preferences.length } };
  });

  // Public form submission endpoint (no auth — uses embed token)
  app.post('/api/v1/zero-party/forms/:token/submit', { config: { public: true } }, async (req) => {
    const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        contactId: z.string().uuid(),
        preferences: z.array(z.object({ key: z.string(), value: z.unknown() })),
      })
      .parse(req.body);

    const [form] = await db
      .select()
      .from(zpCollectionForms)
      .where(and(eq(zpCollectionForms.embedToken, token), eq(zpCollectionForms.active, true)))
      .limit(1);
    if (!form) return { error: 'Form not found' };

    const now = new Date();
    for (const pref of body.preferences) {
      const question = form.questions.find((q) => q.key === pref.key);
      if (!question) continue;
      await db
        .insert(zpContactData)
        .values({
          orgId: form.orgId,
          contactId: body.contactId,
          dataType: question.dataType as (typeof zpContactData.$inferInsert)['dataType'],
          key: pref.key,
          value: pref.value,
          source: 'form',
          formId: form.id,
          collectedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [zpContactData.orgId, zpContactData.contactId, zpContactData.key],
          set: { value: pref.value, updatedAt: now },
        });
    }

    await db.execute(
      sql`UPDATE zp_collection_forms SET submission_count = (submission_count::int + 1)::text WHERE id = ${form.id}`,
    );

    return { data: { saved: body.preferences.length } };
  });
}
