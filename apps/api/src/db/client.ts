import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://forgemsg:forgemsg@localhost:5432/forgemsg';

// Disable prefetch for compatibility with PgBouncer transaction mode
const client = postgres(connectionString, {
  max: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
export { schema };
