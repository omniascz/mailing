/**
 * Sprint E.9 — Sending-domain quality checker.
 *
 * Consolidates the 4 mandatory DNS records (SPF, DKIM, DMARC, Return-Path)
 * plus 3 advisory checks (DMARC policy enforcement, BIMI readiness,
 * tracking subdomain) into a single report the onboarding wizard reads
 * to decide whether to flip the "ready to send" green light.
 *
 * Each check returns:
 *   - id          — stable identifier (snapshot in UI state)
 *   - label       — short human label
 *   - severity    — 'error' (blocks sending) | 'warning' | 'info'
 *   - passed      — boolean
 *   - message     — what was found
 *   - fix         — what to do about it
 *
 * The endpoint that ships this report (GET /api/v1/domains/:id/quality-check)
 * is what the onboarding wizard polls until every error-severity check
 * passes; warnings and info checks are surfaced but don't block.
 */

import dns from 'node:dns/promises';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { buildDnsRecords, verifyDnsRecords } from './dns-records.js';

export type CheckSeverity = 'error' | 'warning' | 'info';

export interface QualityCheck {
  id: string;
  label: string;
  severity: CheckSeverity;
  passed: boolean;
  message: string;
  fix: string;
}

export interface QualityReport {
  domain: string;
  generatedAt: string;
  ready: boolean;
  errorCount: number;
  warningCount: number;
  checks: QualityCheck[];
}

const DMARC_POLICY_RE = /\bp=(none|quarantine|reject)\b/i;
const DMARC_RUA_RE = /\brua=mailto:/i;
const BIMI_PASS_POLICIES = new Set(['quarantine', 'reject']);

