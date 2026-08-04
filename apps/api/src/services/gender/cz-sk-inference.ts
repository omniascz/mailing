/**
 * Czech/Slovak first-name → gender inference (#637).
 *
 * Strategy (in priority order):
 *  1. Lookup in curated name dictionaries (CZ + SK common names)
 *  2. Suffix rules (CZ/SK morphology)
 *  3. Unknown (caller should fall back to genderize.io for international names)
 */

import { vocative } from '@forgemsg/i18n-cs/vocative';

export type Gender = 'male' | 'female' | 'unknown';

export interface GenderResult {
  gender: Gender;
  confidence: number; // 0.0 – 1.0
  source: 'dictionary' | 'suffix_rule' | 'unknown';
}

// ─── Curated name dictionaries ────────────────────────────────────────────────

const CZ_SK_MALE = new Set([
  // A–B
  'adam',
  'aleš',
  'alexandr',
  'alexej',
  'alfréd',
  'alois',
  'alojz',
  'andrej',
  'antonín',
  'antonín',
  'bedřich',
  'bohdan',
  'bohumil',
  'bohuslav',
  'boris',
  'bořivoj',
  'bořek',
  'branislav',
  'břetislav',
  // C–D
  'ctibor',
  'čestmír',
  'dalibor',
  'daniel',
  'david',
  'denis',
  'dominik',
  'dušan',
  // E–F
  'edgar',
  'edvard',
  'emil',
  'ervín',
  'evžen',
  'ezekiel',
  'ferdinand',
  'filip',
  'frantík',
  'František',
  'franta',
  'fredy',
  // G–H
  'gabriel',
  'gašpar',
  'gustáv',
  'hynek',
  'hugo',
  // I–J
  'igor',
  'ivo',
  'ivan',
  'jakub',
  'jan',
  'janek',
  'jaromír',
  'jaroslav',
  'jáchym',
  'jiří',
  'jirka',
  'jiřík',
  'jonáš',
  'jozef',
  'josef',
  'juraj',
  'jurko',
  // K
  'kamil',
  'karol',
  'karel',
  'kazimír',
  'koloman',
  'kryštof',
  'krištofor',
  'kvido',
  // L
  'ladislav',
  'lada',
  'leo',
  'leonard',
  'leopold',
  'libor',
  'lubomír',
  'luboš',
  'luděk',
  'lukáš',
  'lumír',
  'leoš',
  // M
  'marek',
  'marian',
  'martin',
  'matyáš',
  'michal',
  'micha',
  'milan',
  'miloš',
  'mirek',
  'miroslav',
  'mojmír',
  'mirko',
  // N–O
  'norbert',
  'oldřich',
  'ondřej',
  'otakar',
  'otto',
  'ota',
  // P
  'patrik',
  'pavel',
  'petr',
  'přemysl',
  'prokop',
  // R
  'radek',
  'radim',
  'radoslav',
  'radovan',
  'rastislav',
  'rastisláv',
  'richard',
  'robert',
  'róbert',
  'roman',
  'rostislav',
  'rudolf',
  'ruda',
  // S–Š
  'silvester',
  'slavomír',
  'stanislav',
  'štefan',
  'šimon',
  'sebastián',
  // T
  'tibor',
  'tomáš',
  'tomík',
  'tomas',
  // V
  'václav',
  'viktor',
  'vilém',
  'vladimír',
  'vlastimil',
  'vojtěch',
  'vojta',
  'vlastislav',
  // Z–Ž
  'zbyněk',
  'zdislav',
  'zdeněk',
  'zdenek',
  'zsolt',
]);

const CZ_SK_FEMALE = new Set([
  // A
  'adéla',
  'adriana',
  'agáta',
  'alena',
  'alexandra',
  'alice',
  'alžběta',
  'alžbeta',
  'amálie',
  'anastázie',
  'andrea',
  'aneta',
  'anežka',
  'anežka',
  'anna',
  'anka',
  // B
  'barbora',
  'blanka',
  'blažena',
  'božena',
  'beáta',
  'brigita',
  // C–D
  'dagmar',
  'dana',
  'darina',
  'denisa',
  'diana',
  'dita',
  'dominika',
  'dorota',
  // E
  'edita',
  'elena',
  'eliška',
  'elišká',
  'emília',
  'eva',
  'evita',
  // G–H
  'gabriela',
  'hana',
  'helena',
  'ilona',
  'irena',
  'iva',
  'ivana',
  'iveta',
  // J
  'jana',
  'janka',
  'jarmila',
  'jitka',
  'jiřina',
  'josefína',
  // K
  'kateřina',
  'katarína',
  'katka',
  'klára',
  'kristýna',
  'kristína',
  // L
  'lada',
  'lenka',
  'libuše',
  'lidka',
  'lucie',
  'lucia',
  'ludmila',
  'ľudmila',
  // M
  'magdaléna',
  'marcela',
  'marie',
  'mária',
  'markéta',
  'marta',
  'martina',
  'michaela',
  'milada',
  'miroslava',
  'monika',
  // N
  'natálie',
  'natalia',
  'nela',
  'nikola',
  // O
  'olga',
  'olinka',
  // P
  'patricia',
  'pavla',
  'petra',
  // R
  'radka',
  'renata',
  'renáta',
  'romana',
  'růžena',
  // S–Š
  'silvie',
  'simona',
  'soňa',
  'světlana',
  'šárka',
  'štefánia',
  // T
  'táňa',
  'tatiana',
  'tereza',
  'terézia',
  // V
  'václava',
  'veronika',
  'věra',
  'viera',
  'vlasta',
  // X–Z
  'xenie',
  'yveta',
  'žaneta',
  'zdenka',
  'zuzana',
  'zdena',
]);

