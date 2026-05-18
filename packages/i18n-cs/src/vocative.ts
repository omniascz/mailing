/**
 * Czech vocative (5th case) for first names (#358).
 *
 * Covers the bulk of common Czech male/female given names by applying a
 * rule-based transformation over the final letter(s). A small exception map
 * handles the well-known irregulars (Pavel → Pavle, not Pavele; etc.).
 *
 *   "Petr"    → "Petře"
 *   "Pavel"   → "Pavle"
 *   "Jana"    → "Jano"
 *   "Tomáš"   → "Tomáši"
 *   "Jiří"    → "Jiří"   (invariant)
 *
 * Nothing here depends on Czech-specific libraries; rules were compiled from
 * Hauer / Bejček + the public PDT-C tagset.
 *
 * Gender is inferred heuristically if not provided — pass it explicitly when
 * you have it (contact.gender on the record).
 */

export type Gender = 'male' | 'female' | 'unknown';

const EXCEPTIONS: Record<string, string> = {
  'Pavel': 'Pavle',
  'Karel': 'Karle',
  'Ježek': 'Ježku',
  'Otec': 'Otče',
  'Bůh': 'Bože',
  'Kristus': 'Kriste',
  'Bratr': 'Bratře',
  'Syn': 'Synu',
  'Chlap': 'Chlape',
  'Člověk': 'Člověče',
  'Pán': 'Pane',
  'Petr': 'Petře',
};

export function inferGender(name: string): Gender {
  const n = name.trim();
  if (!n) return 'unknown';
  const last = n.slice(-1).toLowerCase();
  // Female names tend to end in -a, -e (less common), -ie
  if (last === 'a') return 'female';
  if (n.toLowerCase().endsWith('ie')) return 'female';
  return 'male';
}

/** Returns the first name in Czech vocative (5th case). */
export function vocative(name: string, gender?: Gender): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  if (EXCEPTIONS[trimmed]) return EXCEPTIONS[trimmed]!;

  // Compound / multi-word: transform only the first token.
  if (trimmed.includes(' ')) {
    const [first, ...rest] = trimmed.split(' ');
    return [vocative(first!, gender), ...rest].join(' ');
  }

  const g = gender ?? inferGender(trimmed);
  return g === 'female' ? vocativeFemale(trimmed) : vocativeMale(trimmed);
}

function vocativeMale(name: string): string {
  const last = name.slice(-1);
  const lastLower = last.toLowerCase();
  const preLast = name.slice(-2, -1).toLowerCase();

  // -í (Jiří, Ondřej → Ondřeji handled below; Jiří is invariant)
  if (name.slice(-1) === 'í') return name;
  if (name.slice(-2).toLowerCase() === 'ii') return name;

  // -a (male e.g. Honza → Honzo? actually "Honzo" is correct)
  if (lastLower === 'a') return name.slice(0, -1) + 'o';

  // -e, -ě — often ends up as -e already (Ondřej → Ondřeji)
  if (lastLower === 'e' || lastLower === 'ě') return name + ''; // keep form
  if (lastLower === 'j') return name + 'i';                     // Ondřej → Ondřeji

  // -s (Tomáš), -š, -c, -č, -ř, -ž, -h, -ch, -k, -g — mostly "+i"
  if ('sšcčřžhkgx'.includes(lastLower)) {
    if (lastLower === 'k') {
      // Fugitive -e- in -ek ending: Marek → Marku, Jelínek → Jelínku, Ježek → Ježku.
      if (name.length >= 3 && name.slice(-2).toLowerCase() === 'ek') {
        return name.slice(0, -2) + 'ku';
      }
      return name.slice(0, -1) + 'ku';                          // Honzík → Honzíku, Dvořák → Dvořáku
    }
    if (lastLower === 'h') return name.slice(0, -1) + 'že';     // Bůh → Bože (exception covers specific)
    if (lastLower === 'g') return name.slice(0, -1) + 'že';     // rare
    if (lastLower === 'ch') return name + 'u';
    return name + 'i';
  }

  // -r (Petr, Alexandr) — r → ř + e
  if (lastLower === 'r') {
    if (preLast === 'e' || preLast === 'ě') return name.slice(0, -1) + 're'; // Petr → Petře (handled by exception); fallback
    return name.slice(0, -1) + 'ře';
  }

  // -l (Karel, Pavel) — usually exception table; fallback adds -e
  if (lastLower === 'l') return name.slice(0, -1) + 'le';

  // -n, -m, -d, -t, -v, -b, -p, -f — append -e
  if ('nmdtvbpfz'.includes(lastLower)) return name + 'e';

  // Default
  return name + 'e';
}

function vocativeFemale(name: string): string {
  const lastLower = name.slice(-1).toLowerCase();
  // -a  → -o  (Jana → Jano, Monika → Moniko)
  if (lastLower === 'a') return name.slice(0, -1) + 'o';
  // -e  → -e  (Alice → Alice)
  if (lastLower === 'e') return name;
  // -ie → -ie (Marie invariant)
  if (name.toLowerCase().endsWith('ie')) return name;
  // consonant-final female names are rare in CS — leave as-is
  return name;
}
