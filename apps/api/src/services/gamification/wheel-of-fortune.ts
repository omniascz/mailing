/**
 * Wheel of Fortune spin engine.
 *
 * Contacts visit a signup form with type="wheel_of_fortune", enter their email,
 * and spin the wheel. A prize slice is selected using weighted random selection.
 * Coupon codes are optionally awarded from a coupon pool.
 *
 * Dedup: one spin per email per form (configurable via maxSpinsPerEmail).
 */

import { db } from '../../db/client.js';
import { wheelSpins } from '../../db/schema/wheel-spins.js';
import type { WheelConfig, WheelPrize, WheelSpin } from '../../db/schema/wheel-spins.js';
import { signupForms } from '../../db/schema/signup-forms.js';
import type { FormConfig } from '../../db/schema/signup-forms.js';
import { and, count, eq } from 'drizzle-orm';
import crypto from 'crypto';

export type { WheelConfig, WheelPrize };

export interface SpinResult {
  prizeIndex: number;
  prize: WheelPrize;
  couponCode?: string;
  alreadySpun: boolean;
}

/**
 * Perform a wheel spin for a given form + email.
 *
 * Steps:
 * 1. Load form + validate it has wheelConfig
 * 2. Check dedup (email + formId)
 * 3. Select prize slice using cryptographic weighted random
 * 4. Award coupon if configured
 * 5. Persist WheelSpin record
 *
 * Returns SpinResult. If contact already spun (and maxSpinsPerEmail enforced),
 * returns their previous prize with alreadySpun=true.
 */
export async function spin(
  orgId: string,
  formId: string,
  email: string,
  ipAddress?: string,
): Promise<SpinResult> {
  // Load form config
  const [form] = await db
    .select({ config: signupForms.config, active: signupForms.active })
    .from(signupForms)
    .where(and(eq(signupForms.orgId, orgId), eq(signupForms.id, formId)));

  if (!form) throw Object.assign(new Error('Form not found'), { statusCode: 404 });
  if (!form.active) throw Object.assign(new Error('Form is not active'), { statusCode: 400 });

  const config = form.config as FormConfig & { wheelConfig?: WheelConfig };
  const wheelCfg = config.wheelConfig;
  if (!wheelCfg?.prizes?.length) {
    throw Object.assign(new Error('This form is not configured as a Wheel of Fortune'), {
      statusCode: 400,
    });
  }

  const maxSpins = wheelCfg.maxSpinsPerEmail ?? 1;
  const normalizedEmail = email.trim().toLowerCase();

  // Dedup check
  const spinCountRows = await db
    .select({ total: count() })
    .from(wheelSpins)
    .where(and(eq(wheelSpins.formId, formId), eq(wheelSpins.email, normalizedEmail)));
  const spinCount = Number(spinCountRows[0]?.total ?? 0);

  if (spinCount >= maxSpins) {
    // Return previous spin result
    const [prev] = await db
      .select()
      .from(wheelSpins)
      .where(and(eq(wheelSpins.formId, formId), eq(wheelSpins.email, normalizedEmail)))
      .limit(1);

    const previousPrize = wheelCfg.prizes[prev!.prizeIndex] ?? wheelCfg.prizes[0]!;
    return {
      prizeIndex: prev!.prizeIndex,
      prize: previousPrize,
      couponCode: prev!.couponCode ?? undefined,
      alreadySpun: true,
    };
  }

  // Select prize by weighted random
  const prizeIndex = selectPrize(wheelCfg.prizes);
  const prize = wheelCfg.prizes[prizeIndex]!;

  // Award coupon if configured
  let couponCode: string | undefined;
  if (!prize.noPrize) {
    if (prize.couponCode) {
      couponCode = prize.couponCode;
    } else if (prize.couponPoolId) {
      couponCode = await claimCouponFromPool(orgId, prize.couponPoolId);
    }
  }

  // Persist spin
  await db.insert(wheelSpins).values({
    orgId,
    formId,
    email: normalizedEmail,
    prizeIndex,
    prizeLabel: prize.label,
    couponCode,
    ipAddress,
  });

  return { prizeIndex, prize, couponCode, alreadySpun: false };
}

/**
 * Mark a spin as confirmed (contact submitted the full form after seeing the prize).
 * Called from the form submission handler.
 */
export async function confirmSpin(
  formId: string,
  email: string,
  contactId?: string,
): Promise<WheelSpin | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const [spin] = await db
    .update(wheelSpins)
    .set({ confirmed: true, contactId: contactId ?? null })
    .where(
      and(
        eq(wheelSpins.formId, formId),
        eq(wheelSpins.email, normalizedEmail),
        eq(wheelSpins.confirmed, false),
      ),
    )
    .returning();
  return spin ?? null;
}

/**
 * List spins for a form (for analytics dashboard).
 */
export async function listSpins(orgId: string, formId: string): Promise<WheelSpin[]> {
  return db
    .select()
    .from(wheelSpins)
    .where(and(eq(wheelSpins.orgId, orgId), eq(wheelSpins.formId, formId)));
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Cryptographically-secure weighted random prize selection.
 * Uses cumulative weight thresholds with crypto.randomBytes for fairness.
 */
function selectPrize(prizes: WheelPrize[]): number {
  const totalWeight = prizes.reduce((s, p) => s + (p.weight ?? 1), 0);

  // Generate a random float in [0, totalWeight)
  const buf = crypto.randomBytes(4);
  const rand = (buf.readUInt32BE(0) / 0xffffffff) * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < prizes.length; i++) {
    cumulative += prizes[i]!.weight ?? 1;
    if (rand < cumulative) return i;
  }
  return prizes.length - 1;
}

async function claimCouponFromPool(orgId: string, batchId: string): Promise<string | undefined> {
  // Atomic UPDATE ... RETURNING to claim exactly one coupon and prevent races.
  // Uses a CTE to SELECT the target row then UPDATE it in one statement.
  const { sql: drizzleSql } = await import('drizzle-orm');

  // Drizzle doesn't expose UPDATE...WHERE id IN (SELECT...FOR UPDATE SKIP LOCKED)
  // directly, so we execute raw SQL for the atomic claim.
  const result = await db.execute(drizzleSql`
    UPDATE coupon_codes
    SET assigned_to = ${'wheel-spin:' + orgId + ':' + batchId},
        assigned_at = NOW()
    WHERE id = (
      SELECT id FROM coupon_codes
      WHERE org_id = ${orgId}
        AND batch_id = ${batchId}
        AND assigned_to IS NULL
        AND redeemed_at IS NULL
      ORDER BY id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING code
  `);

  const rows = result as unknown as Array<{ code: string }>;
  return rows[0]?.code ?? undefined;
}
