/**
 * Slovak name handling for merge-tags (#359).
 *
 * Only the vocative, mirroring the Czech package. The other five cases were
 * the same best-effort surface rules and were removed for the same measured
 * reason — nothing in this repository called them.
 *
 * Modern Slovak has no productive vocative: the form merged into the
 * nominative centuries ago and survives only in a handful of petrified words
 * ("Bože", "synu", "priateľu"). So for names this is identity, which is the
 * grammatically correct answer, not a fallback.
 */

export type Gender = 'male' | 'female' | 'unknown';

/** Deliberately a single member — see the Czech package for the reasoning. */
export type SlovakCase = 'vocative';

const VOCATIVE_EXCEPTIONS: Record<string, string> = {
  priateľ: 'priateľu',
  otec: 'otče',
  boh: 'bože',
  chlap: 'chlape',
  syn: 'synu',
};

/**
 * Kept because the Czech side infers gender and the two packages are consumed
 * through the same filter registry. Slovak vocative does not branch on it.
 */
export function inferGender(name: string): Gender {
  const n = name.trim();
  if (!n) return 'unknown';
  const last = n.slice(-1).toLowerCase();
  if (last === 'a' || last === 'á') return 'female';
  if (n.toLowerCase().endsWith('ia')) return 'female';
  return 'male';
}

export function declineName(name: string, cs: SlovakCase, _gender?: Gender): string {
  void cs;
  if (typeof name !== 'string') return name;
  const trimmed = name.trim();
  if (!trimmed) return name;

  if (trimmed.includes(' ')) {
    const [first, ...rest] = trimmed.split(' ');
    return [declineName(first!, cs), ...rest].join(' ');
  }

  return VOCATIVE_EXCEPTIONS[trimmed.toLowerCase()] ?? trimmed;
}
