/**
 * Gender inference routes (#637–#640).
 *
 *   POST   /api/v1/contacts/infer-gender            — infer gender for a list of names
 *   POST   /api/v1/contacts/:id/infer-gender        — infer + auto-fill for a contact
 *   GET    /api/v1/contacts/:id/salutation          — get formatted salutation string
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { inferGender, buildSalutation } from '../../services/gender/cz-sk-inference.js';

export default async function genderRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Bulk inference (no DB writes — just returns predictions)
  app.post('/api/v1/contacts/infer-gender', auth, async (req, reply) => {
    const body = z.object({
      names: z.array(z.string().max(100)).max(500),
      countryCode: z.string().length(2).optional(),
      useFallback: z.boolean().default(false), // use genderize.io for unknowns
    }).parse(req.body);

    const results = await Promise.all(
      body.names.map(async (name) => {
        const local = inferGender(name);
        if (local.gender !== 'unknown' || !body.useFallback) {
          return { name, ...local };
        }
        // International fallback via genderize.io
        const { inferGenderInternational } = await import(
          '../../services/gender/genderize-api.js'
        );
        const intl = await inferGenderInternational(name, body.countryCode);
        return { name, ...intl };
      }),
    );

    return reply.send({ data: results });
  });

  // Infer + auto-fill for a specific contact
  app.post('/api/v1/contacts/:id/infer-gender', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { useFallback } = z.object({ useFallback: z.boolean().default(false) }).parse(req.body ?? {});

    const [contact] = await db
      .select({ id: contacts.id, firstName: contacts.firstName, gender: contacts.gender })
      .from(contacts)
      .where(and(eq(contacts.orgId, req.user!.orgId), eq(contacts.id, id)))
      .limit(1);

    if (!contact) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Contact not found' });
    if (!contact.firstName) {
      return reply.send({ data: { gender: 'unknown', confidence: 0, source: 'unknown', updated: false } });
    }

    let result = inferGender(contact.firstName);
    if (result.gender === 'unknown' && useFallback) {
      const { inferGenderFull } = await import('../../services/gender/genderize-api.js');
      result = await inferGenderFull(contact.firstName);
    }

    if (result.gender !== 'unknown') {
      await db
        .update(contacts)
        .set({ gender: result.gender })
        .where(eq(contacts.id, id));
    }

    return reply.send({ data: { ...result, updated: result.gender !== 'unknown' } });
  });

  // Get salutation for a contact
  app.get('/api/v1/contacts/:id/salutation', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { style } = req.query as { style?: 'formal' | 'informal' };

    const [contact] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName, gender: contacts.gender })
      .from(contacts)
      .where(and(eq(contacts.orgId, req.user!.orgId), eq(contacts.id, id)))
      .limit(1);

    if (!contact) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Contact not found' });

    const gender = (contact.gender ?? 'unknown') as 'male' | 'female' | 'unknown';
    const salutation = buildSalutation(gender, contact.firstName, contact.lastName, style ?? 'formal');

    return reply.send({ data: { salutation, gender, style: style ?? 'formal' } });
  });
}
