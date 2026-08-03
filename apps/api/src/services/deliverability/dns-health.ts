/**
 * DNS health monitor (§9 P1).
 *
 * Walks every verified sending domain on a daily cadence and re-runs the
 * SPF / DKIM / DMARC / Return-Path checks. When a record stops resolving
 * we flip the relevant `*_verified` flag back to false, emit an alert
 * incident to the status page (component=email-sending,
 * reason=DNS drift), and surface the issue on the org's dashboard.
 *
 * Why this matters: customer DNS changes silently. A new SPF record
 * pushed by IT, a TTL change, a registrar migration — any of these can
 * suddenly make a fully-warmed domain fail authentication. Without a
 * monitor, the customer's first signal is bounces.
 *
 * Run via routes/v1/internal/triggers.ts daily-run alongside RFM +
 * predictive + channel scoring + engagement.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/index.js';
import { buildDnsRecords, verifyDnsRecords, type DnsRecord } from '../domains/dns-records.js';
import { verifyDkimDns } from '../domains/dkim.js';
import { reportIncident } from '../status-page/index.js';

const DMARC_REPORT_EMAIL = process.env.DMARC_REPORT_EMAIL ?? 'dmarc@forgemsg.com';

export interface DomainHealthDelta {
  domainId: string;
  domain: string;
  spfBroken: boolean;
  dkimBroken: boolean;
  dmarcBroken: boolean;
  returnPathBroken: boolean;
  /** True when at least one record that used to pass is now failing. */
  brokeSinceLastCheck: boolean;
}

export interface DnsHealthSummary {
  domainsChecked: number;
  domainsDrifted: number;
  details: DomainHealthDelta[];
  errors: number;
}

function pickPurposeStatus(records: DnsRecord[], prefix: string): boolean | null {
  const r = records.find((x) => x.purpose.startsWith(prefix));
  return r ? r.verified : null;
}

/**
 * Re-verify a single domain's DNS posture. Compares against the
 * persisted state and emits a status-page incident when something that
 * was healthy turns red. Returns the delta so callers can roll it up.
 */
export async function checkDomain(
  domain: typeof sendingDomains.$inferSelect,
): Promise<DomainHealthDelta> {
  if (!domain.dkimPublicKey) {
    return {
      domainId: domain.id,
      domain: domain.domain,
      spfBroken: false,
      dkimBroken: false,
      dmarcBroken: false,
      returnPathBroken: false,
      brokeSinceLastCheck: false,
    };
  }

  const records = buildDnsRecords({
    domain: domain.domain,
    mailSubdomain: domain.mailSubdomain ?? `mail.${domain.domain}`,
    dkimSelector: domain.dkimSelector,
    dkimPublicKey: domain.dkimPublicKey,
    dmarcEmail: DMARC_REPORT_EMAIL,
  });

  const { records: checked } = await verifyDnsRecords(records);
  const dkimOk = await verifyDkimDns(domain.dkimSelector, domain.domain, domain.dkimPublicKey);

  const spfOk = pickPurposeStatus(checked, 'SPF') ?? false;
  const dmarcOk = pickPurposeStatus(checked, 'DMARC') ?? false;
  const returnPathOk = pickPurposeStatus(checked, 'Return-Path') ?? false;

  // Drift = something that USED to be verified is now broken. We don't
  // alert on "never verified" because those domains aren't sending yet.
  const spfBroken = domain.spfVerified === true && !spfOk;
  const dkimBroken = domain.dkimVerified === true && !dkimOk;
  const dmarcBroken = domain.dmarcVerified === true && !dmarcOk;
  const returnPathBroken = domain.returnPathVerified === true && !returnPathOk;
  const brokeSinceLastCheck = spfBroken || dkimBroken || dmarcBroken || returnPathBroken;

  const now = new Date();
  await db
    .update(sendingDomains)
    .set({
      spfVerified: spfOk,
      spfVerifiedAt: spfOk ? now : domain.spfVerifiedAt,
      dkimVerified: dkimOk,
      dkimVerifiedAt: dkimOk ? now : domain.dkimVerifiedAt,
      dmarcVerified: dmarcOk,
      dmarcVerifiedAt: dmarcOk ? now : domain.dmarcVerifiedAt,
      returnPathVerified: returnPathOk,
      returnPathVerifiedAt: returnPathOk ? now : domain.returnPathVerifiedAt,
      isVerified: spfOk && dkimOk && dmarcOk,
      updatedAt: now,
    })
    .where(eq(sendingDomains.id, domain.id));

  if (brokeSinceLastCheck) {
    const failing: string[] = [];
    if (spfBroken) failing.push('SPF');
    if (dkimBroken) failing.push('DKIM');
    if (dmarcBroken) failing.push('DMARC');
    if (returnPathBroken) failing.push('Return-Path');
    void reportIncident('webhook_failures', {
      // Re-use the existing signal kind to avoid expanding the enum just
      // for DNS drift; the metric makes the cause clear.
      summary: `${domain.domain}: ${failing.join('+')} no longer resolving`,
      region: 'sending-domains',
      metrics: { domainId: domain.id, failingRecords: failing.length },
    });
  }

  return {
    domainId: domain.id,
    domain: domain.domain,
    spfBroken,
    dkimBroken,
    dmarcBroken,
    returnPathBroken,
    brokeSinceLastCheck,
  };
}

/** Walk every org's sending domains that have completed initial verification. */
export async function runDnsHealthSweep(): Promise<DnsHealthSummary> {
  const rows = await db
    .select()
    .from(sendingDomains)
    .where(and(isNotNull(sendingDomains.dkimPublicKey), eq(sendingDomains.isVerified, true)));

  let drifted = 0;
  let errors = 0;
  const details: DomainHealthDelta[] = [];
  for (const r of rows) {
    try {
      const delta = await checkDomain(r);
      details.push(delta);
      if (delta.brokeSinceLastCheck) drifted++;
    } catch {
      errors++;
    }
  }
  return { domainsChecked: rows.length, domainsDrifted: drifted, details, errors };
}

/** Per-org variant used by the manual `Re-check now` button. */
export async function runDnsHealthForOrg(orgId: string): Promise<DnsHealthSummary> {
  const rows = await db
    .select()
    .from(sendingDomains)
    .where(and(eq(sendingDomains.orgId, orgId), isNotNull(sendingDomains.dkimPublicKey)));

  let drifted = 0;
  let errors = 0;
  const details: DomainHealthDelta[] = [];
  for (const r of rows) {
    try {
      const delta = await checkDomain(r);
      details.push(delta);
      if (delta.brokeSinceLastCheck) drifted++;
    } catch {
      errors++;
    }
  }
  return { domainsChecked: rows.length, domainsDrifted: drifted, details, errors };
}

// Silence unused — the daily-run orchestrator wires the sweep; the per-org
// helper is used by the route layer.
void sql;
