/**
 * Password strength check via zxcvbn. Lazy-loaded — the language packs
 * are ~1.5 MB and we don't want to pay that on every cold-start of a
 * worker process that doesn't auth.
 */
import { zxcvbn, zxcvbnOptions, type ZxcvbnResult } from '@zxcvbn-ts/core';

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  const [common, en] = await Promise.all([
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]);
  zxcvbnOptions.setOptions({
    translations: en.translations,
    dictionary: { ...common.dictionary, ...en.dictionary },
    graphs: common.adjacencyGraphs,
  });
  initialized = true;
}

export interface PasswordStrength {
  /** zxcvbn score 0–4. 0 = trivial, 4 = strong. */
  score: number;
  /** True if score >= MIN_SCORE; safe to use for register/reset. */
  acceptable: boolean;
  /** User-facing message — exact reason it's weak, or empty if strong. */
  feedback: string;
}

/** Minimum acceptable score. 3 is "strong enough to resist throttled offline attack". */
const MIN_SCORE = 3;

/**
 * Evaluate password strength. Takes optional user inputs (email,
 * name, etc.) so zxcvbn down-weights matches against them (e.g.
 * `john1234` if name is John).
 */
export async function evaluatePasswordStrength(
  password: string,
  userInputs: string[] = [],
): Promise<PasswordStrength> {
  await ensureInit();
  const result: ZxcvbnResult = zxcvbn(password, userInputs.filter(Boolean));
  const acceptable = result.score >= MIN_SCORE;
  const feedback = acceptable
    ? ''
    : result.feedback.warning ||
      result.feedback.suggestions[0] ||
      'Password is too weak. Try a longer phrase with mixed characters.';
  return { score: result.score, acceptable, feedback };
}
