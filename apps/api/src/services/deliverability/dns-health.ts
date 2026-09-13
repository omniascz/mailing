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

import dns from 'node:dns';
import { promisify } from 'node:util';
import { dmarcReportEmail } from '../../config/env.js';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/index.js';
import { buildDnsRecords, verifyDnsRecords, type DnsRecord } from '../domains/dns-records.js';
import { verifyDkimDns } from '../domains/dkim.js';
import { reportIncident } from '../status-page/index.js';

const DMARC_REPORT_EMAIL = dmarcReportEmail();

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
  /** Only the platform-wide sweep fills this in; the per-org re-check does not. */
  dmarcReportAuthorisation?: ReportAuthorisationResult;
}

// ─── Platform record: external DMARC report destination ──────────────────────

/** Seam so the tests can drive this without asking the network. */
export interface ReportAuthorisationDeps {
  resolveTxt(hostname: string): Promise<string[][]>;
}

const defaultResolveTxt: ReportAuthorisationDeps['resolveTxt'] = promisify(dns.resolveTxt);

export interface ReportAuthorisationResult {
  /** The name that must exist, e.g. `*._report._dmarc.mailforge.cz`. */
  hostname: string;
  /** True only when the record was found AND carries v=DMARC1. */
  present: boolean;
  /** False when DNS could not be asked at all — absence is then unknown, not proven. */
  checked: boolean;
  detail: string;
}

/**
 * Is our own domain authorised to receive other domains' DMARC reports?
 *
 * Every customer's DMARC record points `rua=` at one address of ours
 * (`dmarcReportEmail()`), so for every one of them the destination is an
 * external organisational domain. RFC 7489 §7.1 covers exactly that case: the
 * report generator must find a TXT record at
 * `<policy-domain>._report._dmarc.<destination>` carrying `v=DMARC1`, or a
 * wildcard `*._report._dmarc.<destination>` authorising any domain — and where
 * it does not, it MUST NOT send the report. Without that record the aggregate
 * reports customers are told to expect simply never arrive, and nothing in the
 * system says why: the mailbox is empty, the poller ingests nothing, and every
 * dashboard shows a legitimate-looking zero.
 *
 * One record covers the whole platform, which is why this is checked here and
 * not per customer domain. It is a report, never a throw: DNS being
 * unreachable is not the same fact as the record being absent, and the two are
 * kept apart in the result.
 */
export async function checkDmarcReportAuthorisation(
  deps: ReportAuthorisationDeps = { resolveTxt: defaultResolveTxt },
): Promise<ReportAuthorisationResult> {
  const destination = DMARC_REPORT_EMAIL.split('@')[1]?.trim().toLowerCase() ?? '';
  const hostname = `*._report._dmarc.${destination}`;

  if (!destination) {
    return {
      hostname,
      present: false,
      checked: false,
      detail: `Cannot check: ${DMARC_REPORT_EMAIL} has no domain part.`,
    };
  }

  let records: string[][];
  try {
    records = await deps.resolveTxt(hostname);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    // NXDOMAIN and NODATA are answers: the record is not there. Anything else
    // (SERVFAIL, timeout, no resolver) means we failed to ask, and reporting
    // that as "missing" would raise a false alarm every time DNS hiccups.
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return {
        hostname,
        present: false,
        checked: true,
        detail: `No TXT record at ${hostname}. RFC 7489 §7.1: report generators must not send aggregate reports to ${DMARC_REPORT_EMAIL}, so customers' DMARC reports never arrive.`,
      };
    }
    return {
      hostname,
      present: false,
      checked: false,
      detail: `DNS lookup for ${hostname} failed (${code || (err as Error).message}); authorisation state unknown.`,
    };
  }

  const flat = records.map((chunks) => chunks.join('')).join(' ');
  if (flat.includes('v=DMARC1')) {
    return {
      hostname,
      present: true,
      checked: true,
      detail: `${hostname} authorises report delivery.`,
    };
  }

  return {
    hostname,
    present: false,
    checked: true,
    detail: `${hostname} exists but carries no v=DMARC1 tag (${flat.slice(0, 120) || 'empty'}). RFC 7489 §7.1 requires it, so reports are not sent.`,
  };
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

  // The platform's own record, once per sweep rather than once per domain.
  // This runs here because this is the only job that already does live DNS
  // lookups on a schedule and has somewhere to report drift to; the readiness
  // probe was the other candidate and is the wrong one — it gates live traffic,
  // so a DNS hiccup there would drain instances over a record that has nothing
  // to do with serving requests.
  let dmarcReportAuthorisation: ReportAuthorisationResult | undefined;
  try {
    dmarcReportAuthorisation = await checkDmarcReportAuthorisation();
    if (dmarcReportAuthorisation.checked && !dmarcReportAuthorisation.present) {
      console.error(`[dns-health] ${dmarcReportAuthorisation.detail}`);
      void reportIncident('webhook_failures', {
        // Same reuse of an existing signal kind as the DNS-drift report above.
        summary: `DMARC report authorisation missing: ${dmarcReportAuthorisation.hostname}`,
      });
    }
  } catch (err) {
    // Belt and braces: the check returns rather than throws, but a sweep must
    // not die over the platform record either.
    console.error('[dns-health] DMARC report authorisation check failed', err);
  }

  return {
    domainsChecked: rows.length,
    domainsDrifted: drifted,
    details,
    errors,
    dmarcReportAuthorisation,
  };
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
