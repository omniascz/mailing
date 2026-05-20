/**
 * DB router — region-aware database connection selector.
 *
 * In single-region deployments all orgs use the primary DB.
 * When EU data residency is enabled (data_region='eu'), requests
 * are routed to the EU-region replica/shard (configured via EU_DATABASE_URL env).
 *
 * Usage:
 *   const dbForOrg = getDbForRegion(org.dataRegion);
 */

import { db as primaryDb } from '../db/client.js';

type DataRegion = 'us' | 'eu' | 'ap';

let euDb: typeof primaryDb | null = null;
let apDb: typeof primaryDb | null = null;

/**
 * Initialize region-specific DB connections if env vars are set.
 * Called once at app startup.
 *
 * NOTE: Requires createDbClient to be exported from db/client.ts for multi-region.
 * TODO: implement createDbClient in db/client.ts for multi-region
 */
export function initRegionDbs(): void {
  // EU DB — lazily initialized when EU_DATABASE_URL is set
  if (process.env.EU_DATABASE_URL && !euDb) {
    // Dynamic import to avoid importing drizzle at module load if not needed
    import('../db/client.js')
      .then((mod) => {
        const createDbClient = (mod as Record<string, unknown>)['createDbClient'];
        if (typeof createDbClient === 'function') {
          euDb = (createDbClient as (url: string) => typeof primaryDb)(
            process.env.EU_DATABASE_URL!,
          );
        }
      })
      .catch(() => {
        /* fall back to primary */
      });
  }
  if (process.env.AP_DATABASE_URL && !apDb) {
    import('../db/client.js')
      .then((mod) => {
        const createDbClient = (mod as Record<string, unknown>)['createDbClient'];
        if (typeof createDbClient === 'function') {
          apDb = (createDbClient as (url: string) => typeof primaryDb)(
            process.env.AP_DATABASE_URL!,
          );
        }
      })
      .catch(() => {
        /* fall back to primary */
      });
  }
}

/**
 * Returns the correct DB client for the given region.
 * Falls back to primary if region-specific client is not configured.
 */
export function getDbForRegion(region: DataRegion | null | undefined): typeof primaryDb {
  if (region === 'eu' && euDb) return euDb;
  if (region === 'ap' && apDb) return apDb;
  return primaryDb;
}

export { primaryDb as db };
