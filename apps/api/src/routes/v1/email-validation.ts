/**
 * Bulk email validation API (§9 P1).
 *
 *   POST /api/v1/email-validation/bulk
 *     body: { emails: string[] (≤ 5000), syntaxOnly?: boolean }
 *     → BulkValidationReport
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { bulkValidate } from '../../services/email-validation/bulk.js';

const emailValidationRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/email-validation/bulk',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['EmailValidation'],
        summary: 'Validate up to 5 000 email addresses in a single request',
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          emails: z.array(z.string().max(320)).min(1).max(5_000),
          syntaxOnly: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: body.error.issues.map((i) => i.message).join('; '),
        });
      }

      const report = await bulkValidate(body.data.emails, {
        syntaxOnly: body.data.syntaxOnly,
      });
      return reply.send({ data: report });
    },
  );
};

export default emailValidationRoutes;
