/**
 * Webhook signature verification helper.
 *
 * Usage:
 *   import { verifyWebhookSignature } from '@forgemsg/sdk';
 *
 *   app.post('/webhook', (req, res) => {
 *     const ok = verifyWebhookSignature({
 *       secret: process.env.FORGEMSG_WEBHOOK_SECRET,
 *       payload: req.rawBody,
 *       signature: req.headers['x-forgemsg-signature'],
 *     });
 *     if (!ok) return res.status(401).send('Invalid signature');
 *     // handle event ...
 *   });
 */

import { createHmac } from 'node:crypto';

export interface VerifyOptions {
  secret: string;
  /** Raw (unparsed) request body string */
  payload: string;
  /** Value of the X-ForgeMsg-Signature header */
  signature: string;
}

/**
 * Returns true if the signature matches HMAC-SHA256(secret, payload).
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(opts: VerifyOptions): boolean {
  const expected = 'sha256=' + createHmac('sha256', opts.secret).update(opts.payload).digest('hex');

  if (expected.length !== opts.signature.length) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  // Constant-time XOR
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
