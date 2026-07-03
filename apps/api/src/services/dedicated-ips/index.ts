/**
 * Dedicated IP management service.
 *
 * Responsibilities:
 *  - IP pool CRUD (grouping IPs by traffic class)
 *  - Dedicated IP allocation / retirement
 *  - Warmup progress tracking (day-by-day volume ramp)
 *  - IP selection for the engine at send time (pool → least-loaded IP)
 *  - Reputation signal ingestion (bounce/complaint rates, blacklist checks)
 */

import { and, eq, desc, sql, isNull, inArray, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  ipPools,
  dedicatedIps,
  ipWarmupSchedules,
  organizations,
  type IpPool,
  type DedicatedIp,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Default warmup ramp (30-day ReturnPath-style) ────────────────────────────

const DEFAULT_WARMUP_RAMP: Array<{ day: number; maxVolume: number }> = [
  { day: 1, maxVolume: 50 },
  { day: 2, maxVolume: 100 },
  { day: 3, maxVolume: 500 },
  { day: 4, maxVolume: 1000 },
  { day: 5, maxVolume: 5000 },
  { day: 6, maxVolume: 10000 },
  { day: 7, maxVolume: 20000 },
  { day: 8, maxVolume: 40000 },
  { day: 9, maxVolume: 70000 },
  { day: 10, maxVolume: 100000 },
  { day: 11, maxVolume: 150000 },
  { day: 12, maxVolume: 200000 },
  { day: 13, maxVolume: 250000 },
  { day: 14, maxVolume: 300000 },
  { day: 15, maxVolume: 400000 },
  { day: 16, maxVolume: 500000 },
  { day: 17, maxVolume: 600000 },
  { day: 18, maxVolume: 700000 },
  { day: 19, maxVolume: 800000 },
  { day: 20, maxVolume: 900000 },
  { day: 21, maxVolume: 1_000_000 },
  { day: 22, maxVolume: 1_250_000 },
  { day: 23, maxVolume: 1_500_000 },
  { day: 24, maxVolume: 1_750_000 },
  { day: 25, maxVolume: 2_000_000 },
  { day: 26, maxVolume: 2_500_000 },
  { day: 27, maxVolume: 3_000_000 },
  { day: 28, maxVolume: 3_500_000 },
  { day: 29, maxVolume: 4_000_000 },
  { day: 30, maxVolume: 5_000_000 },
];

// ─── IP Pools ─────────────────────────────────────────────────────────────────

export async function createIpPool(
  orgId: string,
  input: {
    name: string;
    description?: string;
    type?: 'marketing' | 'transactional' | 'cold_outreach' | 'warming' | 'shared' | 'dedicated';
    isDefault?: boolean;
    allowedCampaignTypes?: string;
    perIpDailyLimit?: number;
  },
): Promise<IpPool> {
  if (input.name.length === 0) throw AppError.badRequest('Pool name is required');

  return db.transaction(async (tx) => {
    if (input.isDefault) {
      // Clear any existing default
      await tx
        .update(ipPools)
        .set({ isDefault: false })
        .where(and(eq(ipPools.orgId, orgId), eq(ipPools.isDefault, true)));
    }

    const [pool] = await tx
      .insert(ipPools)
      .values({
        orgId,
        name: input.name,
        description: input.description,
        type: input.type ?? 'marketing',
        isDefault: input.isDefault ?? false,
        allowedCampaignTypes: input.allowedCampaignTypes ?? 'email',
        perIpDailyLimit: input.perIpDailyLimit ?? 0,
      })
      .returning()
      .catch((err: Error) => {
        if (err.message.includes('ip_pools_org_name_idx')) {
          throw AppError.conflict(`Pool "${input.name}" already exists`);
        }
        throw err;
      });

    // Seed default warmup schedule
    await tx.insert(ipWarmupSchedules).values(
      DEFAULT_WARMUP_RAMP.map((r) => ({
        poolId: pool!.id,
        day: r.day,
        maxVolume: r.maxVolume,
      })),
    );

    return pool!;
  });
}

export async function listIpPools(orgId: string): Promise<IpPool[]> {
  return db
    .select()
    .from(ipPools)
    .where(and(eq(ipPools.orgId, orgId), isNull(ipPools.deletedAt)))
    .orderBy(desc(ipPools.isDefault), ipPools.name);
}

export async function getIpPool(orgId: string, id: string): Promise<IpPool> {
  const [pool] = await db
    .select()
    .from(ipPools)
    .where(and(eq(ipPools.id, id), eq(ipPools.orgId, orgId), isNull(ipPools.deletedAt)))
    .limit(1);
  if (!pool) throw AppError.notFound('IpPool');
  return pool;
}

export async function updateIpPool(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    isDefault: boolean;
    perIpDailyLimit: number;
    allowedCampaignTypes: string;
  }>,
): Promise<IpPool> {
  await getIpPool(orgId, id);

  return db.transaction(async (tx) => {
    if (patch.isDefault) {
      await tx
        .update(ipPools)
        .set({ isDefault: false })
        .where(and(eq(ipPools.orgId, orgId), eq(ipPools.isDefault, true)));
    }
    const [row] = await tx
      .update(ipPools)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(ipPools.id, id))
      .returning();
    return row!;
  });
}

