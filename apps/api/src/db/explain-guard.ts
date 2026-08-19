/**
 * LAYER 2 — EXPLAIN every query the application actually composes, before it runs.
 *
 * ─── Why layer 1 is not enough ──────────────────────────────────────────────
 *
 * Layer 1 reads source. It sees `WHERE ${whereSql}` and has no way to know what
 * `whereSql` will hold, so it substitutes something inert and moves on. That is
 * exactly where the `sending_domain` bug lived: `computeOrgHealth` only appended
 *
 *     if (opts.domain) whereClauses.push(sql`sending_domain = ${opts.domain}`)
 *
 * so the statement layer 1 can see is the one WITHOUT the filter, and it plans
 * perfectly. The broken column only exists in a fragment, and only when a caller
 * passes `?domain=`. No amount of static cleverness reaches it — the query does
 * not exist until the request arrives.
 *
 * This layer waits until it does. Every composed statement is handed to the
 * planner first, so a conditional branch is checked the moment a test walks it.
 *
 * ─── Where it hooks ─────────────────────────────────────────────────────────
 *
 * drizzle-orm/postgres-js funnels everything — db.execute, db.select(), every
 * query-builder call, in every session — through `client.unsafe(query, params)`.
 * Wrapping that one method catches the lot, with no per-call-site changes.
 *
 * ─── Why production pays nothing ────────────────────────────────────────────
 *
 * The switch is read exactly once, when the client is constructed (see
 * db/client.ts). If it is off, `installExplainGuard` is never called and
 * `client.unsafe` remains the driver's own function — no wrapper, no branch per
 * query, not one extra round trip. The module is imported either way, which
 * costs a few hundred bytes of parse at boot and nothing at all thereafter;
 * the alternative, a dynamic import, would make db/client.ts an async module
 * and change startup semantics for every importer, which is a far bigger
 * price than the one it saves.
 *
 * `explainGuardEnabled` additionally refuses under NODE_ENV=production, so a
 * stray environment variable in a deployment cannot arm it.
 */
import type { Sql } from 'postgres';

/** Statements the planner cannot be handed, or where EXPLAIN is meaningless. */
const NOT_EXPLAINABLE =
  /^\s*(begin|commit|rollback|savepoint|release|set\b|show\b|listen|notify|unlisten|discard|create|alter|drop|truncate|grant|revoke|comment|vacuum|analyze|reindex|cluster|copy|prepare|execute|deallocate|explain|do\b|call\b|refresh)\b/i;

/** Only these four can be planned as written. */
const EXPLAINABLE = /^\s*(select|with|insert|update|delete)\b/i;

export interface ExplainViolation {
  code: string;
  message: string;
  query: string;
}

const violations: ExplainViolation[] = [];

/** Everything the guard has rejected this process, for assertions in tests. */
export function getExplainViolations(): readonly ExplainViolation[] {
  return violations;
}

export function clearExplainViolations(): void {
  violations.length = 0;
}

/**
 * Decide whether the guard may run at all.
 *
 * Two conditions, both required: the flag is set, and we are not in production.
 * Belt and braces on purpose — the cost of this being on in production is a
 * doubled query count on every request, so a single misread variable should not
 * be able to cause it.
 */
export function explainGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.SQL_EXPLAIN_GUARD === '1' || env.SQL_EXPLAIN_GUARD === 'true';
}

/**
 * Wrap `client.unsafe` so every composed statement is planned before it runs.
 *
 * The shape of the wrapper is dictated by postgres.js. `unsafe()` returns a
 * Query — a Promise subclass that has NOT run yet; it dispatches on the first
 * `then` / `catch` / `finally`, and `.values()` / `.raw()` only set a flag and
 * hand back the same object. Drizzle relies on that: it calls
 * `client.unsafe(q, p).values()` and awaits the result.
 *
 * So we must return the real Query, not a plain promise wrapping it — replacing
 * it with a promise loses `.values()` and breaks every query builder call. What
 * we do instead is patch the three dispatch methods on that one instance, so
 * the EXPLAIN happens on the way to execution and the object is otherwise
 * exactly what the driver produced.
 *
 * Re-entrancy: the EXPLAIN is issued through the ORIGINAL unsafe, so it cannot
 * recurse back into the guard.
 */
export function installExplainGuard(client: Sql): void {
  const original = client.unsafe.bind(client) as Sql['unsafe'];

  const runExplain = async (query: string, params?: unknown[]): Promise<void> => {
    try {
      await (original as unknown as (q: string, p?: unknown[]) => Promise<unknown>)(
        `EXPLAIN ${query}`,
        params,
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const code = e.code ?? '';
      // Only schema faults are the guard's business. A type or syntax error
      // raised here would be raised by the real query a moment later anyway,
      // and replacing Postgres's own message with ours would make debugging
      // worse rather than better. So anything else is allowed through.
      if (code !== '42703' && code !== '42P01') return;

      const message = (e.message ?? String(err)).split('\n')[0]!;
      violations.push({ code, message, query });
      throw new Error(
        `[sql-explain-guard] ${code} ${message}\n` +
          `  This query names something the schema does not have. It was caught by the\n` +
          `  runtime guard (SQL_EXPLAIN_GUARD=1) before it ran.\n` +
          `  Query: ${query.replace(/\s+/g, ' ').slice(0, 400)}`,
      );
    }
  };

  /**
   * The driver's Query object as far as this file needs to see it. Patching a
   * third-party instance is structural by nature, so the looseness is declared
   * here in one place rather than sprayed through the code as casts.
   */
  type Dispatch = (...args: unknown[]) => unknown;
  interface PendingQuery {
    then: Dispatch;
    catch: Dispatch;
    finally: Dispatch;
  }
  type UnsafeFn = (query: string, params?: unknown[], options?: unknown) => PendingQuery;

  const rawUnsafe = original as unknown as UnsafeFn;

  const wrapped: UnsafeFn = (query, params, options) => {
    const pending = rawUnsafe(query, params, options);

    if (typeof query !== 'string') return pending;
    if (!EXPLAINABLE.test(query) || NOT_EXPLAINABLE.test(query)) return pending;

    // Bind the driver's own dispatch methods before shadowing them.
    const bound = {
      then: pending.then.bind(pending),
      finally: pending.finally.bind(pending),
    };

    // One EXPLAIN per Query, however many times it is chained onto.
    let checked: Promise<void> | null = null;
    const check = (): Promise<void> => (checked ??= runExplain(query, params));

    // `values()` / `raw()` return the same object, so shadowing survives them.
    pending.then = (onFulfilled, onRejected) =>
      check().then(
        () => bound.then(onFulfilled, onRejected),
        (guardErr: unknown) =>
          typeof onRejected === 'function'
            ? (onRejected as (e: unknown) => unknown)(guardErr)
            : Promise.reject(guardErr),
      );
    pending.catch = (onRejected) => pending.then(undefined, onRejected);
    pending.finally = (onFinally) =>
      check().then(
        () => bound.finally(onFinally),
        (guardErr: unknown) => {
          if (typeof onFinally === 'function') (onFinally as () => void)();
          return Promise.reject(guardErr);
        },
      );

    return pending;
  };

  client.unsafe = wrapped as unknown as Sql['unsafe'];
}
