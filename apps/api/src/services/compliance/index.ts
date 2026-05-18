/**
 * SOC 2 compliance helpers: control catalogue, access reviews, data-retention
 * enforcement, and a summary report. This is tooling for the
 * certification work — actual SOC 2 attestation is an external audit
 * process that uses these endpoints as evidence.
 */

import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  complianceControls, accessReviews, dataRetentionPolicies,
  users, contacts, emailEvents, aiUsage,
  type ComplianceControl, type AccessReview, type DataRetentionPolicy,
} from '../../db/schema/index.js';

interface SeedControl {
  controlId: string;
  category: string;
  title: string;
  description: string;
}

const SOC2_CONTROLS: SeedControl[] = [
  // Common Criteria (CC) — required for all SOC 2 reports
  { controlId: 'CC1.1', category: 'CC', title: 'Commitment to integrity and ethical values', description: 'Board and management set the tone for integrity.' },
  { controlId: 'CC2.1', category: 'CC', title: 'Internal communication of controls', description: 'Information-security policies communicated to personnel.' },
  { controlId: 'CC3.1', category: 'CC', title: 'Risk assessment process', description: 'Annual risk assessment identifies threats to the service.' },
  { controlId: 'CC4.1', category: 'CC', title: 'Monitoring of controls', description: 'Ongoing evaluation of control effectiveness.' },
  { controlId: 'CC5.1', category: 'CC', title: 'Control activities', description: 'Policies and procedures that mitigate identified risks.' },
  { controlId: 'CC6.1', category: 'CC', title: 'Logical access controls', description: 'Logical access to systems is restricted to authorized users.' },
  { controlId: 'CC6.2', category: 'CC', title: 'User provisioning and de-provisioning', description: 'User access is granted based on approval; removed on termination.' },
  { controlId: 'CC6.3', category: 'CC', title: 'Role-based access', description: 'Privileged access (admin, owner) limited to approved users.' },
  { controlId: 'CC6.6', category: 'CC', title: 'Encryption of data in transit', description: 'All external data transmission uses TLS 1.2+.' },
  { controlId: 'CC6.7', category: 'CC', title: 'Encryption of data at rest', description: 'Database, backups, object storage encrypted at rest.' },
  { controlId: 'CC6.8', category: 'CC', title: 'Multi-factor authentication', description: 'MFA required for all administrative access.' },
  { controlId: 'CC7.1', category: 'CC', title: 'Security monitoring', description: 'Detection of security events via logs and alerting.' },
  { controlId: 'CC7.2', category: 'CC', title: 'Incident response', description: 'Documented process for responding to security incidents.' },
  { controlId: 'CC7.3', category: 'CC', title: 'Change management', description: 'Code changes peer-reviewed, tested, deployed via CI/CD.' },
  { controlId: 'CC8.1', category: 'CC', title: 'Vulnerability management', description: 'Regular scanning and remediation of vulnerabilities.' },
  { controlId: 'CC9.1', category: 'CC', title: 'Vendor risk management', description: 'Third-party vendors assessed for security posture.' },
  // Availability
  { controlId: 'A1.1', category: 'A', title: 'Capacity planning', description: 'System capacity monitored and forecasted.' },
  { controlId: 'A1.2', category: 'A', title: 'Backup and recovery', description: 'Regular backups with tested recovery procedures.' },
  // Confidentiality
  { controlId: 'C1.1', category: 'C', title: 'Confidential data identification', description: 'Customer data classified and protected per classification.' },
  // Processing Integrity
  { controlId: 'PI1.1', category: 'PI', title: 'Data validation', description: 'Inputs validated before processing; errors logged and handled.' },
  // Privacy
  { controlId: 'P1.1', category: 'P', title: 'Privacy notice', description: 'Privacy policy published and kept current (GDPR, CCPA).' },
  { controlId: 'P4.1', category: 'P', title: 'Data subject rights', description: 'Mechanisms for access, export, deletion of personal data.' },
];

export async function seedDefaultControls(orgId: string): Promise<{ inserted: number }> {
  const existing = await db.select({ controlId: complianceControls.controlId })
    .from(complianceControls).where(eq(complianceControls.orgId, orgId));
  const have = new Set(existing.map((c) => c.controlId));

  const toInsert = SOC2_CONTROLS.filter((c) => !have.has(c.controlId)).map((c) => ({
    orgId, controlId: c.controlId, category: c.category,
    title: c.title, description: c.description, implemented: false,
  }));
  if (toInsert.length > 0) {
    await db.insert(complianceControls).values(toInsert);
  }
  return { inserted: toInsert.length };
}

export async function listControls(orgId: string): Promise<ComplianceControl[]> {
  return db.select().from(complianceControls)
    .where(eq(complianceControls.orgId, orgId))
    .orderBy(complianceControls.category, complianceControls.controlId);
}

export async function updateControl(
  orgId: string, id: string,
  patch: Partial<Pick<ComplianceControl, 'implemented' | 'evidenceUrl' | 'evidenceNotes' | 'ownerUserId' | 'nextReviewAt'>>,
): Promise<ComplianceControl> {
  const [updated] = await db.update(complianceControls)
    .set({ ...patch, lastReviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(complianceControls.orgId, orgId), eq(complianceControls.id, id)))
    .returning();
  return updated!;
}

