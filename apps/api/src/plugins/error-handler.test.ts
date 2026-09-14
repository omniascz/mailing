/**
 * The database-error mapping, on its own.
 *
 * The behaviour that cannot be produced through a route is the one that
 * matters most here: an error the mapping does NOT recognise has to stay an
 * internal error. Returning null is how it says so, and the handler then falls
 * through to the 500 — but there is no honest way to make a real route raise,
 * say, a serialization failure on demand, so it is asserted here.
 *
 * The shapes below are the ones measured against forgemsg_itest2, including
 * the Drizzle wrapper: the SQLSTATE arrives on `.cause`, not on the error the
 * handler is given.
 */
import { describe, it, expect } from 'vitest';
import { mapDatabaseError } from './error-handler.js';

/** What postgres-js raises, as measured. */
const postgresError = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error('duplicate key value violates unique constraint "x_uq"'), {
    code,
    constraint_name: 'x_uq',
    table_name: 'x',
    detail: 'Key (org_id, keyword)=(3f03…, HELP) already exists.',
    ...extra,
  });

/** What Drizzle actually hands to the error handler. */
const drizzleWrapped = (code: string) =>
  Object.assign(new Error('Failed query: insert into "x" ("id", "org_id") values ($1, $2)'), {
    query: 'insert into "x" …',
    params: ['3f03…', 'HELP'],
    cause: postgresError(code),
  });

describe('mapDatabaseError', () => {
  it('maps a unique violation to 409', () => {
    expect(mapDatabaseError(postgresError('23505'))).toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });

  it('finds the code through the Drizzle wrapper', () => {
    // The whole reason the first attempt at this mapping did nothing: the
    // handler never sees a PostgresError, it sees a DrizzleQueryError.
    expect(mapDatabaseError(drizzleWrapped('23505'))).toMatchObject({ status: 409 });
    expect(mapDatabaseError(drizzleWrapped('23503'))).toMatchObject({ status: 400 });
  });

  it('maps a foreign key violation to 400', () => {
    expect(mapDatabaseError(postgresError('23503'))).toMatchObject({
      status: 400,
      code: 'INVALID_REFERENCE',
    });
  });

  it('maps a not-null violation to 400', () => {
    expect(mapDatabaseError(postgresError('23502'))).toMatchObject({
      status: 400,
      code: 'MISSING_FIELD',
    });
  });

  it('maps an over-long value to 400', () => {
    expect(mapDatabaseError(postgresError('22001'))).toMatchObject({
      status: 400,
      code: 'VALUE_TOO_LONG',
    });
  });

  it('leaves an unrecognised database error alone', () => {
    // 40001 is a serialization failure — a real database problem, not the
    // caller's doing. Null here means the handler answers 500, which is right.
    expect(mapDatabaseError(postgresError('40001'))).toBeNull();
    expect(mapDatabaseError(drizzleWrapped('53300'))).toBeNull();
  });

  it('ignores errors that are not from the database', () => {
    expect(mapDatabaseError(new Error('boom'))).toBeNull();
    expect(mapDatabaseError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBeNull();
    expect(
      mapDatabaseError(Object.assign(new Error('x'), { code: 'FST_ERR_CTP_EMPTY_JSON_BODY' })),
    ).toBeNull();
    expect(mapDatabaseError(null)).toBeNull();
    expect(mapDatabaseError(undefined)).toBeNull();
  });

  it('never returns anything taken from the error', () => {
    // The messages are constants; nothing from constraint_name, table_name,
    // detail or params may travel with them.
    for (const code of ['23505', '23503', '23502', '22001']) {
      const mapped = mapDatabaseError(postgresError(code))!;
      expect(mapped.message).not.toMatch(/x_uq|Key \(|HELP|3f03/);
    }
  });
});
