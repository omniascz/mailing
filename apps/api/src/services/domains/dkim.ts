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

export type DkimKeyType = 'rsa' | 'ed25519';

export interface DkimKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  /** Base64-encoded public key — used inside the DNS p= tag */
  publicKeyBase64: string;
  /** Full TXT record value to set in DNS */
  dnsValue: string;
  /** Which algorithm the key uses (rsa or ed25519). */
  keyType: DkimKeyType;
}

/**
 * Extract the DNS `p=` value for a public key. RSA uses the base64 SPKI DER;
 * Ed25519 (RFC 8463) uses the base64 of the raw 32-byte public key, NOT the
 * SPKI wrapper.
 */
function publicKeyDnsBase64(publicKey: crypto.KeyObject, keyType: DkimKeyType): string {
  if (keyType === 'ed25519') {
    const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
    // jwk.x is base64url of the raw 32-byte key → re-encode as standard base64.
    return Buffer.from(jwk.x ?? '', 'base64url').toString('base64');
  }
  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  return pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '');
}

/**
 * Generate a fresh DKIM key pair. Defaults to 2048-bit RSA; pass 'ed25519' for
 * an RFC 8463 Ed25519 key (shorter DNS record, modern — always publish
 * alongside an RSA key for receiver compatibility).
 *
 * The caller is responsible for persisting privateKeyPem securely (e.g. hashed
 * column with access-logging; never expose via API).
 */
export async function generateDkimKeyPair(keyType: DkimKeyType = 'rsa'): Promise<DkimKeyPair> {
  const { privateKey, publicKey } = await new Promise<{
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
  }>((resolve, reject) => {
    const cb = (err: Error | null, pub: string, priv: string) => {
      if (err) return reject(err);
      resolve({
        publicKey: crypto.createPublicKey(pub),
        privateKey: crypto.createPrivateKey(priv),
      });
    };
    if (keyType === 'ed25519') {
      crypto.generateKeyPair(
        'ed25519',
        {
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        },
        cb,
      );
    } else {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        },
        cb,
      );
    }
  });

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const publicKeyBase64 = publicKeyDnsBase64(publicKey, keyType);
  const dnsValue = `v=DKIM1; k=${keyType}; p=${publicKeyBase64}`;

  return { privateKeyPem, publicKeyPem, publicKeyBase64, dnsValue, keyType };
}

// ─── BYODKIM (bring your own key) ──────────────────────────────────────────────

export interface ImportedDkimKey {
  privateKeyPem: string;
  publicKeyBase64: string;
  dnsValue: string;
}

/**
 * Validate a customer-supplied DKIM private key (PEM) and derive its public key
 * for the DNS record the customer must publish. Accepts RSA and Ed25519
 * (RFC 8463) keys; throws otherwise. Pure + testable.
 */
export function importDkimPrivateKey(
  privateKeyPem: string,
): ImportedDkimKey & { keyType: DkimKeyType } {
  let priv: crypto.KeyObject;
  try {
    priv = crypto.createPrivateKey(privateKeyPem);
  } catch {
    throw new Error('Invalid private key PEM');
  }
  const keyType: DkimKeyType | null =
    priv.asymmetricKeyType === 'rsa'
      ? 'rsa'
      : priv.asymmetricKeyType === 'ed25519'
        ? 'ed25519'
        : null;
  if (!keyType) {
    throw new Error('DKIM key must be RSA or Ed25519');
  }
  const pub = crypto.createPublicKey(priv);
  const publicKeyBase64 = publicKeyDnsBase64(pub, keyType);
  // Normalize to PKCS8 PEM for consistent storage + signing.
  const normalizedPem = priv.export({ type: 'pkcs8', format: 'pem' }) as string;
  return {
    privateKeyPem: normalizedPem,
    publicKeyBase64,
    dnsValue: `v=DKIM1; k=${keyType}; p=${publicKeyBase64}`,
    keyType,
  };
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
  const canonBody =
    body
      .replace(/\t/g, ' ') // tabs → spaces
      .replace(/ +/g, ' ') // collapse spaces
      .replace(/\r?\n/g, '\r\n') // normalise line endings
      .replace(/(\r\n)+$/, '') + // strip trailing blank lines
    '\r\n'; // required single trailing CRLF

  // Body hash
  const bodyHash = crypto.createHash('sha256').update(canonBody).digest('base64');

  const signingHeaders = ['from', 'to', 'subject', 'date', 'message-id'];
  const timestamp = Math.floor(Date.now() / 1000);

  // Detect the key algorithm so the a= tag + signing match (RFC 8463 for
  // ed25519). RSA → a=rsa-sha256; Ed25519 → a=ed25519-sha256.
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const isEd25519 = keyObj.asymmetricKeyType === 'ed25519';
  const algTag = isEd25519 ? 'ed25519-sha256' : 'rsa-sha256';

  // Build partial DKIM-Signature header (no b= value yet)
  const partialSig =
    `v=1; a=${algTag}; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
    `t=${timestamp}; bh=${bodyHash}; ` +
    `h=${signingHeaders.join(':')};`;

  // Relaxed header canonicalization
  const canonHeaders = [
    ...signingHeaders.map((name) => {
      const value =
        headers[name] ?? headers[name.replace(/-(.)/g, (_, c: string) => c.toUpperCase())] ?? '';
      return `${name.toLowerCase()}:${value.trim().replace(/\s+/g, ' ')}`;
    }),
    `dkim-signature:${partialSig} b=`,
  ].join('\r\n');

  // Sign. Ed25519 (PureEdDSA) signs the message directly — pass algorithm
  // `null` to crypto.sign; RSA uses RSA-SHA256.
  const signature = isEd25519
    ? crypto.sign(null, Buffer.from(canonHeaders), keyObj).toString('base64')
    : (() => {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(canonHeaders);
        return signer.sign(privateKeyPem, 'base64');
      })();

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
  keyType: DkimKeyType = 'rsa',
): DkimDnsRecord {
  return {
    hostname: `${selector}._domainkey.${domain}`,
    type: 'TXT',
    value: `v=DKIM1; k=${keyType}; p=${publicKeyBase64}`,
  };
}
