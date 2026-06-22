/**
 * Shared Meta (Facebook/Instagram/WhatsApp) webhook signature verification.
 * Meta signs the raw request body with the App Secret as HMAC-SHA256 and sends
 * it as `X-Hub-Signature-256: sha256=<hex>`. Verifying it stops forged inbound
 * webhooks (spoofed customer messages, fake leads, bogus template-status flips).
 */
import crypto from 'node:crypto';

/**
 * Returns true when the signature matches (or when no app secret is configured,
 * i.e. dev). `rawBody` MUST be the exact bytes Meta sent — use req.rawBody from
 * the global raw-body parser, not a re-serialized req.body.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) return true; // not configured (dev) — open
  if (!signatureHeader) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Convenience: pull rawBody + the x-hub-signature-256 header off a Fastify request. */
export function verifyMetaRequest(
  req: { headers: Record<string, unknown>; rawBody?: Buffer; body?: unknown },
  appSecret: string | undefined,
): boolean {
  const sig =
    (req.headers['x-hub-signature-256'] as string | undefined) ??
    (req.headers['x-hub-signature'] as string | undefined);
  const raw =
    (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  return verifyMetaSignature(raw, sig, appSecret);
}
