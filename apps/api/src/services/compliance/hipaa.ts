/**
 * HIPAA compliance service (#231)
 *
 * Provides:
 *   - HIPAA mode toggle (per-org flag)
 *   - BAA management (Business Associate Agreements)
 *   - PHI field tagging (which custom fields hold Protected Health Info)
 *   - HIPAA access logging (§164.312(b) audit controls)
 *   - Field-level encryption helpers (AES-256-GCM, key from env)
 *   - Pre-send gate: blocks marketing sends when HIPAA mode is active
 *     and no BAA covers the email delivery provider
 *
 * Field-level encryption:
 *   Values are encrypted as "enc:v1:<base64(iv:ciphertext:authTag)>".
 *   The encryption key is HIPAA_FIELD_KEY env var (hex-encoded 32 bytes).
 *   If the env var is not set, encryption is silently skipped in dev;
 *   production MUST set it.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  organizations,
  businessAssociateAgreements,
  phiFieldFlags,
  hipaaAccessLog,
  type BusinessAssociateAgreement,
  type PhiFieldFlag,
  type HipaaAccessLog,
} from '../../db/schema/index.js';

// ─── Encryption ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';

function getFieldKey(): Buffer | null {
  const hex = process.env.HIPAA_FIELD_KEY;
  if (!hex) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('HIPAA_FIELD_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/**
 * Encrypt a PHI field value. Returns "enc:v1:<base64>" or the original
 * value if no key is configured (dev/test fallback).
 */
export function encryptPhiValue(plaintext: string): string {
  const key = getFieldKey();
  // Previously `if (!key) return plaintext` — the comment said "do not
  // silently fail in prod" and the code did exactly that: PHI was written
  // unencrypted with nothing in the logs. Verified by running it with the
  // variable unset; it returned the input verbatim.
  if (!key) {
    throw new Error(
      'HIPAA_FIELD_KEY is not set — refusing to store PHI unencrypted. ' +
        'Set it (64 hex chars) or disable HIPAA mode for this org.',
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, ciphertext, authTag]);
  return `${ENC_PREFIX}${combined.toString('base64')}`;
}

/**
 * Decrypt a PHI field value. Returns the original value if input is not
 * in our encrypted format (safe pass-through for unencrypted fields).
 */
export function decryptPhiValue(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;

  const key = getFieldKey();
  if (!key) return value; // dev fallback

  const combined = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/**
 * Encrypt all PHI fields in a contact's customFields object.
 * Non-PHI fields pass through unchanged.
 */
export function encryptPhiFields(
  customFields: Record<string, unknown>,
  phiKeys: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...customFields };
  for (const key of phiKeys) {
    if (typeof out[key] === 'string') {
      out[key] = encryptPhiValue(out[key] as string);
    }
  }
  return out;
}

/**
 * Decrypt all PHI fields in a contact's customFields object.
 */
export function decryptPhiFields(
  customFields: Record<string, unknown>,
  phiKeys: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...customFields };
  for (const key of phiKeys) {
    if (typeof out[key] === 'string' && (out[key] as string).startsWith(ENC_PREFIX)) {
      out[key] = decryptPhiValue(out[key] as string);
    }
  }
  return out;
}

/**
 * Redact PHI fields for log-safe output (replace values with '[REDACTED]').
 */
export function redactPhiFields(
  customFields: Record<string, unknown>,
  phiKeys: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...customFields };
  for (const key of phiKeys) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}

// ─── HIPAA mode toggle ────────────────────────────────────────────────────────

