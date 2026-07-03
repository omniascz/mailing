/**
 * Data-residency wiring — connects the pure resolution rules (pure.ts) to the
 * org's stored `data_region`, so storage/export code routes to region-correct
 * endpoints and cross-region access is guarded.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  resolveRegionEndpoints,
  guardCrossRegion,
  isDataRegion,
  type DataRegion,
  type RegionEndpoints,
} from './pure.js';

export { suggestRegionForCountry, DATA_REGIONS, isDataRegion } from './pure.js';
export type { DataRegion, RegionEndpoints } from './pure.js';

/** Optional per-deployment endpoint overrides from env (JSON). */
function endpointOverrides(): Parameters<typeof resolveRegionEndpoints>[1] {
  const raw = process.env.DATA_REGION_OVERRIDES;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** The org's canonical data region. */
export async function getOrgRegion(orgId: string): Promise<DataRegion> {
  const [org] = await db
    .select({ region: organizations.dataRegion })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const region = org?.region ?? 'us';
  return isDataRegion(region) ? region : 'us';
}

/** Resolve the storage/DB endpoints serving the org's region. */
export async function resolveOrgEndpoints(orgId: string): Promise<RegionEndpoints> {
  const region = await getOrgRegion(orgId);
  return resolveRegionEndpoints(region, endpointOverrides());
}

/** Set the org's data region (validates the value). */
export async function setOrgRegion(orgId: string, region: string): Promise<DataRegion> {
  if (!isDataRegion(region)) throw AppError.badRequest(`Invalid data region: ${region}`);
  await db
    .update(organizations)
    .set({ dataRegion: region, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
  return region;
}

/**
 * Throw 403 if a resource in `resourceRegion` may not be accessed by an org in
 * its region. Storage/export code that touches region-tagged resources (S3
 * buckets, cross-region reads) should call this.
 */
export async function assertResourceRegion(
  orgId: string,
  resourceRegion: DataRegion | null,
  resource: string,
): Promise<void> {
  const orgRegion = await getOrgRegion(orgId);
  const result = guardCrossRegion({ orgRegion, resourceRegion, resource });
  if (!result.allowed) throw AppError.forbidden(result.reason ?? 'cross-region access denied');
}
