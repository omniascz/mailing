/**
 * Signup-form bot protection — captcha verification + honeypot.
 *
 * Supports Cloudflare Turnstile, Google reCAPTCHA (v2/v3), and hCaptcha, which
 * all share the same `siteverify` POST shape (`secret` + `response`). The pure
 * helpers (`isHoneypotTripped`, `evaluateCaptchaResponse`) are unit-tested; the
 * network call lives in `verifyCaptcha`.
 */

export type CaptchaProvider = 'turnstile' | 'recaptcha' | 'hcaptcha';

const VERIFY_URLS: Record<CaptchaProvider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://hcaptcha.com/siteverify',
};

export interface CaptchaResult {
  success: boolean;
  score?: number;
  reason?: string;
}

/** A honeypot field that arrives non-empty means an automated submission. */
export function isHoneypotTripped(
  data: Record<string, string>,
  field?: string,
): boolean {
  if (!field) return false;
  const v = data[field];
  return typeof v === 'string' && v.trim().length > 0;
}

/** Pure evaluation of a provider siteverify response (+ optional v3 score gate). */
export function evaluateCaptchaResponse(
  raw: { success?: boolean; score?: number } | null | undefined,
  minScore?: number,
): CaptchaResult {
  if (!raw || raw.success !== true) return { success: false, reason: 'verification failed' };
  const score = typeof raw.score === 'number' ? raw.score : undefined;
  if (minScore !== undefined && score !== undefined && score < minScore) {
    return { success: false, score, reason: 'score below threshold' };
  }
  return { success: true, score };
}

/** Verify a captcha token against the provider. Network failures fail closed. */
export async function verifyCaptcha(opts: {
  provider: CaptchaProvider;
  secret: string;
  token: string | undefined;
  remoteIp?: string;
  minScore?: number;
}): Promise<CaptchaResult> {
  if (!opts.token) return { success: false, reason: 'missing token' };
  const body = new URLSearchParams({ secret: opts.secret, response: opts.token });
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp);
  try {
    const res = await fetch(VERIFY_URLS[opts.provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { success?: boolean; score?: number };
    return evaluateCaptchaResponse(json, opts.minScore);
  } catch {
    return { success: false, reason: 'verify request failed' };
  }
}