export async function deleteIpPool(orgId: string, id: string): Promise<void> {
  await getIpPool(orgId, id);
  await db.transaction(async (tx) => {
    await tx
      .update(ipPools)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(ipPools.id, id));
    // Orphan IPs (keep them, just detach pool)
    await tx.update(dedicatedIps).set({ poolId: null }).where(eq(dedicatedIps.poolId, id));
  });
}

// ─── Dedicated IPs ────────────────────────────────────────────────────────────

/**
 * Allocate a system IP to an org. Called by admin tooling or auto-allocation
 * when an org subscribes to a dedicated IP plan.
 *
 * Accepts an explicit IP address (admin-provisioned) or picks one from the
 * unassigned pool.
 */
export async function allocateDedicatedIp(input: {
  orgId: string;
  poolId?: string;
  ipAddress?: string;
  ptrRecord?: string;
  region?: string;
  startWarmup?: boolean;
}): Promise<DedicatedIp> {
  return db.transaction(async (tx) => {
    let row: DedicatedIp | undefined;

    if (input.ipAddress) {
      // Admin is assigning a specific (pre-existing) address row.
      const [existing] = await tx
        .select()
        .from(dedicatedIps)
        .where(eq(dedicatedIps.ipAddress, input.ipAddress))
        .limit(1);

      if (existing) {
        if (existing.orgId && existing.orgId !== input.orgId) {
          throw AppError.conflict(`IP ${input.ipAddress} is already allocated to another org`);
        }
        [row] = await tx
          .update(dedicatedIps)
          .set({
            orgId: input.orgId,
            poolId: input.poolId ?? existing.poolId,
            ptrRecord: input.ptrRecord ?? existing.ptrRecord,
            region: input.region ?? existing.region,
            status: input.startWarmup ? 'warming' : 'active',
            warmupStartedAt: input.startWarmup ? new Date() : existing.warmupStartedAt,
            warmupDay: input.startWarmup ? 1 : existing.warmupDay,
            allocatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dedicatedIps.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(dedicatedIps)
          .values({
            ipAddress: input.ipAddress,
            ptrRecord: input.ptrRecord,
            orgId: input.orgId,
            poolId: input.poolId,
            region: input.region ?? 'us-east',
            status: input.startWarmup ? 'warming' : 'active',
            warmupStartedAt: input.startWarmup ? new Date() : null,
            warmupDay: input.startWarmup ? 1 : 0,
            allocatedAt: new Date(),
          })
          .returning();
      }
    } else {
      // Pick an unassigned IP from the system pool.
      const [free] = await tx
        .select()
        .from(dedicatedIps)
        .where(and(isNull(dedicatedIps.orgId), eq(dedicatedIps.status, 'pending')))
        .limit(1);
      if (!free) {
        throw AppError.badRequest('No unallocated IPs available — provision a new one first');
      }
      [row] = await tx
        .update(dedicatedIps)
        .set({
          orgId: input.orgId,
          poolId: input.poolId ?? null,
          status: input.startWarmup ? 'warming' : 'active',
          warmupStartedAt: input.startWarmup ? new Date() : null,
          warmupDay: input.startWarmup ? 1 : 0,
          allocatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dedicatedIps.id, free.id))
        .returning();
    }

    return row!;
  });
}

export async function listDedicatedIps(
  orgId: string,
  opts: { poolId?: string; status?: string } = {},
): Promise<DedicatedIp[]> {
  const conditions = [eq(dedicatedIps.orgId, orgId)];
  if (opts.poolId) conditions.push(eq(dedicatedIps.poolId, opts.poolId));
  if (opts.status)
    conditions.push(
      eq(dedicatedIps.status, opts.status as (typeof dedicatedIps.status.enumValues)[number]),
    );
  return db
    .select()
    .from(dedicatedIps)
    .where(and(...conditions))
    .orderBy(desc(dedicatedIps.reputationScore), dedicatedIps.ipAddress);
}

export async function getDedicatedIp(orgId: string, id: string): Promise<DedicatedIp> {
  const [ip] = await db
    .select()
    .from(dedicatedIps)
    .where(and(eq(dedicatedIps.id, id), eq(dedicatedIps.orgId, orgId)))
    .limit(1);
  if (!ip) throw AppError.notFound('DedicatedIp');
  return ip;
}

export interface PtrVerifyResult {
  ipAddress: string;
  /** The PTR record configured on the IP row (expected hostname). */
  configuredPtr: string | null;
  /** Hostnames returned by the live reverse-DNS (PTR) lookup. */
  resolvedPtr: string[];
  /** The configured PTR appears in the live reverse-DNS answer. */
  matchesConfigured: boolean;
  /**
   * Forward-Confirmed reverse DNS: at least one PTR hostname forward-resolves
   * back to this IP. This is what receiving MTAs actually check.
   */
  forwardConfirmed: boolean;
  checkedAt: string;
}

/**
 * Pure: decide PTR match + FCrDNS from raw DNS answers. Hostnames are compared
 * case-insensitively with any trailing dot stripped.
 */
export function evaluatePtr(
  ipAddress: string,
  configuredPtr: string | null,
  resolvedPtr: string[],
  forwardMap: Record<string, string[]>,
  checkedAt: string,
): PtrVerifyResult {
  const norm = (h: string) => h.toLowerCase().replace(/\.$/, '');
  const resolved = resolvedPtr.map(norm);
  const cfg = configuredPtr ? norm(configuredPtr) : null;
  const matchesConfigured = cfg != null && resolved.includes(cfg);
  const forwardConfirmed = resolved.some((h) => (forwardMap[h] ?? []).includes(ipAddress));
  return {
    ipAddress,
    configuredPtr,
    resolvedPtr: resolved,
    matchesConfigured,
    forwardConfirmed,
    checkedAt,
  };
}

/**
 * Verify an IP's reverse DNS (PTR) live: reverse-lookup the address, then
 * forward-resolve each returned hostname to confirm FCrDNS. Best-effort — DNS
 * failures resolve to empty answers rather than throwing.
 */
export async function verifyIpPtr(orgId: string, id: string): Promise<PtrVerifyResult> {
  const ip = await getDedicatedIp(orgId, id);
  const dns = await import('node:dns/promises');

  const resolvedPtr = await dns.reverse(ip.ipAddress).catch(() => [] as string[]);
  const forwardMap: Record<string, string[]> = {};
  await Promise.all(
    resolvedPtr.map(async (host) => {
      const v4 = await dns.resolve4(host).catch(() => [] as string[]);
      const v6 = await dns.resolve6(host).catch(() => [] as string[]);
      forwardMap[host.toLowerCase().replace(/\.$/, '')] = [...v4, ...v6];
    }),
  );

  return evaluatePtr(ip.ipAddress, ip.ptrRecord, resolvedPtr, forwardMap, new Date().toISOString());
}

export async function assignIpToPool(
  orgId: string,
  ipId: string,
  poolId: string | null,
): Promise<DedicatedIp> {
  await getDedicatedIp(orgId, ipId);
  if (poolId) await getIpPool(orgId, poolId);
  const [updated] = await db
    .update(dedicatedIps)
    .set({ poolId, updatedAt: new Date() })
    .where(eq(dedicatedIps.id, ipId))
    .returning();
  return updated!;
}

/**
 * Delegate (or un-delegate, subaccountId=null) a dedicated IP to a subaccount.
 * The IP must be owned by `parentOrgId` and the subaccount must be a child of
 * it. Isolates the child's sending reputation onto its own IP.
 */
export async function assignIpToSubaccount(
  parentOrgId: string,
  ipId: string,
  subaccountId: string | null,
): Promise<DedicatedIp> {
  await getDedicatedIp(parentOrgId, ipId); // ownership check (throws 404 otherwise)
  if (subaccountId) {
    const [child] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, subaccountId), eq(organizations.parentOrgId, parentOrgId)))
      .limit(1);
    if (!child) throw AppError.badRequest('subaccountId is not a child of this organisation');
  }
  const [updated] = await db
    .update(dedicatedIps)
    .set({ subaccountId, updatedAt: new Date() })
    .where(eq(dedicatedIps.id, ipId))
    .returning();
  return updated!;
}

