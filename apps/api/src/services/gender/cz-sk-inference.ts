/**
 * Czech/Slovak first-name → gender inference (#637).
 *
 * Strategy (in priority order):
 *  1. Lookup in curated name dictionaries (CZ + SK common names)
 *  2. Suffix rules (CZ/SK morphology)
 *  3. Unknown (caller should fall back to genderize.io for international names)
 */

export type Gender = 'male' | 'female' | 'unknown';

export interface GenderResult {
  gender: Gender;
  confidence: number; // 0.0 – 1.0
  source: 'dictionary' | 'suffix_rule' | 'unknown';
}

// ─── Curated name dictionaries ────────────────────────────────────────────────

const CZ_SK_MALE = new Set([
  // A–B
  'adam', 'aleš', 'alexandr', 'alexej', 'alfréd', 'alois', 'alojz', 'andrej', 'antonín', 'antonín',
  'bedřich', 'bohdan', 'bohumil', 'bohuslav', 'boris', 'bořivoj', 'bořek', 'branislav', 'břetislav',
  // C–D
  'ctibor', 'čestmír', 'dalibor', 'daniel', 'david', 'denis', 'dominik', 'dušan',
  // E–F
  'edgar', 'edvard', 'emil', 'ervín', 'evžen', 'ezekiel', 'ferdinand', 'filip', 'frantík', 'František',
  'franta', 'fredy',
  // G–H
  'gabriel', 'gašpar', 'gustáv', 'hynek', 'hugo',
  // I–J
  'igor', 'ivo', 'ivan', 'jakub', 'jan', 'janek', 'jaromír', 'jaroslav', 'jáchym', 'jiří', 'jirka',
  'jiřík', 'jonáš', 'jozef', 'josef', 'juraj', 'jurko',
  // K
  'kamil', 'karol', 'karel', 'kazimír', 'koloman', 'kryštof', 'krištofor', 'kvido',
  // L
  'ladislav', 'lada', 'leo', 'leonard', 'leopold', 'libor', 'lubomír', 'luboš', 'luděk', 'lukáš',
  'lumír', 'leoš',
  // M
  'marek', 'marian', 'martin', 'matyáš', 'michal', 'micha', 'milan', 'miloš', 'mirek', 'miroslav',
  'mojmír', 'mirko',
  // N–O
  'norbert', 'oldřich', 'ondřej', 'otakar', 'otto', 'ota',
  // P
  'patrik', 'pavel', 'petr', 'přemysl', 'prokop',
  // R
  'radek', 'radim', 'radoslav', 'radovan', 'rastislav', 'rastisláv', 'richard', 'robert', 'róbert',
  'roman', 'rostislav', 'rudolf', 'ruda',
  // S–Š
  'silvester', 'slavomír', 'stanislav', 'štefan', 'šimon', 'sebastián',
  // T
  'tibor', 'tomáš', 'tomík', 'tomas',
  // V
  'václav', 'viktor', 'vilém', 'vladimír', 'vlastimil', 'vojtěch', 'vojta', 'vlastislav',
  // Z–Ž
  'zbyněk', 'zdislav', 'zdeněk', 'zdenek', 'zsolt',
]);

const CZ_SK_FEMALE = new Set([
  // A
  'adéla', 'adriana', 'agáta', 'alena', 'alexandra', 'alice', 'alžběta', 'alžbeta', 'amálie',
  'anastázie', 'andrea', 'aneta', 'anežka', 'anežka', 'anna', 'anka',
  // B
  'barbora', 'blanka', 'blažena', 'božena', 'beáta', 'brigita',
  // C–D
  'dagmar', 'dana', 'darina', 'denisa', 'diana', 'dita', 'dominika', 'dorota',
  // E
  'edita', 'elena', 'eliška', 'elišká', 'emília', 'eva', 'evita',
  // G–H
  'gabriela', 'hana', 'helena', 'ilona', 'irena', 'iva', 'ivana', 'iveta',
  // J
  'jana', 'janka', 'jarmila', 'jitka', 'jiřina', 'josefína',
  // K
  'kateřina', 'katarína', 'katka', 'klára', 'kristýna', 'kristína',
  // L
  'lada', 'lenka', 'libuše', 'lidka', 'lucie', 'lucia', 'ludmila', 'ľudmila',
  // M
  'magdaléna', 'marcela', 'marie', 'mária', 'markéta', 'marta', 'martina', 'michaela', 'milada',
  'miroslava', 'monika',
  // N
  'natálie', 'natalia', 'nela', 'nikola',
  // O
  'olga', 'olinka',
  // P
  'patricia', 'pavla', 'petra',
  // R
  'radka', 'renata', 'renáta', 'romana', 'růžena',
  // S–Š
  'silvie', 'simona', 'soňa', 'světlana', 'šárka', 'štefánia',
  // T
  'táňa', 'tatiana', 'tereza', 'terézia',
  // V
  'václava', 'veronika', 'věra', 'viera', 'vlasta',
  // X–Z
  'xenie', 'yveta', 'žaneta', 'zdenka', 'zuzana', 'zdena',
]);

// ─── Suffix rules (Czech/Slovak morphology) ───────────────────────────────────

// Feminine suffixes (sorted longest-first to prefer more specific matches)
const FEMALE_SUFFIXES = [
  'ína', 'iona', 'anna', 'ella', 'etta', // international
  'ka', 'na', 'ra', 'la', 'ia', 'ea',   // CZ/SK common endings
  'a',                                    // catch-all for most CZ/SK female names
];

