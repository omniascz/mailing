/**
 * Shared Meta (Facebook/Instagram/WhatsApp) webhook signature verification.
 * Meta signs the raw request body with the App Secret as HMAC-SHA256 and sends
 * it as `X-Hub-Signature-256: sha256=<hex>`. Verifying it stops forged inbound
 * webhooks (spoofed customer messages, fake leads, bogus template-status flips).
 */
import crypto from 'node:crypto';
import { unsignedWebhooksAllowed } from './webhook-switches.js';

/**
 * Returns true only when the signature matches. `rawBody` MUST be the exact
 * bytes Meta sent — use req.rawBody from the global raw-body parser, not a
 * re-serialized req.body.
 *
 * A missing app secret means NOT VERIFIED, not verified. This used to read
 * `if (!appSecret) return true; // not configured (dev) — open`, which turned
 * the absence of configuration into a pass: a deployment that never set
 * META_APP_SECRET, or one that lost it on a redeploy, accepted a forged lead
 * from anyone who knew the URL. It was the last live copy of a shape this
 * repository removed four times elsewhere — see webhook-switches.ts:5-9.
 *
 * The development escape hatch survives, but it has to be asked for:
 * `unsignedWebhooksAllowed()` is the switch that exists for exactly this, and
 * it is unreachable in production by construction. An unset secret on its own
 * no longer opens anything.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) return unsignedWebhooksAllowed();
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
  const raw = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  return verifyMetaSignature(raw, sig, appSecret);
}