export interface SubaccountIpReputation {
  subaccountId: string;
  ipCount: number;
  avgReputation: number;
  totalSentToday: number;
}

/**
 * Pure: roll dedicated-IP rows up to per-subaccount reputation summaries.
 * IPs with a null subaccountId (used by the parent itself) are excluded.
 */
export function summarizeSubaccountReputation(
  rows: Array<{ subaccountId: string | null; reputationScore: string | null; todaySent: number }>,
): SubaccountIpReputation[] {
  const by = new Map<string, { sum: number; n: number; sent: number }>();
  for (const r of rows) {
    if (!r.subaccountId) continue;
    const s = by.get(r.subaccountId) ?? { sum: 0, n: 0, sent: 0 };
    s.sum += Number(r.reputationScore ?? 0);
    s.n += 1;
    s.sent += r.todaySent ?? 0;
    by.set(r.subaccountId, s);
  }
  return [...by.entries()]
    .map(([subaccountId, s]) => ({
      subaccountId,
      ipCount: s.n,
      avgReputation: s.n ? Math.round((s.sum / s.n) * 100) / 100 : 0,
      totalSentToday: s.sent,
    }))
    .sort((a, b) => b.ipCount - a.ipCount || a.subaccountId.localeCompare(b.subaccountId));
}

