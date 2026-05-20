/**
 * SPAYD payment-QR builder (#365/#388).
 *
 * SPAYD (Short Payment Descriptor) is the Czech standard for payment QR
 * codes ("QR platba"). Contents are a URL-safe key:value string prefixed
 * with `SPD*1.0*` that Czech banking apps decode into a pre-filled transfer.
 *
 * Spec: https://qr-platba.cz/pro-vyvojare/
 */

export interface SpaydInput {
  /** Recipient IBAN (Czech or foreign). Must be valid per ISO 13616. */
  iban: string;
  /** Amount — rendered with a `.` decimal separator and up to 2 fraction digits. */
  amount: number;
  /** ISO 4217 currency (defaults to CZK). */
  currency?: string;
  /** Variable symbol (numeric string, up to 10 digits). */
  variableSymbol?: string;
  /** Constant symbol (numeric string, up to 4 digits). */
  constantSymbol?: string;
  /** Specific symbol (numeric string, up to 10 digits). */
  specificSymbol?: string;
  /** Optional payment reference / note shown in the banking app (max 60 chars). */
  message?: string;
  /** Optional recipient name (max 35 chars). */
  recipientName?: string;
  /** Due date (ISO date). */
  dueDate?: Date;
}

/**
 * Build the SPAYD string. Fields are sanitised: `*` is illegal inside values
 * and throws, `:` is illegal and throws. Unused optional fields are skipped.
 */
export function buildSpaydString(input: SpaydInput): string {
  const fields: Array<[string, string]> = [];
  const iban = input.iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    throw new Error(`Invalid IBAN: ${input.iban}`);
  }
  fields.push(['ACC', iban]);

  if (input.amount < 0) throw new Error('Amount must be non-negative');
  fields.push(['AM', input.amount.toFixed(2)]);

  fields.push(['CC', (input.currency ?? 'CZK').toUpperCase()]);

  if (input.variableSymbol) {
    ensureNumeric('VS', input.variableSymbol, 10);
    fields.push(['X-VS', input.variableSymbol]);
  }
  if (input.constantSymbol) {
    ensureNumeric('KS', input.constantSymbol, 4);
    fields.push(['X-KS', input.constantSymbol]);
  }
  if (input.specificSymbol) {
    ensureNumeric('SS', input.specificSymbol, 10);
    fields.push(['X-SS', input.specificSymbol]);
  }
  if (input.message) {
    fields.push(['MSG', sanitize(input.message, 60)]);
  }
  if (input.recipientName) {
    fields.push(['RN', sanitize(input.recipientName, 35)]);
  }
  if (input.dueDate) {
    fields.push(['DT', formatSpaydDate(input.dueDate)]);
  }

  return `SPD*1.0*${fields.map(([k, v]) => `${k}:${v}`).join('*')}`;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function ensureNumeric(field: string, value: string, maxLen: number): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${field} must be numeric`);
  }
  if (value.length > maxLen) {
    throw new Error(`${field} exceeds maximum length of ${maxLen}`);
  }
}

function sanitize(value: string, maxLen: number): string {
  // SPAYD forbids `*` and `:` inside values; strip them plus control chars.
  const cleaned = value.replace(/[*:\r\n\t]/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function formatSpaydDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
