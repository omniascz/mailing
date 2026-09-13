/**
 * The DMARC poller read the tenant out of the report it had just received.
 *
 *     const orgId = extractOrgIdFromXml(xml) ?? defaultOrgId;
 *     // xml.match(/<comment>[^<]*orgId:([a-f0-9-]{36})[^<]*<\/comment>/i)
 *
 * `<comment>` is a real element of the DMARC aggregate schema (RFC 7489,
 * Appendix C) — but it belongs to PolicyOverrideReason, free text the RECEIVING
 * mail host writes to explain why it did not apply the published policy. It is
 * filled in by whoever generated the report. Nothing in this repository ever
 * wrote such a field, and no sender puts an orgId there.
 *
 * The mailbox is one platform address shared by every customer: every domain's
 * DMARC record points `rua=` at the same address. So anyone able to deliver a
 * message to it chose the organisation their report was filed under, and the
 * worker then signed the request with the platform secret on their behalf.
 *
 * These cases assert on the organisation the worker HANDS OUT, which is the
 * decision that was wrong. What that decision costs in the database — a row in
 * somebody else's dmarc_reports — is measured against the real database in
 * apps/api/src/integration/dmarc-report-tenant.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { ingestReportXml } from './dmarc-imap-poll.js';

const FALLBACK_ORG = '11111111-1111-4111-8111-111111111111';
const VICTIM_ORG = '22222222-2222-4222-8222-222222222222';

/** A report whose policy-override comment carries someone else's org id. */
const REPORT_WITH_COMMENT = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <report_id>attack-1</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.test</domain><p>none</p></policy_published>
  <record>
    <row>
      <source_ip>203.0.113.5</source_ip>
      <count>1</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <reason>
          <type>local_policy</type>
          <comment>orgId:${VICTIM_ORG}</comment>
        </reason>
      </policy_evaluated>
    </row>
  </record>
</feedback>`;

const PLAIN_REPORT = `<?xml version="1.0"?>
<feedback>
  <report_metadata><org_name>yahoo.com</org_name><report_id>plain-1</report_id></report_metadata>
  <policy_published><domain>example.test</domain></policy_published>
</feedback>`;

/** Records what the worker decided, the way the HTTP sender would receive it. */
function recordingSender() {
  const sent: Array<{ orgId: string; xml: string }> = [];
  const send = async (orgId: string, xml: string): Promise<boolean> => {
    sent.push({ orgId, xml });
    return true;
  };
  return { sent, send };
}

describe('a polled DMARC report is filed under the configured org, never the one it names', () => {
  it('ignores an org id planted in the report comment', async () => {
    const { sent, send } = recordingSender();

    const ok = await ingestReportXml(REPORT_WITH_COMMENT, FALLBACK_ORG, send);

    // The report was ingested — this is the guard against a silent green, since
    // "it did not go to the victim" is also true of a worker that drops
    // everything on the floor.
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);

    expect(sent[0]!.orgId, "the org id from the report's comment was used").not.toBe(VICTIM_ORG);
    expect(sent[0]!.orgId).toBe(FALLBACK_ORG);
    // The XML itself is passed through untouched — the comment is still in
    // there, it simply no longer decides anything.
    expect(sent[0]!.xml).toContain(`orgId:${VICTIM_ORG}`);
  });

  it('files an ordinary report under the configured org, as before', async () => {
    // Negative control: the fix must not change the legitimate path.
    const { sent, send } = recordingSender();

    const ok = await ingestReportXml(PLAIN_REPORT, FALLBACK_ORG, send);

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.orgId).toBe(FALLBACK_ORG);
  });

  it('drops a report it cannot attribute, and says so', async () => {
    // Negative control: with no DMARC_IMAP_ORG_ID there is no organisation to
    // file under, and a guess is worse than a gap.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sent, send } = recordingSender();

    const ok = await ingestReportXml(REPORT_WITH_COMMENT, undefined, send);

    expect(ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('DMARC_IMAP_ORG_ID');
    warn.mockRestore();
  });

  it('ignores an attachment that is not a DMARC report at all', async () => {
    const { sent, send } = recordingSender();
    const ok = await ingestReportXml('<html>not a report</html>', FALLBACK_ORG, send);
    expect(ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
