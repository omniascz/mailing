/**
 * DMARC Digest service (#233)
 *
 * Parses incoming DMARC aggregate report XML (RFC 7489) and stores
 * structured data for the deliverability dashboard.
 *
 * Flow:
 *   1. ISP/Gmail sends gzipped XML email to the DMARC report inbox
 *   2. Inbound email webhook calls receiveDmarcReport() with the XML payload
 *   3. We parse, persist, and surface stats via getDmarcStats()
 *
 * Storage: we store parsed reports as JSONB in a dedicated table.
 * No external XML library needed — we use a lightweight regex-based extractor
 * since DMARC XML is well-structured and narrow in scope.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dmarcReports } from '../../db/schema/index.js';

// ─── XML parser (lightweight, no deps) ───────────────────────────────────────

function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 's'));
  return m?.[1]?.trim() ?? '';
}

function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'g');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!.trim());
  }
  return results;
}

export interface DmarcRecord {
  sourceIp: string;
  count: number;
  disposition: string;
  dkim: string;
  spf: string;
  headerFrom: string;
  envelopeFrom: string;
}

export interface ParsedDmarcReport {
  orgName: string;
  reportId: string;
  domain: string;
  dateBegin: Date;
  dateEnd: Date;
  policyDomain: string;
  policyAdkim: string;
  policyAspf: string;
  policyP: string;
  policyPct: number;
  records: DmarcRecord[];
  totalMessages: number;
  passCount: number;
  failCount: number;
}

export function parseDmarcXml(xml: string): ParsedDmarcReport {
  // Report metadata
  const orgName = xmlText(xml, 'org_name') || xmlText(xml, 'org-name');
  const reportId = xmlText(xml, 'report_id') || xmlText(xml, 'report-id');
  const domain = xmlText(xml, 'domain');
  const dateBeginTs = parseInt(xmlText(xml, 'begin'), 10);
  const dateEndTs = parseInt(xmlText(xml, 'end'), 10);

  // Policy
  const policySection = xmlAll(xml, 'policy_published')[0] ?? xmlAll(xml, 'policy-published')[0] ?? '';
  const policyDomain = xmlText(policySection, 'domain') || domain;
  const policyAdkim = xmlText(policySection, 'adkim') || 'r';
  const policyAspf = xmlText(policySection, 'aspf') || 'r';
  const policyP = xmlText(policySection, 'p') || 'none';
  const policyPct = parseInt(xmlText(policySection, 'pct') || '100', 10);

  // Records
  const recordXmls = xmlAll(xml, 'record');
  const records: DmarcRecord[] = recordXmls.map((rec) => {
    const rowXml = xmlAll(rec, 'row')[0] ?? rec;
    const authXml = xmlAll(rec, 'auth_results')[0] ?? xmlAll(rec, 'auth-results')[0] ?? rec;
    const identXml = xmlAll(rec, 'identifiers')[0] ?? rec;

    const dkimResult = xmlAll(authXml, 'dkim')
      .map((d) => xmlText(d, 'result'))
      .find((r) => r === 'pass') ?? xmlText(authXml, 'result') ?? 'fail';

    const spfResult = xmlAll(authXml, 'spf')
      .map((s) => xmlText(s, 'result'))
      .find((r) => r === 'pass') ?? 'fail';

    return {
      sourceIp: xmlText(rowXml, 'source_ip') || xmlText(rowXml, 'source-ip'),
      count: parseInt(xmlText(rowXml, 'count') || '1', 10),
      disposition: xmlText(xmlAll(rowXml, 'policy_evaluated')[0] ?? rowXml, 'disposition') || 'none',
      dkim: dkimResult,
      spf: spfResult,
      headerFrom: xmlText(identXml, 'header_from') || xmlText(identXml, 'header-from'),
      envelopeFrom: xmlText(identXml, 'envelope_from') || xmlText(identXml, 'envelope-from'),
    };
  });

  const totalMessages = records.reduce((s, r) => s + r.count, 0);
  const passCount = records
    .filter((r) => r.dkim === 'pass' || r.spf === 'pass')
    .reduce((s, r) => s + r.count, 0);

  return {
    orgName,
    reportId,
    domain,
    dateBegin: new Date(dateBeginTs * 1000),
    dateEnd: new Date(dateEndTs * 1000),
    policyDomain,
    policyAdkim,
    policyAspf,
    policyP,
    policyPct,
    records,
    totalMessages,
    passCount,
    failCount: totalMessages - passCount,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function receiveDmarcReport(orgId: string, xmlPayload: string): Promise<void> {
  const parsed = parseDmarcXml(xmlPayload);

  await db
    .insert(dmarcReports)
    .values({
      orgId,
      reportId: parsed.reportId,
      reporterOrg: parsed.orgName,
      domain: parsed.domain,
      dateBegin: parsed.dateBegin,
      dateEnd: parsed.dateEnd,
      policy: {
        domain: parsed.policyDomain,
        adkim: parsed.policyAdkim,
        aspf: parsed.policyAspf,
        p: parsed.policyP,
        pct: parsed.policyPct,
      },
      records: parsed.records,
      totalMessages: parsed.totalMessages,
      passCount: parsed.passCount,
      failCount: parsed.failCount,
    })
    .onConflictDoNothing(); // idempotent — same reportId from same reporter is a duplicate
}

// ─── Dashboard queries ────────────────────────────────────────────────────────

export async function listDmarcReports(
  orgId: string,
  opts: { domain?: string; limit?: number; cursor?: string } = {},
): Promise<{
  data: (typeof dmarcReports.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const conditions = [eq(dmarcReports.orgId, orgId)];
  if (opts.domain) conditions.push(eq(dmarcReports.domain, opts.domain));
  if (opts.cursor) {
    conditions.push(
      sql`${dmarcReports.dateEnd} < ${new Date(opts.cursor).toISOString()}`,
    );
  }

  const rows = await db
    .select()
    .from(dmarcReports)
    .where(and(...conditions))
    .orderBy(desc(dmarcReports.dateEnd))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    hasMore,
    cursor: hasMore && data.length > 0 ? data[data.length - 1]!.dateEnd.toISOString() : null,
  };
}

export interface DmarcSummary {
  domain: string;
  totalMessages: number;
  passCount: number;
  failCount: number;
  passRate: number;
  reportCount: number;
  periodDays: number;
}

/**
 * Aggregate DMARC stats for the last N days for a domain.
 */
export async function getDmarcSummary(
  orgId: string,
  domain: string,
  days = 30,
): Promise<DmarcSummary> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(dmarcReports)
    .where(
      and(
        eq(dmarcReports.orgId, orgId),
        eq(dmarcReports.domain, domain),
        gte(dmarcReports.dateEnd, since),
      ),
    );

  const total = rows.reduce((s, r) => s + r.totalMessages, 0);
  const pass = rows.reduce((s, r) => s + r.passCount, 0);

  return {
    domain,
    totalMessages: total,
    passCount: pass,
    failCount: total - pass,
    passRate: total > 0 ? Math.round((pass / total) * 1000) / 10 : 0,
    reportCount: rows.length,
    periodDays: days,
  };
}
