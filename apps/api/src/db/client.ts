import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import { explainGuardEnabled, installExplainGuard } from './explain-guard.js';
import { POOL_APPLICATION_NAME } from './stuck-connection-reaper.js';

export const connectionString =
  process.env.DATABASE_URL || 'postgresql://forgemsg:forgemsg@localhost:5432/forgemsg';

// Disable prefetch for compatibility with PgBouncer transaction mode
const client = postgres(connectionString, {
  max: 10,
  prepare: false,
  // Names every backend this pool opens, so the stuck-connection watchdog can
  // scope pg_terminate_backend to our own sessions and nothing else sharing
  // the database. See db/stuck-connection-reaper.ts.
  connection: { application_name: POOL_APPLICATION_NAME },
});

// Test-only: EXPLAIN every composed statement before running it, to catch
// queries naming columns the schema does not have — including the ones only
// assembled on a conditional branch, which no static pass can see.
//
// The decision is made once, at construction. When the guard is off — always,
// in production, where explainGuardEnabled() refuses regardless of the flag —
// `client.unsafe` remains the driver's own function. Nothing is wrapped, no
// branch runs per query, and the process issues exactly the statements it
// issued before this existed. See db/explain-guard.ts.
if (explainGuardEnabled()) {
  installExplainGuard(client);
}

export const db = drizzle(client, { schema });

export type Database = typeof db;
export { schema };
