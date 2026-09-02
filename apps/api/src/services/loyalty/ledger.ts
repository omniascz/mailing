/**
 * Loyalty points ledger service (#236)
 *
 * The ledger is the append-only source of truth for point balances.
 * This service provides:
 *   - Paginated transaction history
 *   - Balance reconciliation (cached vs. ledger sum)
 *   - Point expiry processing (rolling + fixed schedule)
 *   - Expiring-points warnings for member UX
 */

import { and, desc, eq, gt, gte, lt, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { loyaltyPoints, loyaltyMembers, type LoyaltyPointTx } from '../../db/schema/index.js';

// ─── Transaction history ──────────────────────────────────────────────────────

export async function getLedger(
  orgId: string,
  memberId: string,
  opts: {
    limit?: number;
    cursor?: string;
    type?: LoyaltyPointTx['type'];
  } = {},
): Promise<{ data: LoyaltyPointTx[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const conditions = [eq(loyaltyPoints.orgId, orgId), eq(loyaltyPoints.memberId, memberId)];

  if (opts.cursor) {
    conditions.push(lt(loyaltyPoints.createdAt, new Date(opts.cursor)));
  }
  if (opts.type) {
    conditions.push(eq(loyaltyPoints.type, opts.type));
  }

  const rows = await db
    .select()
    .from(loyaltyPoints)
    .where(and(...conditions))
    .orderBy(desc(loyaltyPoints.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    hasMore,
    cursor: hasMore && data.length > 0 ? data[data.length - 1]!.createdAt.toISOString() : null,
  };
}

// ─── Balance reconciliation ───────────────────────────────────────────────────

/**
 * Compute the authoritative balance directly from the ledger (sum of all
 * non-expired point transactions). Slower than reading the cached column,
 * but guaranteed to be correct.
 */
export async function computeLedgerBalance(memberId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(points), 0)::int` })
    .from(loyaltyPoints)
    .where(
      and(
        eq(loyaltyPoints.memberId, memberId),
        // Exclude future-expired transactions (points not yet expired)
        // An expired row has type='expire' and is already negative — included
        // A row with expiresAt in the past should be treated as expired
        // We track this by emitting an 'expire' debit record, so just sum all
      ),
    );
  return row?.total ?? 0;
}

/**
 * Reconcile the cached `point_balance` on the member row against the
 * ledger sum. Corrects any drift with an 'adjust' transaction.
 * Returns the corrected balance.
 */
export async function reconcileBalance(orgId: string, memberId: string): Promise<number> {
  const ledgerBalance = await computeLedgerBalance(memberId);

  const [member] = await db
    .select({ pointBalance: loyaltyMembers.pointBalance })
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
    .limit(1);

  if (!member) throw new Error('Member not found');

  const drift = ledgerBalance - member.pointBalance;
  if (drift !== 0) {
    // Insert a correction entry
    await db.insert(loyaltyPoints).values({
      orgId,
      memberId,
      type: 'adjust',
      points: drift,
      balanceAfter: ledgerBalance,
      description: `Balance reconciliation (drift: ${drift > 0 ? '+' : ''}${drift})`,
      actorType: 'system',
    });

    await db
      .update(loyaltyMembers)
      .set({ pointBalance: ledgerBalance, updatedAt: new Date() })
      .where(eq(loyaltyMembers.id, memberId));
  }

  return ledgerBalance;
}

// ─── Expiring-points warnings ─────────────────────────────────────────────────

export interface ExpiringPoints {
  expiresAt: Date;
  points: number;
}

/**
 * Returns points earned in the last N days that are set to expire soon
 * (i.e. have an `expiresAt` in the next `warningDays` days).
 * Used to power "Your X points expire in Y days" member messaging.
 */
export async function getExpiringPoints(
  memberId: string,
  warningDays = 30,
): Promise<ExpiringPoints[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + warningDays * 86_400_000);

  const rows = await db
    .select({
      expiresAt: loyaltyPoints.expiresAt,
      points: sql<number>`sum(points)::int`,
    })
    .from(loyaltyPoints)
    .where(
      and(
        eq(loyaltyPoints.memberId, memberId),
        eq(loyaltyPoints.type, 'earn'),
        gt(loyaltyPoints.points, sql`0`),
        gte(loyaltyPoints.expiresAt, now),
        lte(loyaltyPoints.expiresAt, horizon),
      ),
    )
    .groupBy(loyaltyPoints.expiresAt)
    .orderBy(loyaltyPoints.expiresAt);

  return rows
    .filter((r) => r.expiresAt !== null)
    .map((r) => ({ expiresAt: r.expiresAt!, points: r.points }));
}

// ─── Point expiry processing ──────────────────────────────────────────────────

export interface ExpiryRunResult {
  membersProcessed: number;
  pointsExpired: number;
  errors: number;
}

/**
 * Process expired points for all members of an org.
 *
 * For each member:
 *   1. Find earn transactions where `expiresAt` <= now and points > 0
 *      that have not yet had a corresponding 'expire' debit emitted
 *      (we track this by checking if sourceRef='expire:{txId}' exists)
 *   2. Emit a negative 'expire' transaction for the expired amount
 *   3. Update cached balance
 *
 * Safe to run multiple times (idempotent per tx).
 */
export async function processPointExpiry(orgId: string): Promise<ExpiryRunResult> {
  const now = new Date();
  let membersProcessed = 0;
  let totalExpired = 0;
  let errors = 0;

  // Find all active members in the org
  const members = await db
    .select({ id: loyaltyMembers.id, programId: loyaltyMembers.programId })
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.status, 'active'),
        // Only members who have any points with expiresAt set
        sql`EXISTS (
          SELECT 1 FROM loyalty_points lp
          WHERE lp.member_id = ${loyaltyMembers.id}
            AND lp.type = 'earn'
            AND lp.expires_at IS NOT NULL
            AND lp.expires_at <= ${now.toISOString()}
            AND lp.points > 0
        )`,
      ),
    );

  for (const member of members) {
    try {
      const expiredTxs = await db
        .select()
        .from(loyaltyPoints)
        .where(
          and(
            eq(loyaltyPoints.memberId, member.id),
            eq(loyaltyPoints.type, 'earn'),
            gt(loyaltyPoints.points, sql`0`),
            lte(loyaltyPoints.expiresAt!, now),
          ),
        );

      if (expiredTxs.length === 0) continue;

      // Check which ones already have a corresponding expire record
      const alreadyExpiredRefs = new Set(
        (
          await db
            .select({ sourceRef: loyaltyPoints.sourceRef })
            .from(loyaltyPoints)
            .where(and(eq(loyaltyPoints.memberId, member.id), eq(loyaltyPoints.type, 'expire')))
        )
          .map((r) => r.sourceRef)
          .filter(Boolean),
      );

      let memberExpiredPoints = 0;

      await db.transaction(async (tx) => {
        for (const earnTx of expiredTxs) {
          const ref = `expire:${earnTx.id}`;
          if (alreadyExpiredRefs.has(ref)) continue;

          const [memberRow] = await tx
            .select({ pointBalance: loyaltyMembers.pointBalance })
            .from(loyaltyMembers)
            .where(eq(loyaltyMembers.id, member.id))
            .limit(1);

          const currentBalance = memberRow?.pointBalance ?? 0;
          const toExpire = Math.min(earnTx.points, currentBalance);
          if (toExpire <= 0) continue;

          const newBalance = currentBalance - toExpire;

          await tx.insert(loyaltyPoints).values({
            orgId,
            memberId: member.id,
            type: 'expire',
            points: -toExpire,
            balanceAfter: newBalance,
            description: `Points expired (earned ${earnTx.createdAt.toISOString().slice(0, 10)})`,
            sourceRef: ref,
            actorType: 'system',
          });

          await tx
            .update(loyaltyMembers)
            .set({ pointBalance: newBalance, updatedAt: new Date() })
            .where(eq(loyaltyMembers.id, member.id));

          memberExpiredPoints += toExpire;
        }
      });

      if (memberExpiredPoints > 0) {
        membersProcessed++;
        totalExpired += memberExpiredPoints;
      }
    } catch {
      errors++;
    }
  }

  return { membersProcessed, pointsExpired: totalExpired, errors };
}

/**
 * Compute and stamp `expiresAt` for a new earn transaction based on
 * the program's expiry policy. Returns null if policy is 'never'.
 */
export function computeExpiresAt(program: {
  expiryType: string;
  expiryValue?: string | null;
}): Date | null {
  if (program.expiryType === 'rolling') {
    const days = Number(program.expiryValue ?? 0);
    if (days > 0) return new Date(Date.now() + days * 86_400_000);
  }
  if (program.expiryType === 'fixed') {
    if (program.expiryValue) {
      const [mm, dd] = program.expiryValue.split('-').map(Number);
      const now = new Date();
      const candidate = new Date(now.getFullYear(), mm! - 1, dd!);
      if (candidate <= now) candidate.setFullYear(candidate.getFullYear() + 1);
      return candidate;
    }
  }
  return null;
}

// ─── Summary stats ────────────────────────────────────────────────────────────

export interface LedgerSummary {
  totalEarned: number;
  totalRedeemed: number;
  totalExpired: number;
  totalAdjusted: number;
  currentBalance: number;
  transactionCount: number;
}

export async function getLedgerSummary(memberId: string): Promise<LedgerSummary> {
  const [row] = await db
    .select({
      totalEarned: sql<number>`coalesce(sum(points) filter (where type in ('earn', 'bonus', 'refund')), 0)::int`,
      totalRedeemed: sql<number>`coalesce(abs(sum(points) filter (where type = 'redeem')), 0)::int`,
      totalExpired: sql<number>`coalesce(abs(sum(points) filter (where type = 'expire')), 0)::int`,
      totalAdjusted: sql<number>`coalesce(sum(points) filter (where type = 'adjust'), 0)::int`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.memberId, memberId));

  const [memberRow] = await db
    .select({ pointBalance: loyaltyMembers.pointBalance })
    .from(loyaltyMembers)
    .where(eq(loyaltyMembers.id, memberId))
    .limit(1);

  return {
    totalEarned: row?.totalEarned ?? 0,
    totalRedeemed: row?.totalRedeemed ?? 0,
    totalExpired: row?.totalExpired ?? 0,
    totalAdjusted: row?.totalAdjusted ?? 0,
    currentBalance: memberRow?.pointBalance ?? 0,
    transactionCount: row?.transactionCount ?? 0,
  };
}
