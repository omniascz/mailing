/**
 * VERP (Variable Envelope Return Path) encode/decode.
 *
 * On send, the envelope MAIL FROM is set to a per-message return path that
 * encodes the Message-ID:  bounce+<msgid-with-@-as-=>@<bounce-domain>
 * When an out-of-band DSN arrives, its recipient IS that return path, so the
 * originating Message-ID can be recovered even when the DSN body omits a clear
 * Final-Recipient. This is the receive side that makes VERP actually useful.
 */

/**
 * Encode a Message-ID into a VERP return-path local part + address.
 * `<abc@forgemsg.com>` → `bounce+abc=forgemsg.com@<domain>`.
 */
export function encodeVerp(messageId: string, bounceDomain: string): string {
  const local = messageId.replace(/[<>]/g, '').replace(/@/g, '=');
  return `bounce+${local}@${bounceDomain}`;
}

/**
 * Decode a VERP return-path address back to the original Message-ID (with the
 * angle brackets restored). Returns null when the address is not a VERP path.
 * The bounce domain is not validated — any `bounce+…@host` shape is accepted.
 */
export function decodeVerp(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim().replace(/^<|>$/g, '');
  // Local part after "bounce+", up to the final @host.
  const m = trimmed.match(/^bounce\+(.+)@[^@]+$/i);
  if (!m || !m[1]) return null;
  const decoded = m[1].replace(/=/g, '@');
  // A valid Message-ID must contain exactly one '@'.
  if ((decoded.match(/@/g) ?? []).length !== 1) return null;
  return `<${decoded}>`;
}
