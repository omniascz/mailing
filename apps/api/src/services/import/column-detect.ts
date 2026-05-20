/**
 * Auto-detect which source CSV/XLSX column maps to which contact field.
 * Returns a best-effort mapping that users can override in the mapping step.
 */

export type ContactField =
  | 'email'
  | 'phone'
  | 'first_name'
  | 'last_name'
  | 'status'
  | 'source'
  | 'ignore';

const ALIASES: Record<Exclude<ContactField, 'ignore'>, string[]> = {
  email: [
    'email',
    'e-mail',
    'e mail',
    'emailaddress',
    'email_address',
    'mail',
    'mailová adresa',
    'mailova adresa',
  ],
  phone: [
    'phone',
    'phonenumber',
    'phone_number',
    'telefon',
    'tel',
    'mobil',
    'mobile',
    'mobile_number',
  ],
  first_name: [
    'firstname',
    'first_name',
    'fname',
    'given_name',
    'jmeno',
    'jméno',
    'křestní jméno',
    'krestni jmeno',
  ],
  last_name: ['lastname', 'last_name', 'lname', 'surname', 'family_name', 'prijmeni', 'příjmení'],
  status: ['status', 'state', 'stav'],
  source: ['source', 'origin', 'zdroj'],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-.]+/g, '')
    .trim();
}

export function detectColumnMapping(columns: string[]): Record<string, ContactField> {
  const mapping: Record<string, ContactField> = {};
  const claimed = new Set<ContactField>();

  for (const col of columns) {
    const norm = normalize(col);
    let matched: ContactField = 'ignore';
    for (const [field, aliases] of Object.entries(ALIASES) as [
      Exclude<ContactField, 'ignore'>,
      string[],
    ][]) {
      if (claimed.has(field)) continue;
      if (aliases.some((a) => normalize(a) === norm)) {
        matched = field;
        claimed.add(field);
        break;
      }
    }
    mapping[col] = matched;
  }

  return mapping;
}
