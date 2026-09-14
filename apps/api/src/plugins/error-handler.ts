import type { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error.js';
import { captureException } from '../lib/telemetry.js';

/**
 * The fields a postgres-js `PostgresError` actually carries. Measured against
 * forgemsg_itest2 rather than recalled:
 *
 *   23505  code, constraint_name, table_name, detail
 *   23503  code, constraint_name, table_name, detail
 *   23502  code, table_name, column_name, detail
 *   22001  code only — no constraint, no table, no column
 *
 * `detail` is the dangerous one. On a unique violation it reads
 * `Key (org_id, number)=(3f03…, +420777000111) already exists.`, and on a
 * not-null violation it contains the ENTIRE failing row. None of it may reach a
 * client; all of it belongs in the log, which already receives the whole error.
 */
interface DatabaseError {
  code?: unknown;
  cause?: unknown;
}

/**
 * Finds the SQLSTATE, wherever Drizzle has put it.
 *
 * Measured, because assuming would have been wrong: a failed query does not
 * reach the handler as a PostgresError. Drizzle wraps it in a
 * `DrizzleQueryError` whose own `code` is undefined and whose own keys are
 * `query`, `params` and `cause` — the SQLSTATE is one level down, on `.cause`.
 * That wrapper is another reason nothing from the error may be echoed back: its
 * message begins `Failed query: insert into "sms_keywords" ("id", …` and
 * `params` carries the bound values.
 */
function sqlStateOf(error: unknown): string | null {
  let current = error as DatabaseError | null;
  // Bounded: the chain is one deep today, and a cycle must not hang the error
  // handler of all places.
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = current.code;
    // Postgres SQLSTATEs are five characters. Fastify uses FST_ERR_*, Node uses
    // ECONNREFUSED and friends, so this cannot collide with either.
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause as DatabaseError | null;
  }
  return null;
}

/**
 * Turns a Postgres error into an answer the caller can act on.
 *
 * Returns null for anything it does not recognise, which falls through to the
 * 500 below — an unmapped database failure is still an internal error, and
 * guessing at it would be worse than saying so.
 *
 * Exported for its unit test; the plugin below is the only caller.
 */
export function mapDatabaseError(
  error: unknown,
): { status: number; code: string; message: string } | null {
  const code = sqlStateOf(error);
  if (!code) return null;

  switch (code) {
    case '23505':
      // A row with these values is already there. The route may have checked
      // first and lost a race, or may never have checked at all; either way the
      // request cannot be satisfied, and that is not a server fault.
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'A record with these values already exists.',
      };
    case '23503':
      // Almost always the insert/update side: something was referenced that
      // does not exist. Measured on this schema: 338 of 407 foreign keys
      // cascade and 66 set null, so only three could ever block a delete —
      // hence 400 rather than 409, with wording that covers the rare case too.
      return {
        status: 400,
        code: 'INVALID_REFERENCE',
        message:
          'The request refers to a record that does not exist, or to one that cannot be ' +
          'removed while something else still points at it.',
      };
    case '23502':
      // A required column arrived empty: the request passed Zod and still could
      // not be stored, which is a 400 rather than a crash.
      return {
        status: 400,
        code: 'MISSING_FIELD',
        message: 'A required field was missing from the request.',
      };
    case '22001':
      // This error carries no column name at all, so the message cannot say
      // which field — saying that plainly beats inventing a guess.
      return {
        status: 400,
        code: 'VALUE_TOO_LONG',
        message: 'One of the submitted values is longer than this field allows.',
      };
    default:
      return null;
  }
}

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

    // Database errors the caller can do something about. The full error — with
    // its constraint name, table and `detail` — goes to the log; the client
    // gets only the sentence above, which names nothing from the row.
    const mapped = mapDatabaseError(error);
    if (mapped) {
      request.log.warn({ err: error }, `Database error mapped to ${mapped.status}`);
      return reply
        .status(mapped.status)
        .send({ code: mapped.code, message: mapped.message, statusCode: mapped.status });
    }

    request.log.error({ err: error }, 'Unhandled error');
    captureException(error, {
      orgId: request.user?.orgId,
      userId: request.user?.userId,
      requestId: request.id,
      route: `${request.method} ${request.routeOptions?.url ?? request.url}`,
    });
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
