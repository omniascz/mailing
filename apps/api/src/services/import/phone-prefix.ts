/**
 * CZ/SK phone prefix parser used by the import pipeline and contact creation.
 * Offline lookup over a baked-in prefix table — no external HLR calls.
 * Covers all CZ mobile operators (O2 601-608 + 702-705, T-Mobile 720-739,
 * Vodafone 770-779 + 790-799), CZ landline regions (all kraj prefixes incl.
 * Středočeský 311-318 and Vysočina/Jihomoravský 56), and SK mobile operators.
 */

export interface PrefixParseResult {
  country: string | null;
  countryCode: string | null;
  type: 'mobile' | 'landline' | 'voip' | 'unknown' | null;
  operator: string | null;
  region: string | null;
  district: string | null;
  normalized: string;
  isValid: boolean;
}

function normalize(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  return cleaned;
}

const CZ_MOBILE_OPERATORS: Array<{ prefix: string; operator: string }> = [
  { prefix: '601', operator: 'O2' },
  { prefix: '602', operator: 'O2' },
  { prefix: '603', operator: 'O2' },
  { prefix: '604', operator: 'O2' },
  { prefix: '605', operator: 'O2' },
  { prefix: '606', operator: 'O2' },
  { prefix: '607', operator: 'O2' },
  { prefix: '608', operator: 'O2' },
  { prefix: '702', operator: 'O2' },
  { prefix: '703', operator: 'O2' },
  { prefix: '704', operator: 'O2' },
  { prefix: '705', operator: 'O2' },
  { prefix: '720', operator: 'T-Mobile' },
  { prefix: '721', operator: 'T-Mobile' },
  { prefix: '722', operator: 'T-Mobile' },
  { prefix: '723', operator: 'T-Mobile' },
  { prefix: '724', operator: 'T-Mobile' },
  { prefix: '725', operator: 'T-Mobile' },
  { prefix: '726', operator: 'T-Mobile' },
  { prefix: '727', operator: 'T-Mobile' },
  { prefix: '728', operator: 'T-Mobile' },
  { prefix: '729', operator: 'T-Mobile' },
  { prefix: '730', operator: 'T-Mobile' },
  { prefix: '731', operator: 'T-Mobile' },
  { prefix: '732', operator: 'T-Mobile' },
  { prefix: '733', operator: 'T-Mobile' },
  { prefix: '734', operator: 'T-Mobile' },
  { prefix: '735', operator: 'T-Mobile' },
  { prefix: '736', operator: 'T-Mobile' },
  { prefix: '737', operator: 'T-Mobile' },
  { prefix: '738', operator: 'T-Mobile' },
  { prefix: '739', operator: 'T-Mobile' },
  { prefix: '770', operator: 'Vodafone' },
  { prefix: '771', operator: 'Vodafone' },
  { prefix: '772', operator: 'Vodafone' },
  { prefix: '773', operator: 'Vodafone' },
  { prefix: '774', operator: 'Vodafone' },
  { prefix: '775', operator: 'Vodafone' },
  { prefix: '776', operator: 'Vodafone' },
  { prefix: '777', operator: 'Vodafone' },
  { prefix: '778', operator: 'Vodafone' },
  { prefix: '779', operator: 'Vodafone' },
  { prefix: '790', operator: 'Vodafone' },
  { prefix: '791', operator: 'Vodafone' },
  { prefix: '792', operator: 'Vodafone' },
  { prefix: '793', operator: 'Vodafone' },
  { prefix: '794', operator: 'Vodafone' },
  { prefix: '795', operator: 'Vodafone' },
  { prefix: '796', operator: 'Vodafone' },
  { prefix: '797', operator: 'Vodafone' },
  { prefix: '798', operator: 'Vodafone' },
  { prefix: '799', operator: 'Vodafone' },
];

