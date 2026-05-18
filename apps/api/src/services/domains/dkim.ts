/**
 * DKIM key management service.
 *
 * - Generates 2048-bit RSA key pairs using Node.js built-in `crypto`
 * - Formats the public key for DNS TXT record insertion
 * - Signs email headers using DKIM relaxed/relaxed canonicalization (sha256)
 * - Verifies that the DNS record has been published
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import dns from 'node:dns';

const resolveTxtAsync = promisify(dns.resolveTxt);

// ─── Key generation ───────────────────────────────────────────────────────────

export interface DkimKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  /** Base64-encoded public key — used inside the DNS p= tag */
  publicKeyBase64: string;
  /** Full TXT record value to set in DNS */
  dnsValue: string;
}

/**
 * Generate a fresh 2048-bit RSA DKIM key pair.
 *
 * The caller is responsible for persisting privateKeyPem securely (e.g. hashed
 * column with access-logging; never expose via API).
 */
export async function generateDkimKeyPair(): Promise<DkimKeyPair> {
  const { privateKey, publicKey } = await new Promise<{
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
  }>((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      },
      (err, pub, priv) => {
        if (err) return reject(err);
        resolve({
          publicKey: crypto.createPublicKey(pub),
          privateKey: crypto.createPrivateKey(priv),
        });
      },
    );
  });

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Strip PEM header/footer and newlines — DNS needs raw base64
  const publicKeyBase64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '');

  // Standard DKIM TXT record value
  // v=DKIM1 — version
  // k=rsa   — key type
  // p=…     — base64-encoded public key
  const dnsValue = `v=DKIM1; k=rsa; p=${publicKeyBase64}`;

  return { privateKeyPem, publicKeyPem, publicKeyBase64, dnsValue };
}

// ─── DNS verification ─────────────────────────────────────────────────────────

/**
 * Check whether the DKIM public key has been published in DNS.
 *
 * @param selector  DKIM selector (e.g. "fm1")
 * @param domain    Sending domain (e.g. "mail.acme.cz")
 * @param expectedKey  Base64 public key we generated (from `generateDkimKeyPair`)
 * @returns true if DNS contains the expected key
 */
export async function verifyDkimDns(
  selector: string,
  domain: string,
  expectedKey: string,
): Promise<boolean> {
  const hostname = `${selector}._domainkey.${domain}`;
  try {
    const records = await resolveTxtAsync(hostname);
    const flat = records.map((r) => r.join('')).join('');
    // Key may be split across chunks — normalise whitespace
    const cleaned = flat.replace(/\s+/g, '');
    const expectedCleaned = expectedKey.replace(/\s+/g, '');
    return cleaned.includes(expectedCleaned);
  } catch {
    return false;
  }
}

// ─── Email signing ────────────────────────────────────────────────────────────

export interface EmailHeaders {
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  /** Additional headers to include in the signature */
  [key: string]: string;
}

/**
 * Produce a DKIM-Signature header value for an email.
 *
 * Implements:
 * - Relaxed/relaxed canonicalization (both header and body)
 * - sha256 hashing
 * - Signs: from, to, subject, date, message-id
 *
 * The resulting string should be prepended to the email as:
 *   `DKIM-Signature: ${value}`
 *
 * NOTE: This is a simplified implementation suitable for integration with
 * an outgoing MTA that handles the actual SMTP negotiation. In production the
 * MTA (Go service) signs inline; this TypeScript version is used for
 * transactional emails sent directly from the API (e.g. notifications).
 */
export function signEmailDkim(opts: {
  headers: EmailHeaders;
  body: string;
  privateKeyPem: string;
  domain: string;
  selector: string;
}): string {
  const { headers, body, privateKeyPem, domain, selector } = opts;

  // Relaxed body canonicalization: normalise whitespace, trim trailing CRLFs
  const canonBody = body
    .replace(/\t/g, ' ')           // tabs → spaces
    .replace(/ +/g, ' ')           // collapse spaces
    .replace(/\r?\n/g, '\r\n')     // normalise line endings
    .replace(/(\r\n)+$/, '')       // strip trailing blank lines
    + '\r\n';                      // required single trailing CRLF

  // Body hash
  const bodyHash = crypto.createHash('sha256').update(canonBody).digest('base64');

  const signingHeaders = ['from', 'to', 'subject', 'date', 'message-id'];
  const timestamp = Math.floor(Date.now() / 1000);

  // Build partial DKIM-Signature header (no b= value yet)
  const partialSig =
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
    `t=${timestamp}; bh=${bodyHash}; ` +
    `h=${signingHeaders.join(':')};`;

  // Relaxed header canonicalization
  const canonHeaders = [
    ...signingHeaders.map((name) => {
      const value = headers[name] ?? headers[name.replace(/-(.)/g, (_, c: string) => c.toUpperCase())] ?? '';
      return `${name.toLowerCase()}:${value.trim().replace(/\s+/g, ' ')}`;
    }),
    `dkim-signature:${partialSig} b=`,
  ].join('\r\n');

  // Sign
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonHeaders);
  const signature = signer.sign(privateKeyPem, 'base64');

  return `${partialSig} b=${signature}`;
}

// ─── DNS record builder ───────────────────────────────────────────────────────

export interface DkimDnsRecord {
  /** Full hostname to set in DNS */
  hostname: string;
  /** Record type (always TXT for DKIM) */
  type: 'TXT';
  /** Value to set */
  value: string;
}

/**
 * Build the DNS TXT record descriptor for a DKIM public key.
 */
export function buildDkimDnsRecord(
  selector: string,
  domain: string,
  publicKeyBase64: string,
): DkimDnsRecord {
  return {
    hostname: `${selector}._domainkey.${domain}`,
    type: 'TXT',
    value: `v=DKIM1; k=rsa; p=${publicKeyBase64}`,
  };
}
