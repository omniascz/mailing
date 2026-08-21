/**
 * Explicit switches for inbound webhook endpoints.
 *
 * Every value here is read from a named environment variable and compared to
 * the literal string 'true'. Nothing in this module infers anything from a
 * secret being absent — that inference is the bug this module exists to
 * replace. Four inbound gates shipped as "if the secret is missing, skip
 * verification", which meant an unconfigured deployment accepted forged
 * requests instead of refusing them.
 *
 * Two kinds of switch live here.
 *
 * 1. `unsignedWebhooksAllowed()` — a development escape hatch for endpoints we
 *    are launching with. It is deliberately impossible to reach in production:
 *    the NODE_ENV check is not overridable by the flag.
 *
 * 2. `*WebhookEnabled()` — per-integration kill switches for endpoints we are
 *    NOT launching with. Off by default; the routes are not registered, or the
 *    handler answers 501 before touching the body.
 *
 * Each flag is its own named variable rather than a lookup by string, so
 * `grep ENABLE_` finds every one of them.
 */

const on = (value: string | undefined): boolean => value === 'true';

/**
 * Accept an unsigned webhook because the operator explicitly said so — never
 * because a secret happens to be missing.
 *
 * The NODE_ENV guard comes first and is not part of the flag: setting
 * ALLOW_UNSIGNED_WEBHOOKS=true in production does nothing.
 */
export function unsignedWebhooksAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && on(process.env.ALLOW_UNSIGNED_WEBHOOKS);
}

/**
 * The Meta-family and Telnyx endpoints are off by default.
 *
 * Their signature verification still contains the open-when-unconfigured shape
 * — deliberately untouched, because we are not shipping these endpoints and
 * repairing verification we do not use would be work spent on a surface nobody
 * can reach. The switch therefore requires the secret as well as the flag: an
 * endpoint that would verify nothing does not come back on just because
 * somebody exported one variable.
 */
const enabledWithSecret = (flag: string | undefined, secret: string | undefined): boolean =>
  on(flag) && (secret ?? '') !== '';

/** Facebook lead-ads webhook (routes/v1/webhooks/ads.ts). */
export function metaLeadAdsWebhookEnabled(): boolean {
  return enabledWithSecret(
    process.env.ENABLE_META_LEAD_ADS_WEBHOOK,
    process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET,
  );
}

/** Instagram inbound webhook (routes/v1/webhooks/instagram.ts). */
export function instagramWebhookEnabled(): boolean {
  return enabledWithSecret(process.env.ENABLE_INSTAGRAM_WEBHOOK, process.env.META_APP_SECRET);
}

/** Messenger inbound webhook (routes/v1/webhooks/messenger.ts). */
export function messengerWebhookEnabled(): boolean {
  return enabledWithSecret(process.env.ENABLE_MESSENGER_WEBHOOK, process.env.META_APP_SECRET);
}

/** Generic Meta webhook (routes/v1/webhooks/meta.ts). */
export function metaWebhookEnabled(): boolean {
  return enabledWithSecret(process.env.ENABLE_META_WEBHOOK, process.env.META_APP_SECRET);
}

/** WhatsApp Business webhook (the one POST inside routes/v1/whatsapp.ts). */
export function whatsappWebhookEnabled(): boolean {
  return enabledWithSecret(
    process.env.ENABLE_WHATSAPP_WEBHOOK,
    process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET,
  );
}

/**
 * Telnyx call webhook (the telnyx branch of routes/v1/phone.ts).
 *
 * Its verifier checks that the signature headers exist and that the timestamp
 * is fresh, then returns without looking at them — `void rawBody` with a note
 * that full Ed25519 verification needs a dependency we have not added. It
 * accepts forged bodies with a key configured just as readily as without one,
 * so the flag is the only thing keeping it closed.
 */
export function telnyxWebhookEnabled(): boolean {
  return on(process.env.ENABLE_TELNYX_WEBHOOK);
}