// ─── Suffix rules (Czech/Slovak morphology) ───────────────────────────────────

// Feminine suffixes (sorted longest-first to prefer more specific matches)
const FEMALE_SUFFIXES = [
  'ína',
  'iona',
  'anna',
  'ella',
  'etta', // international
  'ka',
  'na',
  'ra',
  'la',
  'ia',
  'ea', // CZ/SK common endings
  'a', // catch-all for most CZ/SK female names
];

// Masculine suffixes (consonant endings predominant + common exceptions)
const MALE_SUFFIXES = [
  'oslav',
  'slav',
  'mír',
  'mir',
  'mil', // Slavic compound names
  'ek',
  'ík',
  'áš',
  'eš',
  'ej', // CZ diminutives
  'sk',
  'št', // cluster endings
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Infer gender from a Czech/Slovak first name.
 * Returns 'unknown' when confidence is low — caller should fall back to genderize.io.
 */
export function inferGender(firstName: string): GenderResult {
  if (!firstName?.trim()) return { gender: 'unknown', confidence: 0, source: 'unknown' };

  const normalized = firstName.trim().toLowerCase();

  // Dictionary lookup (highest confidence)
  if (CZ_SK_MALE.has(normalized)) {
    return { gender: 'male', confidence: 0.99, source: 'dictionary' };
  }
  if (CZ_SK_FEMALE.has(normalized)) {
    return { gender: 'female', confidence: 0.99, source: 'dictionary' };
  }

  // Suffix rules (medium confidence)
  for (const suffix of MALE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return { gender: 'male', confidence: 0.8, source: 'suffix_rule' };
    }
  }
  for (const suffix of FEMALE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      // Names ending in '-a' are ~90% female in CZ/SK but not 100%
      const conf = suffix === 'a' ? 0.88 : 0.92;
      return { gender: 'female', confidence: conf, source: 'suffix_rule' };
    }
  }

  return { gender: 'unknown', confidence: 0, source: 'unknown' };
}

// ─── Czech/Slovak vocative forms ──────────────────────────────────────────────

/**
 * Vocative form of a name.
 *
 * Delegates to @forgemsg/i18n-cs, which is the single source of truth. This
 * used to be a third independent implementation (a lookup map plus four suffix
 * rules) sitting alongside the two in that package — so the same name could
 * come out differently depending on which code path reached it.
 */
export function getVocative(firstName: string): string {
  return vocative(firstName);
}

/**
 * Build a formal Czech salutation.
 *
 * The formal form addresses by SURNAME, in the vocative: "Vážený pane Nováku".
 * Czech formality attaches to the surname — "Vážený pane Petře" is not more
 * polite than "Vážený pane Petr", it is simply wrong, and given-name address
 * reads as familiar. The previous implementation documented the surname form
 * in its examples and then dropped the argument on the floor, returning a bare
 * "Vážený pane,". This makes the behaviour match the promise.
 *
 * Examples:
 *   buildSalutation('male',   'Jan',  'Novák')    → 'Vážený pane Nováku,'
 *   buildSalutation('female', 'Jana', 'Nováková') → 'Vážená paní Nováková,'
 *   buildSalutation('male',   'Jan',  null)       → 'Vážený pane,'
 *   buildSalutation('unknown','Jan',  null)       → 'Dobrý den, Jane,'
 */
export function buildSalutation(
  gender: Gender,
  firstName?: string | null,
  lastName?: string | null,
  style: 'formal' | 'informal' = 'formal',
): string {
  // Informal always uses the given name.
  if (style === 'informal') {
    return firstName ? `Dobrý den, ${getVocative(firstName)},` : 'Dobrý den,';
  }

  if (gender === 'male' || gender === 'female') {
    const title = gender === 'male' ? 'Vážený pane' : 'Vážená paní';
    return lastName ? `${title} ${getVocative(lastName)},` : `${title},`;
  }

  // Unknown gender: no gendered title exists, so fall back to the neutral
  // greeting with the given name rather than guessing.
  return firstName ? `Dobrý den, ${getVocative(firstName)},` : 'Dobrý den,';
}
