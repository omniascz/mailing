/**
 * Bounce processor — classifies SMTP bounces and NDR messages.
 *
 * Classification:
 *   hard  — permanent failure (5xx, user unknown, domain not found)
 *           → auto-add to suppression list, mark contact as bounced
 *   soft  — transient failure (4xx, mailbox full, greylisted)
 *           → schedule retry (handled by retry-manager), suppress after 3 soft bounces
 *   block — policy rejection (sender blocked, RBL listing, spam content)
 *           → log + alert, do NOT auto-suppress (domain issue, not contact issue)
 *
 * Each classification maps to a suppressionReason when auto-suppression occurs.
 */

export type BounceType = 'hard' | 'soft' | 'block' | 'unknown';

export interface BounceClassification {
  type: BounceType;
  smtpCode: number | null;
  /** Human-readable reason extracted from the NDR */
  reason: string;
  /** True if this bounce should trigger immediate suppression */
  autoSuppress: boolean;
  /** True if an admin alert should be sent (block bounces) */
  alert: boolean;
}

// ─── SMTP code ranges ─────────────────────────────────────────────────────────
// RFC 5321: 5xx = permanent failure, 4xx = transient failure

const HARD_CODES = new Set([550, 551, 552, 553, 554, 555, 556]);
const SOFT_CODES = new Set([421, 450, 451, 452, 455]);

// ─── Keyword patterns ─────────────────────────────────────────────────────────

const HARD_PATTERNS: RegExp[] = [
  /user\s+(unknown|not\s+found|does\s+not\s+exist|invalid)/i,
  /no\s+such\s+(user|address|mailbox)/i,
  /address\s+(rejected|not\s+found|unknown)/i,
  /mailbox\s+(not\s+found|doesn['']t\s+exist|does\s+not\s+exist|unavailable)/i,
  /account\s+(not\s+exist|disabled|suspended|terminated|closed)/i,
  /domain\s+(not\s+found|does\s+not\s+exist|invalid)/i,
  /recipient\s+(rejected|unknown|invalid)/i,
  /permanent\s+(failure|error)/i,
  /550\s+5\.1\.[0-9]/i,
  /5\.1\.1/i, // bad destination mailbox address
  /5\.1\.2/i, // bad destination mailbox address policy
  /5\.2\.1/i, // mailbox disabled
];

const BLOCK_PATTERNS: RegExp[] = [
  /blocked\s+(by|for)/i,
  /blacklist(ed)?/i,
  /rbl/i,
  /spam\s+(detected|policy|filter|rejected)/i,
  /policy\s+(violation|rejection|reason)/i,
  /abuse\s+detected/i,
  /5\.7\.[0-9]/i, // policy rejection
  /banned\s+sending/i,
  /ip\s+(reputation|blocked|blacklisted)/i,
  /dkim\s+(fail|invalid)/i,
  /spf\s+(fail|softfail)/i,
  /dmarc\s+(fail|violation)/i,
];

const SOFT_PATTERNS: RegExp[] = [
  /mailbox\s+(full|over\s+quota|storage|quota\s+exceeded)/i,
  /try\s+again\s+later/i,
  /temporarily\s+(unavailable|rejected|deferred)/i,
  /greylisted?/i,
  /too\s+many\s+(connections|messages|requests)/i,
  /rate\s+limit/i,
  /service\s+(unavailable|temporarily)/i,
  /4\.[0-9]\.[0-9]/i, // generic 4xx enhanced status
];

// ─── NDR line extraction ──────────────────────────────────────────────────────

/**
 * Extract the most relevant diagnostic line from an NDR / DSN message body.
 * Looks for X-Original-To, Final-Recipient, Diagnostic-Code, Status fields.
 */
export function extractNdrReason(ndrBody: string): string {
  const lines = ndrBody.split(/\r?\n/);

  const diagnosticLine = lines.find((l) => /^Diagnostic-Code:/i.test(l));
  if (diagnosticLine) {
    return diagnosticLine.replace(/^Diagnostic-Code:\s*/i, '').slice(0, 500);
  }

  const statusLine = lines.find((l) => /^Status:/i.test(l));
  if (statusLine) {
    return statusLine.replace(/^Status:\s*/i, '').slice(0, 200);
  }

  // Fallback: first non-empty line
  return lines.find((l) => l.trim().length > 10)?.slice(0, 500) ?? 'Unknown bounce reason';
}

/**
 * Extract an SMTP numeric code from a bounce reason string.
 * Matches patterns like "550", "5.2.1", "smtp; 452"
 */