const CZ_LANDLINE_REGIONS: Array<{ prefix: string; region: string }> = [
  { prefix: '2', region: 'Praha' },
  // Středočeský kraj — 3-digit prefixes must come before shorter ones (sorted later)
  { prefix: '311', region: 'Středočeský' },
  { prefix: '312', region: 'Středočeský' },
  { prefix: '313', region: 'Středočeský' },
  { prefix: '314', region: 'Středočeský' },
  { prefix: '315', region: 'Středočeský' },
  { prefix: '316', region: 'Středočeský' },
  { prefix: '317', region: 'Středočeský' },
  { prefix: '318', region: 'Středočeský' },
  { prefix: '35', region: 'Karlovarský' },
  { prefix: '37', region: 'Plzeňský' },
  { prefix: '38', region: 'Jihočeský' },
  { prefix: '39', region: 'Vysočina' },
  { prefix: '41', region: 'Ústecký' },
  { prefix: '46', region: 'Pardubický' },
  { prefix: '47', region: 'Liberecký' },
  { prefix: '48', region: 'Liberecký' },
  { prefix: '49', region: 'Královéhradecký' },
  { prefix: '5', region: 'Jihomoravský' },
  { prefix: '55', region: 'Moravskoslezský' },
  { prefix: '56', region: 'Vysočina' },
  { prefix: '57', region: 'Zlínský' },
  { prefix: '58', region: 'Olomoucký' },
  { prefix: '59', region: 'Moravskoslezský' },
];

export function parsePhonePrefix(raw: string): PrefixParseResult {
  const empty: PrefixParseResult = {
    country: null,
    countryCode: null,
    type: null,
    operator: null,
    region: null,
    district: null,
    normalized: raw,
    isValid: false,
  };
  if (!raw || typeof raw !== 'string') return empty;

  const normalized = normalize(raw);

  if (normalized.startsWith('+420')) {
    const rest = normalized.slice(4);
    if (!/^\d{9}$/.test(rest)) return { ...empty, normalized, country: 'CZ', countryCode: '+420' };

    for (const { prefix, operator } of CZ_MOBILE_OPERATORS) {
      if (rest.startsWith(prefix)) {
        return {
          country: 'CZ',
          countryCode: '+420',
          type: 'mobile',
          operator,
          region: null,
          district: null,
          normalized,
          isValid: true,
        };
      }
    }

    // Check longer prefixes first so '55' beats '5', '59' beats '5', etc.
    const sortedLandline = [...CZ_LANDLINE_REGIONS].sort(
      (a, b) => b.prefix.length - a.prefix.length,
    );
    for (const { prefix, region } of sortedLandline) {
      if (rest.startsWith(prefix)) {
        return {
          country: 'CZ',
          countryCode: '+420',
          type: 'landline',
          operator: null,
          region,
          district: region,
          normalized,
          isValid: true,
        };
      }
    }

    return { ...empty, country: 'CZ', countryCode: '+420', normalized, type: 'unknown' };
  }

  if (normalized.startsWith('+421')) {
    const rest = normalized.slice(4);
    if (!/^\d{9}$/.test(rest)) return { ...empty, normalized, country: 'SK', countryCode: '+421' };
    const mobilePrefix = rest.slice(0, 3); // e.g. 901..
    const first4 = '0' + mobilePrefix;
    const skMobile: Record<string, string> = {
      '0900': 'Orange',
      '0901': 'Orange',
      '0902': 'Orange',
      '0903': 'Orange',
      '0904': 'Orange',
      '0905': 'Orange',
      '0906': 'O2',
      '0907': 'O2',
      '0908': 'O2',
      '0910': 'T-Mobile',
      '0911': 'T-Mobile',
      '0912': 'T-Mobile',
      '0913': 'T-Mobile',
      '0914': 'T-Mobile',
      '0915': 'T-Mobile',
      '0940': 'O2',
      '0941': 'O2',
      '0942': 'O2',
      '0943': 'O2',
      '0944': 'O2',
      '0945': 'O2',
      '0946': 'O2',
      '0947': 'O2',
      '0948': 'O2',
      '0949': 'O2',
      '0950': 'T-Mobile',
      '0951': 'T-Mobile',
    };
    const operator = skMobile[first4] ?? null;
    return {
      country: 'SK',
      countryCode: '+421',
      type: operator ? 'mobile' : 'unknown',
      operator,
      region: null,
      district: null,
      normalized,
      isValid: operator !== null,
    };
  }

  return { ...empty, normalized };
}
