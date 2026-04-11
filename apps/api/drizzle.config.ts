import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://forgemsg:forgemsg@localhost:5432/forgemsg',
  },
  verbose: true,
  strict: true,
} satisfies Config;