export function extractSmtpCode(reason: string): number | null {
  const match = reason.match(/\b([45]\d\d)\b/);
  if (match && match[1]) return parseInt(match[1], 10);
  const enhancedMatch = reason.match(/\b([45])\.\d\.\d/);
  if (enhancedMatch && enhancedMatch[1]) {
    return parseInt(enhancedMatch[1], 10) === 5 ? 550 : 450;
  }
  return null;
}

// ─── Classification logic ─────────────────────────────────────────────────────

/**
 * Classify a bounce based on SMTP diagnostic code and reason string.
 *
 * @param smtpCodeOrReason  The numeric SMTP response code, enhanced status (e.g. "5.1.1"),
 *                          or free-text NDR reason extracted from the bounce message.
 * @param rawNdr            Optional: full NDR message body for richer analysis.
 */
export function classifyBounce(
  smtpCodeOrReason: string | number,
  rawNdr?: string,
): BounceClassification {
  const reasonStr =
    typeof smtpCodeOrReason === 'number' ? String(smtpCodeOrReason) : smtpCodeOrReason;

  const ndrText = rawNdr ? extractNdrReason(rawNdr) : reasonStr;
  const combined = `${reasonStr} ${ndrText}`;

  // Extract numeric code if present
  const code = typeof smtpCodeOrReason === 'number' ? smtpCodeOrReason : extractSmtpCode(combined);

  // 1. Block patterns take priority — they are always 5xx but reason is policy
  if (BLOCK_PATTERNS.some((p) => p.test(combined))) {
    return {
      type: 'block',
      smtpCode: code,
      reason: ndrText,
      autoSuppress: false,
      alert: true,
    };
  }

  // 2. Hard: explicit 5xx codes OR hard keyword patterns
  if ((code !== null && HARD_CODES.has(code)) || HARD_PATTERNS.some((p) => p.test(combined))) {
    return {
      type: 'hard',
      smtpCode: code,
      reason: ndrText,
      autoSuppress: true,
      alert: false,
    };
  }

  // 3. Soft: 4xx codes OR soft keyword patterns
  if ((code !== null && SOFT_CODES.has(code)) || SOFT_PATTERNS.some((p) => p.test(combined))) {
    return {
      type: 'soft',
      smtpCode: code,
      reason: ndrText,
      autoSuppress: false,
      alert: false,
    };
  }

  // 4. Fall back to code ranges if available
  if (code !== null) {
    if (code >= 500 && code < 600) {
      return {
        type: 'hard',
        smtpCode: code,
        reason: ndrText,
        autoSuppress: true,
        alert: false,
      };
    }
    if (code >= 400 && code < 500) {
      return {
        type: 'soft',
        smtpCode: code,
        reason: ndrText,
        autoSuppress: false,
        alert: false,
      };
    }
  }

  return {
    type: 'unknown',
    smtpCode: code,
    reason: ndrText,
    autoSuppress: false,
    alert: false,
  };
}

// ─── Aggregate bounce tracking ────────────────────────────────────────────────

/**
 * Determine whether accumulated soft bounces warrant suppression.
 * Policy: suppress after 3 soft bounces within 30 days.
 */
/**
 * Heuristic: is this inbound email an async bounce / DSN (delivery status
 * notification) rather than a real reply? Detected by sender (mailer-daemon /
 * postmaster) or subject wording.
 */
export function isBounceMessage(from: string, subject?: string): boolean {
  const f = (from ?? '').toLowerCase();
  if (/mailer-daemon|postmaster/.test(f)) return true;
  const s = (subject ?? '').toLowerCase();
  return /(delivery status notification|undeliverable|returned mail|mail delivery (failed|subsystem)|delivery has failed|failure notice|delivery incomplete)/.test(
    s,
  );
}

/**
 * Extract the failed recipient address from a DSN body. Prefers the RFC 3464
 * Final-Recipient / Original-Recipient field; falls back to a "failed: addr"
 * pattern. Returns null when no address is found.
 */
export function extractFailedRecipient(body: string): string | null {
  const m = body.match(
    /(?:Final-Recipient|Original-Recipient):\s*(?:rfc822;)?\s*<?([^\s<>]+@[^\s<>]+)>?/i,
  );
  if (m && m[1]) return m[1].toLowerCase();
  const m2 = body.match(/failed[^\n]*?<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  return m2 && m2[1] ? m2[1].toLowerCase() : null;
}

export function shouldSuppressAfterSoftBounces(softBounceCount: number, threshold = 3): boolean {
  return softBounceCount >= threshold;
}
