/**
 * Smart scheduling routes (#211)
 *
 *  POST /api/v1/scheduling/smart-slots   — get AI-selected meeting slots for a contact
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSmartSlots, inferTimezone } from '../../services/scheduling/smart-slot.js';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';

const schedulingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/scheduling/smart-slots', {
    preHandler: [app.authenticate],
    schema: { tags: ['Scheduling'], summary: 'Get AI-selected meeting slots for a contact' },
  }, async (req) => {
    const body = z.object({
      contactId: z.string().uuid(),
      repEmail: z.string().email(),
      count: z.number().int().min(1).max(10).optional(),
      durationMinutes: z.number().int().min(15).max(120).optional(),
      fromDate: z.string().optional(),
      availabilityWindowUtc: z.object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(1).max(24),
      }).optional(),
    }).parse(req.body);

    const orgId = req.user!.orgId;

    // Load contact to infer timezone
    const [contact] = await db.select({
      customFields: contacts.customFields,
    }).from(contacts)
      .where(and(eq(contacts.id, body.contactId), eq(contacts.orgId, orgId)))
      .limit(1);

    const contactTimezone = contact
      ? inferTimezone({ customFields: (contact.customFields ?? {}) as Record<string, unknown> })
      : 'UTC';

    const slots = getSmartSlots({
      repEmail: body.repEmail,
      contactTimezone,
      count: body.count,
      durationMinutes: body.durationMinutes,
      fromDate: body.fromDate,
      availabilityWindowUtc: body.availabilityWindowUtc,
    });

    return { data: { slots, contactTimezone } };
  });
};

export default schedulingRoutes;
