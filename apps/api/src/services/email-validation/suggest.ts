/**
 * "Did you mean?" email-typo suggestion (Mailgun/SendGrid parity).
 *
 * Pure + dependency-free. Compares the domain (and its TLD) against a list of
 * popular providers using bounded Levenshtein distance and returns a corrected
 * address when a near-miss is found (e.g. `gmial.com` → `gmail.com`,
 * `user@seznam.c` → `user@seznam.cz`). Returns null when the domain already
 * looks fine or nothing close matches.
 */

// Popular mailbox providers (global + CZ/SK launch market).
const POPULAR_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'zoho.com',
  'seznam.cz',
  'email.cz',
  'centrum.cz',
  'centrum.sk',
  'post.cz',
  'atlas.cz',
  'volny.cz',
  'azet.sk',
  'zoznam.sk',
];

// Common valid TLDs — used to repair a mistyped TLD without touching the SLD.
const POPULAR_TLDS = ['com', 'net', 'org', 'edu', 'gov', 'co', 'io', 'cz', 'sk', 'de', 'eu', 'uk'];

/** Classic iterative Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j]! + 1, prev[j + 1]! + 1, prev[j]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

function closest(candidate: string, pool: string[], maxDistance: number): string | null {
  let best: string | null = null;
  let bestDist = maxDistance + 1;
  for (const p of pool) {
    if (p === candidate) return null; // exact match → nothing to suggest
    const d = levenshtein(candidate, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return bestDist <= maxDistance ? best : null;
}

/**
 * Suggest a corrected email, or null if the address looks fine / no close
 * match exists. Never changes the local part.
 */
export function suggestEmailCorrection(email: string): string | null {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes('.')) return null;

  // Already a known-good domain → no suggestion.
  if (POPULAR_DOMAINS.includes(domain)) return null;

  // 1. Whole-domain near-miss (covers SLD typos like gmial.com — a single
  //    transposition counts as distance 2). Distance scales with length so
  //    very short domains don't over-match.
  const maxDomainDist = domain.length >= 8 ? 2 : 1;
  const domainFix = closest(domain, POPULAR_DOMAINS, maxDomainDist);
  if (domainFix) return `${local}@${domainFix}`;

  // 2. TLD-only repair — keep the SLD, fix a mistyped TLD (seznam.c → seznam.cz,
  //    firma.con → firma.com).
  const lastDot = domain.lastIndexOf('.');
  const sld = domain.slice(0, lastDot);
  const tld = domain.slice(lastDot + 1);
  if (!POPULAR_TLDS.includes(tld)) {
    const tldFix = closest(tld, POPULAR_TLDS, 1);
    if (tldFix) return `${local}@${sld}.${tldFix}`;
  }

  return null;
}
