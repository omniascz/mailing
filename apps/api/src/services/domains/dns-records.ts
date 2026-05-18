/**
 * SPF / DMARC / Return-Path DNS record builder and verifier.
 *
 * Generates the exact DNS records a customer needs to add for their sending
 * domain, then verifies each one via live DNS lookups.
 */

import dns from 'node:dns';
import { promisify } from 'node:util';

const resolveTxtAsync = promisify(dns.resolveTxt);
const resolveCnameAsync = promisify(dns.resolveCname);
const resolveMxAsync = promisify(dns.resolveMx);

// ─── Record definitions ───────────────────────────────────────────────────────

export type DnsRecordType = 'TXT' | 'CNAME' | 'MX';

export interface DnsRecord {
  type: DnsRecordType;
  hostname: string;
  value: string;
  /** Human-readable purpose */
  purpose: string;
  /** True if this record has been found in DNS */
  verified: boolean;
  /** ISO timestamp of last verification */
  lastCheckedAt: string | null;
}

/** Platform's shared SPF include identifier */
const FORGEMSG_SPF_INCLUDE = 'spf.forgemsg.com';
/** Platform's Return-Path CNAME target */
const FORGEMSG_RETURN_PATH_TARGET = 'return-path.forgemsg.com';
/** Platform's inbound MX for bounce processing */
const FORGEMSG_BOUNCE_MX = 'bounce.forgemsg.com';

/**
 * Build all required DNS records for a sending domain.
 *
 * @param domain          Customer domain (e.g. "acme.cz")
 * @param mailSubdomain   Subdomain for mail routing (e.g. "mail.acme.cz")
 * @param dkimSelector    DKIM selector (e.g. "fm1")
 * @param dkimPublicKey   Base64 public key from key generation
 * @param dmarcEmail      Email address for DMARC reports (usually the platform postmaster)
 */
export function buildDnsRecords(opts: {
  domain: string;
  mailSubdomain: string;
  dkimSelector: string;
  dkimPublicKey: string;
  dmarcEmail: string;
}): DnsRecord[] {
  const { domain, mailSubdomain, dkimSelector, dkimPublicKey, dmarcEmail } = opts;

  return [
    // ─── SPF ─────────────────────────────────────────────────────────────────
    {
      type: 'TXT',
      hostname: domain,
      value: `v=spf1 include:${FORGEMSG_SPF_INCLUDE} ~all`,
      purpose: 'SPF — authorises ForgeMsg to send email from this domain',
      verified: false,
      lastCheckedAt: null,
    },

    // ─── DKIM ─────────────────────────────────────────────────────────────────
    {
      type: 'TXT',
      hostname: `${dkimSelector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      purpose: 'DKIM — cryptographic signature key for outgoing emails',
      verified: false,
      lastCheckedAt: null,
    },

    // ─── DMARC ───────────────────────────────────────────────────────────────
    {
      type: 'TXT',
      hostname: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; pct=100; rua=mailto:${dmarcEmail}; ruf=mailto:${dmarcEmail}; fo=1`,
      purpose: 'DMARC — policy for handling unauthenticated emails from this domain',
      verified: false,
      lastCheckedAt: null,
    },

    // ─── Return-Path (CNAME) ──────────────────────────────────────────────────
    {
      type: 'CNAME',
      hostname: mailSubdomain,
      value: FORGEMSG_RETURN_PATH_TARGET,
      purpose: 'Return-Path — routes bounces back to ForgeMsg for processing',
      verified: false,
      lastCheckedAt: null,
    },

    // ─── Bounce MX ───────────────────────────────────────────────────────────
    {
      type: 'MX',
      hostname: mailSubdomain,
      value: FORGEMSG_BOUNCE_MX,
      purpose: 'MX — receives bounce / FBL / out-of-office emails for ForgeMsg to process',
      verified: false,
      lastCheckedAt: null,
    },
  ];
}

// ─── DNS verification ─────────────────────────────────────────────────────────

export interface VerificationResult {
  records: DnsRecord[];
  allVerified: boolean;
}

/**
 * Verify each DNS record by performing live DNS lookups.
 *
 * Returns the same record list with `verified` and `lastCheckedAt` populated.
 * Non-fatal DNS errors (NXDOMAIN, SERVFAIL) mark the record as unverified.
 */
export async function verifyDnsRecords(records: DnsRecord[]): Promise<VerificationResult> {
  const now = new Date().toISOString();

  const verified = await Promise.all(
    records.map(async (rec): Promise<DnsRecord> => {
      try {
        const isVerified = await checkRecord(rec);
        return { ...rec, verified: isVerified, lastCheckedAt: now };
      } catch {
        return { ...rec, verified: false, lastCheckedAt: now };
      }
    }),
  );

  return {
    records: verified,
    allVerified: verified.every((r) => r.verified),
  };
}

async function checkRecord(rec: DnsRecord): Promise<boolean> {
  switch (rec.type) {
    case 'TXT': {
      const results = await resolveTxtAsync(rec.hostname).catch(() => [] as string[][]);
      const flat = results.map((chunks) => chunks.join('')).join(' ');
      // SPF: contains our include, DKIM: contains v=DKIM1, DMARC: contains v=DMARC1
      if (rec.value.startsWith('v=spf1')) {
        return flat.includes(FORGEMSG_SPF_INCLUDE);
      }
      if (rec.value.startsWith('v=DKIM1')) {
        // Key may be chunked — check that hostname exists with our key substring
        const keyPart = rec.value.split('p=')[1]?.slice(0, 32) ?? '';
        return keyPart ? flat.includes(keyPart) : flat.includes('v=DKIM1');
      }
      if (rec.value.startsWith('v=DMARC1')) {
        return flat.includes('v=DMARC1');
      }
      return flat.includes(rec.value);
    }

    case 'CNAME': {
      const cnameArr = await resolveCnameAsync(rec.hostname).catch(() => [] as string[]);
      const cname = cnameArr[0] ?? '';
      return (
        cname === rec.value ||
        cname === `${rec.value}.` ||
        cname.endsWith(`.${rec.value}`) ||
        cname.endsWith(`.${rec.value}.`)
      );
    }

    case 'MX': {
      const mxRecords = await resolveMxAsync(rec.hostname).catch(() => [] as dns.MxRecord[]);
      return mxRecords.some(
        (mx) =>
          mx.exchange === rec.value ||
          mx.exchange === `${rec.value}.` ||
          mx.exchange.endsWith(`.${rec.value}`),
      );
    }
  }
}