export async function enableHipaaMode(orgId: string): Promise<void> {
  // Turning HIPAA mode on without a key would arm a code path that now throws
  // on every PHI write. Refuse here, where the operator is watching.
  if (!getFieldKey()) {
    throw new Error(
      'Cannot enable HIPAA mode: HIPAA_FIELD_KEY is not set. PHI field ' +
        'encryption would be unavailable.',
    );
  }
  await db
    .update(organizations)
    .set({ hipaaMode: true, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export async function disableHipaaMode(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({ hipaaMode: false, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export async function isHipaaModeEnabled(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ hipaaMode: organizations.hipaaMode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.hipaaMode ?? false;
}

// ─── BAA management ───────────────────────────────────────────────────────────

export async function createBaa(
  orgId: string,
  input: {
    baName: string;
    baEmail?: string;
    baType?: string;
    documentUrl?: string;
    effectiveDate?: Date;
    expirationDate?: Date;
    notes?: string;
  },
): Promise<BusinessAssociateAgreement> {
  const [baa] = await db
    .insert(businessAssociateAgreements)
    .values({ orgId, ...input })
    .returning();
  return baa!;
}

export async function updateBaa(
  orgId: string,
  baaId: string,
  patch: Partial<{
    status: BusinessAssociateAgreement['status'];
    documentUrl: string;
    effectiveDate: Date;
    expirationDate: Date;
    signedByUserId: string;
    signedAt: Date;
    notes: string;
  }>,
): Promise<BusinessAssociateAgreement> {
  const [updated] = await db
    .update(businessAssociateAgreements)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(businessAssociateAgreements.id, baaId), eq(businessAssociateAgreements.orgId, orgId)),
    )
    .returning();
  if (!updated) throw new Error('BAA not found');
  return updated;
}

export async function listBaas(orgId: string): Promise<BusinessAssociateAgreement[]> {
  return db
    .select()
    .from(businessAssociateAgreements)
    .where(eq(businessAssociateAgreements.orgId, orgId))
    .orderBy(businessAssociateAgreements.createdAt);
}

export async function deleteBaa(orgId: string, baaId: string): Promise<void> {
  await db
    .delete(businessAssociateAgreements)
    .where(
      and(eq(businessAssociateAgreements.id, baaId), eq(businessAssociateAgreements.orgId, orgId)),
    );
}

// ─── PHI field flags ──────────────────────────────────────────────────────────

export async function setPhiFieldFlag(
  orgId: string,
  userId: string,
  input: {
    fieldKey: string;
    phiCategory?: string;
    encryptAtRest?: boolean;
    redactInLogs?: boolean;
  },
): Promise<PhiFieldFlag> {
  const [flag] = await db
    .insert(phiFieldFlags)
    .values({
      orgId,
      fieldKey: input.fieldKey,
      phiCategory: input.phiCategory ?? 'other',
      encryptAtRest: input.encryptAtRest ?? false,
      redactInLogs: input.redactInLogs ?? true,
      createdByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [phiFieldFlags.orgId, phiFieldFlags.fieldKey],
      set: {
        phiCategory: input.phiCategory ?? 'other',
        encryptAtRest: input.encryptAtRest ?? false,
        redactInLogs: input.redactInLogs ?? true,
      },
    })
    .returning();
  return flag!;
}

export async function removePhiFieldFlag(orgId: string, fieldKey: string): Promise<void> {
  await db
    .delete(phiFieldFlags)
    .where(and(eq(phiFieldFlags.orgId, orgId), eq(phiFieldFlags.fieldKey, fieldKey)));
}

export async function listPhiFieldFlags(orgId: string): Promise<PhiFieldFlag[]> {
  return db.select().from(phiFieldFlags).where(eq(phiFieldFlags.orgId, orgId));
}

export async function getPhiFieldKeySet(orgId: string): Promise<Set<string>> {
  const flags = await listPhiFieldFlags(orgId);
  return new Set(flags.map((f) => f.fieldKey));
}

// ─── HIPAA access log ─────────────────────────────────────────────────────────

export async function logPhiAccess(input: {
  orgId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  phiFieldKeys?: string[];
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await db.insert(hipaaAccessLog).values({
    orgId: input.orgId,
    userId: input.userId ?? undefined,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    phiFieldKeys: input.phiFieldKeys ?? [],
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function listPhiAccessLog(
  orgId: string,
  opts: {
    limit?: number;
    cursor?: string;
    userId?: string;
    resource?: string;
  } = {},
): Promise<{ data: HipaaAccessLog[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = [eq(hipaaAccessLog.orgId, orgId)];

  if (opts.cursor) {
    conditions.push(lt(hipaaAccessLog.createdAt, new Date(opts.cursor)));
  }
  if (opts.userId) conditions.push(eq(hipaaAccessLog.userId, opts.userId));
  if (opts.resource) conditions.push(eq(hipaaAccessLog.resource, opts.resource));

  const rows = await db
    .select()
    .from(hipaaAccessLog)
    .where(and(...conditions))
    .orderBy(hipaaAccessLog.createdAt)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    hasMore,
    cursor: hasMore && data.length > 0 ? data[data.length - 1]!.createdAt.toISOString() : null,
  };
}

// ─── HIPAA compliance summary ─────────────────────────────────────────────────

export interface HipaaComplianceReport {
  hipaaMode: boolean;
  activeBaas: number;
  expiredBaas: number;
  pendingBaas: number;
  phiFieldCount: number;
  encryptedFieldCount: number;
  warnings: string[];
}

export async function getHipaaComplianceReport(orgId: string): Promise<HipaaComplianceReport> {
  const [org] = await db
    .select({ hipaaMode: organizations.hipaaMode })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const baas = await listBaas(orgId);
  const phiFields = await listPhiFieldFlags(orgId);

  const warnings: string[] = [];

  if (org?.hipaaMode) {
    const activeBaas = baas.filter((b) => b.status === 'active');
    if (activeBaas.length === 0) {
      warnings.push('HIPAA mode enabled but no active BAA on file');
    }
    if (!process.env.HIPAA_FIELD_KEY) {
      warnings.push('HIPAA_FIELD_KEY not set — PHI field encryption is disabled');
    }
    const encryptedPhi = phiFields.filter((f) => f.encryptAtRest);
    if (phiFields.length > 0 && encryptedPhi.length === 0) {
      warnings.push('PHI fields configured but none flagged for encryption-at-rest');
    }
  }

  return {
    hipaaMode: org?.hipaaMode ?? false,
    activeBaas: baas.filter((b) => b.status === 'active').length,
    expiredBaas: baas.filter((b) => b.status === 'expired').length,
    pendingBaas: baas.filter((b) => b.status === 'pending').length,
    phiFieldCount: phiFields.length,
    encryptedFieldCount: phiFields.filter((f) => f.encryptAtRest).length,
    warnings,
  };
}
