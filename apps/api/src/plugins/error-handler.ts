import type { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';

async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    if (error instanceof ZodError) {
      const details = error.issues.map((i: { path: (string | number)[]; message: string }) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      request.log.warn({ err: error as Error }, 'Validation error');
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        statusCode: 400,
        details,
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        code: 'RATE_LIMIT',
        message: 'Too many requests',
        statusCode: 429,
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });
}

export default fp(errorHandler, { name: 'error-handler' });
