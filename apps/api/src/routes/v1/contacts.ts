import type { FastifyInstance } from 'fastify';
import { paginationQuery } from '../../lib/zod-schemas.js';

export default async function contactRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/contacts',
    {
      schema: {
        tags: ['Contacts'],
        summary: 'List contacts',
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string' },
            status: { type: 'string', enum: ['active', 'unsubscribed', 'bounced', 'complained', 'pending'] },
            list_id: { type: 'string', format: 'uuid' },
            tag_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object' } },
              cursor: { type: 'string', nullable: true },
              hasMore: { type: 'boolean' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request) => {
      const query = paginationQuery.parse(request.query);

      // Placeholder — will be replaced with DB query in task 1.1
      return {
        data: [],
        cursor: null,
        hasMore: false,
        total: 0,
        _query: query,
      };
    },
  );
}