// Masculine suffixes (consonant endings predominant + common exceptions)
const MALE_SUFFIXES = [
  'oslav', 'slav', 'mír', 'mir', 'mil',  // Slavic compound names
  'ek', 'ík', 'áš', 'eš', 'ej',          // CZ diminutives
  'sk', 'št',                             // cluster endings
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
      return { gender: 'male', confidence: 0.80, source: 'suffix_rule' };
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

// Common first-name → vocative map (5th case, used in salutations)
const VOCATIVE_MAP: Record<string, string> = {
  // Male
  jan: 'Jane', jiří: 'Jiří', petr: 'Petře', pavel: 'Pavle', martin: 'Martine',
  tomáš: 'Tomáši', jakub: 'Jakube', michal: 'Michale', milan: 'Milane',
  david: 'Davide', josef: 'Josefe', lukáš: 'Lukáši', ondřej: 'Ondřeji',
  marek: 'Marku', filip: 'Filipe', jaroslav: 'Jaroslav', karel: 'Karle',
  zdeněk: 'Zdeňku', vladimír: 'Vladimíre', radek: 'Radku', stanislav: 'Stanislave',
  roman: 'Romane', miroslav: 'Miroslav', František: 'Františku', aleš: 'Aleši',
  libor: 'Libore', igor: 'Igore', patrik: 'Patriku', vojtěch: 'Vojtěchu',
  adam: 'Adame', dominik: 'Dominiku', matěj: 'Matěji', václav: 'Václave',
  oldřich: 'Oldřichu', ladislav: 'Ladislave', rostislav: 'Rostislave',
  jozef: 'Jozefe', juraj: 'Juraj', štefan: 'Štefane', tibor: 'Tibore',
  rastislav: 'Rastislave', mirko: 'Mirko', ivan: 'Ivane', richard: 'Richarde',
  daniel: 'Danieli', robert: 'Roberte', tomik: 'Tomíku', viktor: 'Viktore',
  // Female (vocative = nominative for most female names ending in -a → replace -a with -o)
  jana: 'Jano', petra: 'Petro', martina: 'Martino', tereza: 'Terezo',
  kateřina: 'Kateřino', michaela: 'Michaelo', monika: 'Moniko', eva: 'Evo',
  hana: 'Hano', lucie: 'Lucie', markéta: 'Markéto', alena: 'Aleno',
  barbora: 'Barbaro', dagmar: 'Dagmar', eliška: 'Eliško', lenka: 'Lenko',
  marie: 'Marie', simona: 'Simono', veronika: 'Veroniko', zuzana: 'Zuzano',
  anežka: 'Anežko', blanka: 'Blanko', dana: 'Dano', gabriela: 'Gabrielo',
  helena: 'Heleno', ilona: 'Ilono', jitka: 'Jitko', klára: 'Kláro',
  kristýna: 'Kristýno', magdaléna: 'Magdaléno', marcela: 'Marcelo',
  marta: 'Marto', milada: 'Milado', miroslava: 'Miroslavo', natálie: 'Natálie',
  nela: 'Nelo', olga: 'Olgo', pavla: 'Pavlo', radka: 'Radko', renata: 'Renato',
  romana: 'Romano', růžena: 'Růženo', silvie: 'Silvie', soňa: 'Soňo',
  světlana: 'Světlano', šárka: 'Šárko', tatiana: 'Tatiano', táňa: 'Táňo',
  věra: 'Věro', vlasta: 'Vlasto', žaneta: 'Žaneto', zdenka: 'Zdenko',
  // Slovak female vocative (same pattern)
  katarína: 'Katarína', mária: 'Mária', lucia: 'Lucia', ivana: 'Ivana',
  kristína: 'Kristína', ľudmila: 'Ľudmila', denisa: 'Denisa', viera: 'Viera',
};

/**
 * Return vocative form of a first name.
 * Falls back to a simple heuristic (strip trailing 'a' → 'o') for unknown names.
 */
export function getVocative(firstName: string): string {
  const normalized = firstName.trim().toLowerCase();
  if (VOCATIVE_MAP[normalized]) return VOCATIVE_MAP[normalized]!;

  // Rule-based fallback
  if (normalized.endsWith('a') && normalized.length > 2) {
    return firstName.slice(0, -1) + 'o';
  }
  if (normalized.endsWith('ek')) return firstName.slice(0, -2) + 'ku';
  if (normalized.endsWith('ík')) return firstName.slice(0, -2) + 'íku';
  if (normalized.endsWith('áš')) return firstName + 'i';
  if (normalized.endsWith('eš')) return firstName + 'i';

  return firstName; // fallback: nominative = vocative
}

/**
 * Build a formal Czech salutation string.
 *
 * Examples:
 *   buildSalutation('male',   'Jan',   'Novák') → 'Vážený pane Nováku,'
 *   buildSalutation('female', 'Jana',  'Nová')  → 'Vážená paní Nová,'
 *   buildSalutation('male',   'Jan',   null)    → 'Vážený pane,'
 *   buildSalutation('unknown', 'Jan',  null)    → 'Dobrý den,'
 */
export function buildSalutation(
  gender: Gender,
  firstName?: string | null,
  _lastName?: string | null,
  style: 'formal' | 'informal' = 'formal',
): string {
  if (style === 'informal') {
    if (firstName) {
      return `Dobrý den, ${getVocative(firstName)},`;
    }
    return 'Dobrý den,';
  }

  // Formal style
  if (gender === 'male') {
    return `Vážený pane,`;
  }
  if (gender === 'female') {
    return `Vážená paní,`;
  }
  if (firstName) {
    return `Dobrý den, ${getVocative(firstName)},`;
  }
  return 'Dobrý den,';
}
