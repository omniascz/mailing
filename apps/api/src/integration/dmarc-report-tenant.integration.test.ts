/**
 * What the DMARC poller's choice of organisation costs, measured in the database.
 *
 * The worker used to read the tenant out of the report it had just received —
 * `<comment>orgId:…</comment>`, a free-text field the RECEIVING mail host fills
 * in (RFC 7489, Appendix C: PolicyOverrideReason). The mailbox is one platform
 * address shared by every customer, so anyone able to deliver a message there
 * named the organisation, and the worker signed the request with the platform
 * secret on their behalf. The decision itself is pinned in
 * apps/workers/src/jobs/dmarc-imap-poll.test.ts.
 *
 * This file is the other half: it ingests exactly that report and shows where
 * the row lands. receiveDmarcReport files under the organisation it is handed
 * and no other, so the organisation the worker picks IS the organisation whose
 * dmarc_reports grows — which is why picking it from the payload mattered.
 *
 * On silent green: "the victim has no report" is also true of an ingestion that
 * stored nothing at all, so each case first pins that the row exists where it
 * belongs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, dmarcReports } from '../db/schema/index.js';
import { receiveDmarcReport } from '../services/deliverability/dmarc-digest.js';

const tag = randomUUID().slice(0, 8);

let ownerOrg: string;
let victimOrg: string;

const REPORT_ID = `rpt-${tag}`;

/** The report an attacker would drop into the shared mailbox. */
const report = (victimUuid: string) => `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <report_id>${REPORT_ID}</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example-${tag}.test</domain><p>none</p></policy_published>
  <record>
    <row>
      <source_ip>203.0.113.5</source_ip>
      <count>3</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
        <reason>
          <type>local_policy</type>
          <comment>orgId:${victimUuid}</comment>
        </reason>
      </policy_evaluated>
    </row>
  </record>
</feedback>`;

const reportsOf = async (orgId: string) =>
  db
    .select()
    .from(dmarcReports)
    .where(and(eq(dmarcReports.orgId, orgId), eq(dmarcReports.reportId, REPORT_ID)));

beforeAll(async () => {
  const [a] = await db
    .insert(organizations)
    .values({ name: 'dmarc owner', slug: `dmarc-owner-${tag}` })
    .returning({ id: organizations.id });
  const [b] = await db
    .insert(organizations)
    .values({ name: 'dmarc victim', slug: `dmarc-victim-${tag}` })
    .returning({ id: organizations.id });
  ownerOrg = a!.id;
  victimOrg = b!.id;
}, 60_000);

afterAll(async () => {
  for (const orgId of [ownerOrg, victimOrg]) {
    await db.delete(dmarcReports).where(eq(dmarcReports.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
}, 60_000);

describe('a DMARC report lands in the organisation it is ingested for, and nowhere else', () => {
  it('the org named inside the report gets nothing', async () => {
    expect(await reportsOf(victimOrg)).toHaveLength(0);

    // Ingested for the configured organisation — what the worker now always
    // does — while the report's own comment names somebody else.
    await receiveDmarcReport(ownerOrg, report(victimOrg));

    // First: the row exists where it belongs. Without this, the assertion
    // below would hold for an ingestion that stored nothing.
    const owned = await reportsOf(ownerOrg);
    expect(owned, 'the report was not stored at all').toHaveLength(1);
    expect(owned[0]!.orgId).toBe(ownerOrg);
    expect(owned[0]!.reporterOrg).toBe('google.com');
    expect(owned[0]!.domain).toBe(`example-${tag}.test`);
    expect(owned[0]!.totalMessages).toBe(3);

    // Then the organisation the report named: nothing, field by field — which
    // here means no row carrying this report id exists for them at all.
    expect(
      await reportsOf(victimOrg),
      'a report was filed under the organisation named inside its own comment',
    ).toHaveLength(0);
  });

  it('ingesting for the victim would have put it there — which is why the choice mattered', async () => {
    // Not a defect, a demonstration: receiveDmarcReport files under whoever it
    // is told, so the worker's choice is the whole of the tenant decision.
    await receiveDmarcReport(victimOrg, report(victimOrg));

    const victimRows = await reportsOf(victimOrg);
    expect(victimRows).toHaveLength(1);
    expect(victimRows[0]!.orgId).toBe(victimOrg);

    // And the owner's row from the first case is untouched by it.
    const owned = await reportsOf(ownerOrg);
    expect(owned).toHaveLength(1);
    expect(owned[0]!.orgId).toBe(ownerOrg);
  });

  it('the same report ingested twice for one org stays one row', async () => {
    // Negative control: the ingestion is idempotent on (org, reporter, report
    // id), so a re-poll of the same mailbox message does not duplicate.
    await receiveDmarcReport(ownerOrg, report(victimOrg));
    expect(await reportsOf(ownerOrg)).toHaveLength(1);
  });
});
