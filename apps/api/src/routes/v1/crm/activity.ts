import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContactActivityFeed, type ActivityItem } from '../../../services/crm/activity-feed.js';

const contactIdParam = z.object({ contactId: z.string().uuid() });

const ACTIVITY_TYPES: ActivityItem['type'][] = [
  'email_sent',
  'email_open',
  'email_click',
  'email_bounce',
  'email_unsubscribe',
  'sms_sent',
  'sms_delivered',
  'sms_failed',
  'deal_created',
  'deal_stage_changed',
  'deal_won',
  'deal_lost',
  'note_added',
  'task_created',
  'task_completed',
  'custom_event',
];

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(),
  types: z.string().optional(), // comma-separated list of ActivityItem['type']
});

export default async function crmActivityRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/crm/contacts/:contactId/activity',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['CRM'], summary: 'Get contact activity feed' },
    },
    async (req) => {
      const { contactId } = contactIdParam.parse(req.params);
      const q = listQuery.parse(req.query);

      const types = q.types
        ? (q.types
            .split(',')
            .filter((t) =>
              ACTIVITY_TYPES.includes(t as ActivityItem['type']),
            ) as ActivityItem['type'][])
        : undefined;

      return getContactActivityFeed(req.user!.orgId, contactId, {
        limit: q.limit,
        before: q.before ? new Date(q.before) : undefined,
        types,
      });
    },
  );
}