export async function runAccessReview(orgId: string, reviewerUserId: string, findings?: string): Promise<AccessReview> {
  const orgUsers = await db.select({
    id: users.id, email: users.email, role: users.role,
    lastLoginAt: users.lastLoginAt, deletedAt: users.deletedAt,
  }).from(users).where(eq(users.orgId, orgId));

  const active = orgUsers.filter((u) => !u.deletedAt);
  const report = {
    totalUsers: orgUsers.length,
    activeUsers: active.length,
    admins: active.filter((u) => u.role === 'admin' || u.role === 'owner').length,
    staleNoLogin90d: active.filter((u) => !u.lastLoginAt || u.lastLoginAt < new Date(Date.now() - 90 * 86_400_000)).length,
    users: active.map((u) => ({
      id: u.id, email: u.email, role: u.role,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  };

  const [row] = await db.insert(accessReviews).values({
    orgId, reviewerUserId,
    usersReviewed: active.length,
    usersRevoked: 0,
    findings: findings ?? null,
    report,
  }).returning();
  return row!;
}

export async function listAccessReviews(orgId: string): Promise<AccessReview[]> {
  return db.select().from(accessReviews)
    .where(eq(accessReviews.orgId, orgId))
    .orderBy(desc(accessReviews.reviewedAt)).limit(100);
}

export async function setRetentionPolicy(orgId: string, resource: string, retentionDays: number): Promise<DataRetentionPolicy> {
  const [existing] = await db.select().from(dataRetentionPolicies)
    .where(and(eq(dataRetentionPolicies.orgId, orgId), eq(dataRetentionPolicies.resource, resource))).limit(1);
  if (existing) {
    const [updated] = await db.update(dataRetentionPolicies)
      .set({ retentionDays })
      .where(eq(dataRetentionPolicies.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db.insert(dataRetentionPolicies).values({ orgId, resource, retentionDays }).returning();
  return created!;
}

export async function listRetentionPolicies(orgId: string): Promise<DataRetentionPolicy[]> {
  return db.select().from(dataRetentionPolicies).where(eq(dataRetentionPolicies.orgId, orgId));
}

const RETENTION_HANDLERS: Record<string, (orgId: string, cutoff: Date) => Promise<number>> = {
  async email_events(orgId, cutoff) {
    const res = await db.delete(emailEvents)
      .where(and(eq(emailEvents.orgId, orgId), lt(emailEvents.createdAt, cutoff)));
    return (res as unknown as { rowCount?: number }).rowCount ?? 0;
  },
  async ai_usage(orgId, cutoff) {
    const res = await db.delete(aiUsage)
      .where(and(eq(aiUsage.orgId, orgId), lt(aiUsage.createdAt, cutoff)));
    return (res as unknown as { rowCount?: number }).rowCount ?? 0;
  },
  async inactive_contacts(orgId, cutoff) {
    // Soft-delete contacts with no activity since cutoff (created_at as proxy for legacy rows).
    const res = await db.update(contacts)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(contacts.orgId, orgId),
        isNull(contacts.deletedAt),
        lt(contacts.createdAt, cutoff),
      ));
    return (res as unknown as { rowCount?: number }).rowCount ?? 0;
  },
};

export async function enforceRetention(orgId: string): Promise<Array<{ resource: string; deleted: number }>> {
  const policies = await listRetentionPolicies(orgId);
  const results: Array<{ resource: string; deleted: number }> = [];
  for (const p of policies) {
    const handler = RETENTION_HANDLERS[p.resource];
    if (!handler) continue;
    const cutoff = new Date(Date.now() - p.retentionDays * 86_400_000);
    const deleted = await handler(orgId, cutoff);
    await db.update(dataRetentionPolicies)
      .set({ lastEnforcedAt: new Date() })
      .where(eq(dataRetentionPolicies.id, p.id));
    results.push({ resource: p.resource, deleted });
  }
  return results;
}

export async function complianceReport(orgId: string): Promise<{
  totalControls: number;
  implemented: number;
  implementedPct: number;
  byCategory: Array<{ category: string; total: number; implemented: number }>;
  lastAccessReviewAt: string | null;
  retentionPoliciesCount: number;
}> {
  const controls = await listControls(orgId);
  const implemented = controls.filter((c) => c.implemented).length;
  const categories = [...new Set(controls.map((c) => c.category))];
  const byCategory = categories.map((cat) => {
    const cs = controls.filter((c) => c.category === cat);
    return { category: cat, total: cs.length, implemented: cs.filter((c) => c.implemented).length };
  });

  const [lastReview] = await db.select({ reviewedAt: accessReviews.reviewedAt })
    .from(accessReviews).where(eq(accessReviews.orgId, orgId))
    .orderBy(desc(accessReviews.reviewedAt)).limit(1);

  const [policyCount] = await db.select({ n: count() }).from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.orgId, orgId));

  return {
    totalControls: controls.length,
    implemented,
    implementedPct: controls.length ? Math.round((implemented / controls.length) * 100) : 0,
    byCategory,
    lastAccessReviewAt: lastReview?.reviewedAt.toISOString() ?? null,
    retentionPoliciesCount: Number(policyCount?.n ?? 0),
  };
}

export const RETENTION_RESOURCES = Object.keys(RETENTION_HANDLERS);
