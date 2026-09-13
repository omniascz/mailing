/**
 * Our own domain has to be authorised to receive other domains' DMARC reports.
 *
 * Every sending domain we hand a customer points `rua=` at one address of ours,
 * so for every one of them the destination is an external organisational
 * domain. RFC 7489 §7.1 covers that case: the report generator must find a TXT
 * record at `<policy-domain>._report._dmarc.<destination>` carrying `v=DMARC1`,
 * or a wildcard `*._report._dmarc.<destination>` authorising any domain — and
 * where it does not, it MUST NOT send the report.
 *
 * That record does not exist, and the failure is silent from every angle: the
 * mailbox stays empty, the IMAP poller ingests nothing, and the DMARC dashboard
 * shows a clean zero that reads like good news. Nothing in the system had an
 * opinion about it until this check.
 *
 * The DNS resolver is injected, in the shape blacklist-monitor already uses for
 * its own resolver, so these cases decide nothing by asking the network.
 */
import { describe, it, expect } from 'vitest';
import { checkDmarcReportAuthorisation, type ReportAuthorisationDeps } from './dns-health.js';

/** A resolver that answers with whatever the case wants, and records the name asked for. */
function resolverReturning(records: string[][]) {
  const asked: string[] = [];
  const deps: ReportAuthorisationDeps = {
    resolveTxt: async (hostname) => {
      asked.push(hostname);
      return records;
    },
  };
  return { deps, asked };
}

/** A resolver that fails the way a given DNS error code would. */
function resolverFailing(code: string) {
  const asked: string[] = [];
  const deps: ReportAuthorisationDeps = {
    resolveTxt: async (hostname) => {
      asked.push(hostname);
      const err = new Error(`queryTxt ${code} ${hostname}`) as NodeJS.ErrnoException;
      err.code = code;
      throw err;
    },
  };
  return { deps, asked };
}

describe('the platform DMARC report authorisation record', () => {
  it('reports a missing record instead of passing it off as healthy', async () => {
    // NXDOMAIN is an answer: the name is not there.
    const { deps, asked } = resolverFailing('ENOTFOUND');

    const result = await checkDmarcReportAuthorisation(deps);

    // It asked the right name — the wildcard, at the rua destination.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^\*\._report\._dmarc\./);

    expect(result.present, 'a missing record was reported as present').toBe(false);
    expect(result.checked, 'an answered lookup must count as checked').toBe(true);
    expect(result.detail).toContain('RFC 7489');
    expect(result.detail).toContain(result.hostname);
  });

  it('accepts a record that carries v=DMARC1', async () => {
    // Negative control: an existing record must not raise an alarm.
    const { deps, asked } = resolverReturning([['v=DMARC1']]);

    const result = await checkDmarcReportAuthorisation(deps);

    expect(result.present).toBe(true);
    expect(result.checked).toBe(true);
    expect(asked[0]).toBe(result.hostname);
  });

  it('accepts a chunked record, the way DNS may return it', async () => {
    const { deps } = resolverReturning([['v=', 'DMARC1'], ['unrelated']]);
    const result = await checkDmarcReportAuthorisation(deps);
    expect(result.present).toBe(true);
  });

  it('refuses a record that exists but says nothing about DMARC', async () => {
    const { deps } = resolverReturning([['v=spf1 -all']]);

    const result = await checkDmarcReportAuthorisation(deps);

    expect(result.present).toBe(false);
    expect(result.checked).toBe(true);
    expect(result.detail).toContain('no v=DMARC1 tag');
  });

  it('does not claim the record is missing when DNS could not be asked', async () => {
    // Negative control, and the reason `checked` exists: a SERVFAIL or a
    // timeout is not evidence of absence, and raising an incident on it would
    // cry wolf on every DNS hiccup.
    for (const code of ['ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED']) {
      const { deps } = resolverFailing(code);
      const result = await checkDmarcReportAuthorisation(deps);

      expect(result.present).toBe(false);
      expect(result.checked, `${code} must not count as a checked answer`).toBe(false);
      expect(result.detail).toContain('unknown');
    }
  });

  it('never throws, whatever the resolver does', async () => {
    // The caller is a daily sweep over every customer domain; it must not die
    // over the platform's own record.
    const deps: ReportAuthorisationDeps = {
      resolveTxt: async () => {
        throw new Error('resolver exploded');
      },
    };

    await expect(checkDmarcReportAuthorisation(deps)).resolves.toMatchObject({
      present: false,
      checked: false,
    });
  });
});