/** Parent-facing roll-up: per-subaccount IP + reputation across delegated IPs. */
export async function listSubaccountIpReputation(
  parentOrgId: string,
): Promise<SubaccountIpReputation[]> {
  const rows = await db
    .select({
      subaccountId: dedicatedIps.subaccountId,
      reputationScore: dedicatedIps.reputationScore,
      todaySent: dedicatedIps.todaySent,
    })
    .from(dedicatedIps)
    .where(eq(dedicatedIps.orgId, parentOrgId));
  return summarizeSubaccountReputation(rows);
}

export async function updateIpStatus(
  orgId: string,
  ipId: string,
  status: 'active' | 'warming' | 'warm' | 'suspended' | 'retired',
  notes?: string,
): Promise<DedicatedIp> {
  await getDedicatedIp(orgId, ipId);
  const patch: Partial<DedicatedIp> = {
    status,
    updatedAt: new Date(),
  };
  if (notes) patch.notes = notes;
  if (status === 'warm') patch.warmupCompletedAt = new Date();

  const [row] = await db
    .update(dedicatedIps)
    .set(patch as Parameters<typeof db.update>[0] extends never ? never : typeof patch)
    .where(eq(dedicatedIps.id, ipId))
    .returning();
  return row!;
}

/**
 * Engine-facing: pick the best IP from a pool for an outbound message.
 * Strategy: prefer 'warm' > 'active' > 'warming'; within each tier, pick the
 * least-recently-used (lowest todaySent). Caps out at the warmup day's volume limit.
 */