export async function runQualityCheck(
  orgId: string,
  domainId: string,
): Promise<QualityReport> {
  const [row] = await db
    .select()
    .from(sendingDomains)
    .where(
      and(eq(sendingDomains.id, domainId), eq(sendingDomains.orgId, orgId)),
    )
    .limit(1);

  if (!row) throw AppError.notFound('SendingDomain');

  const domain = row.domain;
  const mailSubdomain = row.mailSubdomain ?? `mail.${domain}`;
  const dkimSelector = row.dkimSelector ?? 'fm1';

  // Live DNS pass — buildDnsRecords + verifyDnsRecords already cover SPF /
  // DKIM / DMARC / Return-Path. Pass a placeholder public key when the
  // org hasn't generated one yet (the DKIM check still meaningfully
  // reports "key not generated").
  const dnsRecords = buildDnsRecords({
    domain,
    mailSubdomain,
    dkimSelector,
    dkimPublicKey: row.dkimPublicKey ?? '',
    dmarcEmail: `dmarc@${domain}`,
  });
  const dnsVerification = await verifyDnsRecords(dnsRecords);

  const checks: QualityCheck[] = [];

  // 1. SPF — mandatory; the SPF record must include forgemsg's IPs.
  const spfRec = dnsVerification.records.find((r) =>
    r.purpose.toLowerCase().startsWith('spf'),
  );
  checks.push({
    id: 'spf',
    label: 'SPF record published',
    severity: 'error',
    passed: spfRec?.verified === true,
    message: spfRec?.verified
      ? 'SPF record found with ForgeMsg include.'
      : 'No matching SPF TXT record found at the apex.',
    fix: `Add this TXT record to ${domain}: ${spfRec?.value ?? 'v=spf1 include:spf.forgemsg.com ~all'}`,
  });

  // 2. DKIM — mandatory.
  const dkimRec = dnsVerification.records.find(
    (r) => r.type === 'TXT' && r.hostname.includes('_domainkey'),
  );
  checks.push({
    id: 'dkim',
    label: 'DKIM record published',
    severity: 'error',
    passed: dkimRec?.verified === true && Boolean(row.dkimPublicKey),
    message: !row.dkimPublicKey
      ? 'No DKIM key generated for this domain yet.'
      : dkimRec?.verified
        ? `DKIM record found at ${dkimRec.hostname}.`
        : `DKIM TXT record missing at ${dkimRec?.hostname ?? '(unknown)'}.`,
    fix: !row.dkimPublicKey
      ? `Call POST /api/v1/domains/${domainId}/dkim/generate to create the keypair.`
      : `Publish the DKIM TXT record at ${dkimRec?.hostname ?? '_domainkey.' + domain}.`,
  });

  // 3. DMARC — mandatory presence. Policy level (p=none/quarantine/reject)
  // is a separate advisory check below.
  const dmarcRec = dnsVerification.records.find((r) =>
    r.purpose.toLowerCase().startsWith('dmarc'),
  );
  checks.push({
    id: 'dmarc-present',
    label: 'DMARC record published',
    severity: 'error',
    passed: dmarcRec?.verified === true,
    message: dmarcRec?.verified
      ? 'DMARC record found at _dmarc.' + domain
      : 'No DMARC TXT record at _dmarc.' + domain,
    fix: `Add this TXT record at _dmarc.${domain}: ${dmarcRec?.value ?? 'v=DMARC1; p=none; rua=mailto:dmarc@' + domain}`,
  });

  // 4. Return-Path — mandatory.
  const rpRec = dnsVerification.records.find((r) =>
    r.purpose.toLowerCase().includes('return-path'),
  );
  checks.push({
    id: 'return-path',
    label: 'Return-Path CNAME points at ForgeMsg',
    severity: 'error',
    passed: rpRec?.verified === true,
    message: rpRec?.verified
      ? `Return-Path CNAME on ${rpRec.hostname} resolved.`
      : `Return-Path CNAME missing at ${rpRec?.hostname ?? mailSubdomain}.`,
    fix: `Add CNAME ${rpRec?.hostname ?? mailSubdomain} → ${rpRec?.value ?? 'return-path.forgemsg.com'}.`,
  });

  // 5. DMARC policy enforcement — advisory. Sending at p=none is allowed
  // but graduating to quarantine/reject signals deliverability maturity.
  const dmarcPolicy = await lookupDmarcPolicy(domain);
  checks.push({
    id: 'dmarc-policy',
    label: 'DMARC policy enforced',
    severity: 'warning',
    passed: dmarcPolicy !== null && dmarcPolicy !== 'none',
    message:
      dmarcPolicy === null
        ? 'DMARC record not yet readable — skip this check until DMARC is present.'
        : dmarcPolicy === 'none'
          ? "DMARC is at p=none (monitor-only). Once you've seen 30 days of clean reports, graduate to p=quarantine."
          : `DMARC is at p=${dmarcPolicy} — solid.`,
    fix:
      dmarcPolicy === 'none'
        ? `After ~30 days of monitoring, change DMARC TXT to: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=10`
        : 'No action required.',
  });

  // 6. DMARC aggregate reporting (rua=) — advisory but high-value: without
  // rua, the org has no visibility on alignment failures.
  const dmarcRua = await lookupDmarcHasRua(domain);
  checks.push({
    id: 'dmarc-rua',
    label: 'DMARC aggregate reports collected (rua=)',
    severity: 'warning',
    passed: dmarcRua === true,
    message:
      dmarcRua === null
        ? 'DMARC record not yet readable.'
        : dmarcRua
          ? 'DMARC rua= present; aggregate reports flowing.'
          : 'DMARC record has no rua= tag — you receive no alignment reports.',
    fix: dmarcRua
      ? 'No action required.'
      : `Add rua=mailto:dmarc@${domain} to your DMARC TXT and consume the daily reports at /api/v1/dmarc/reports.`,
  });

  // 7. BIMI readiness — info only. DMARC must be at quarantine+ before BIMI
  // logos render in Gmail/Yahoo/Apple Mail.
  checks.push({
    id: 'bimi-ready',
    label: 'BIMI readiness',
    severity: 'info',
    passed:
      dmarcPolicy !== null && BIMI_PASS_POLICIES.has(dmarcPolicy),
    message:
      dmarcPolicy === null
        ? 'BIMI requires DMARC to be in place first.'
        : BIMI_PASS_POLICIES.has(dmarcPolicy)
          ? `DMARC at p=${dmarcPolicy} qualifies for BIMI. Next step is publishing your VMC + SVG logo.`
          : `BIMI requires DMARC at p=quarantine or p=reject (currently p=${dmarcPolicy}).`,
    fix:
      dmarcPolicy && BIMI_PASS_POLICIES.has(dmarcPolicy)
        ? 'Add a BIMI TXT record at default._bimi pointing to your VMC-signed SVG logo.'
        : 'Graduate DMARC to p=quarantine or higher first.',
  });

  const errorCount = checks.filter((c) => c.severity === 'error' && !c.passed).length;
  const warningCount = checks.filter(
    (c) => c.severity === 'warning' && !c.passed,
  ).length;

  return {
    domain,
    generatedAt: new Date().toISOString(),
    ready: errorCount === 0,
    errorCount,
    warningCount,
    checks,
  };
}

// ─── DMARC advisory helpers ─────────────────────────────────────────────────

async function fetchDmarcRecord(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((r) => r.join('')).find((r) => r.startsWith('v=DMARC1'));
    return flat ?? null;
  } catch {
    return null;
  }
}

async function lookupDmarcPolicy(
  domain: string,
): Promise<'none' | 'quarantine' | 'reject' | null> {
  const rec = await fetchDmarcRecord(domain);
  if (!rec) return null;
  const match = rec.match(DMARC_POLICY_RE);
  if (!match) return null;
  return match[1]!.toLowerCase() as 'none' | 'quarantine' | 'reject';
}

async function lookupDmarcHasRua(domain: string): Promise<boolean | null> {
  const rec = await fetchDmarcRecord(domain);
  if (!rec) return null;
  return DMARC_RUA_RE.test(rec);
}