export async function pickIpForSend(orgId: string, poolId?: string): Promise<DedicatedIp | null> {
  // Active sanctions check would live in the abuse service; here we just pick IP.
  // An org sends from IPs it owns OR IPs a parent delegated to it (subaccount),
  // so a subaccount's traffic rides its own delegated IP (reputation isolation).
  const conditions = [
    or(eq(dedicatedIps.orgId, orgId), eq(dedicatedIps.subaccountId, orgId))!,
    inArray(dedicatedIps.status, ['warm', 'active', 'warming']),
  ];
  if (poolId) conditions.push(eq(dedicatedIps.poolId, poolId));

  const ips = await db
    .select()
    .from(dedicatedIps)
    .where(and(...conditions))
    .orderBy(dedicatedIps.todaySent);

  if (ips.length === 0) return null;

  // Filter IPs that still have warmup headroom
  const eligible: DedicatedIp[] = [];
  for (const ip of ips) {
    if (ip.status === 'warm' || ip.status === 'active') {
      eligible.push(ip);
      continue;
    }
    // warming: check today's cap
    const day = Math.max(1, Math.min(30, ip.warmupDay));
    const [sched] = await db
      .select()
      .from(ipWarmupSchedules)
      .where(and(eq(ipWarmupSchedules.poolId, ip.poolId!), eq(ipWarmupSchedules.day, day)))
      .limit(1);
    const cap = sched?.maxVolume ?? DEFAULT_WARMUP_RAMP[day - 1]?.maxVolume ?? 100;
    if (ip.todaySent < cap) eligible.push(ip);
  }

  // Prefer 'warm' IPs first
  eligible.sort((a, b) => {
    const order = { warm: 0, active: 1, warming: 2 };
    return (
      (order[a.status as 'warm' | 'active' | 'warming'] ?? 99) -
      (order[b.status as 'warm' | 'active' | 'warming'] ?? 99)
    );
  });
  return eligible[0] ?? null;
}

/**
 * Called by engine after a send: bump volume counters.
 */
export async function recordIpSend(ipId: string, count = 1): Promise<void> {
  await db
    .update(dedicatedIps)
    .set({
      todaySent: sql`${dedicatedIps.todaySent} + ${count}`,
      totalSent: sql`${dedicatedIps.totalSent} + ${count}`,
      updatedAt: new Date(),
    })
    .where(eq(dedicatedIps.id, ipId));
}

/**
 * Daily maintenance job: reset todaySent counters, advance warmup day,
 * promote warming→warm when past last ramp day.
 */
export async function dailyIpMaintenance(): Promise<{ reset: number; promoted: number }> {
  // Reset todaySent for all IPs
  const reset = await db
    .update(dedicatedIps)
    .set({ todaySent: 0, updatedAt: new Date() })
    .where(sql`${dedicatedIps.todaySent} > 0`);

  // Advance warmup day for warming IPs
  await db
    .update(dedicatedIps)
    .set({
      warmupDay: sql`${dedicatedIps.warmupDay} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(dedicatedIps.status, 'warming'));

  // Promote IPs past day 30 to warm
  const promoted = await db
    .update(dedicatedIps)
    .set({
      status: 'warm',
      warmupCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(dedicatedIps.status, 'warming'), sql`${dedicatedIps.warmupDay} > 30`))
    .returning();

  return {
    reset: (reset as unknown as { rowCount?: number }).rowCount ?? 0,
    promoted: promoted.length,
  };
}

export async function updateReputation(
  ipId: string,
  data: {
    reputationScore?: number;
    bounceRate?: number;
    complaintRate?: number;
    blacklistCount?: number;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { reputationUpdatedAt: new Date(), updatedAt: new Date() };
  if (data.reputationScore !== undefined) patch.reputationScore = String(data.reputationScore);
  if (data.bounceRate !== undefined) patch.bounceRate = String(data.bounceRate);
  if (data.complaintRate !== undefined) patch.complaintRate = String(data.complaintRate);
  if (data.blacklistCount !== undefined) patch.blacklistCount = data.blacklistCount;

  await db.update(dedicatedIps).set(patch).where(eq(dedicatedIps.id, ipId));
}
