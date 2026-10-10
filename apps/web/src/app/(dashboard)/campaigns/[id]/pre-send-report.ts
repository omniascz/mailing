/**
 * The pre-send verdict, read for a person about to press Send.
 *
 * GET /api/v1/campaigns/:id/pre-send-checks returns every criterion the
 * server's gate (apps/api/src/services/pre-send/send-gate.ts) decides on, and
 * POST /send and /schedule refuse a no-go campaign with 422 unless the request
 * carries `acknowledgeDeliverabilityRisk: true`. This module turns both into
 * what the panel shows: each criterion named, with what was measured against
 * which threshold — including the sample and its minimum where the gate gives
 * them — and, for a blocking one, what to do about it and where.
 *
 * Pure: no fetch and no React, so it is tested directly.
 */

export type Severity = 'pass' | 'info' | 'warn' | 'fail';
export type Verdict = 'go' | 'caution' | 'no-go';

export interface Check {
  id: string;
  category?: string;
  severity: Severity;
  title: string;
  detail?: string;
  fixHref?: string;
  metrics?: Record<string, string | number>;
}

export interface PreSendReport {
  verdict: Verdict;
  score?: number;
  grade?: string;
  checks: Check[];
}

/** A blocking criterion as the 422 names it (details.blocking). */
export interface RefusedCriterion {
  id: string;
  title: string;
  metrics?: Record<string, string | number>;
}

/** The body field that sends a no-go campaign anyway. Server contract, #245. */
export const ACKNOWLEDGE_FIELD = 'acknowledgeDeliverabilityRisk';

const LABELS: Record<string, string> = {
  'domain-auth': 'Ověření odesílací domény (SPF, DKIM, DMARC)',
  'audience-empty': 'Příjemci kampaně',
  'audience-size': 'Velikost publika',
  'suppression-match': 'Potlačené adresy v publiku',
  'frequency-cap': 'Limit četnosti zasílání',
  subject: 'Předmět',
  'merge-tags': 'Slučovací pole',
  'unsubscribe-link': 'Odkaz pro odhlášení',
  'preference-center-tag': 'Odkaz na centrum preferencí',
  'spam-score': 'Spamové skóre',
  'plain-text-alt': 'Textová verze e-mailu',
  'ip-warmup': 'Zahřívání IP adres',
  'bounce-rate': 'Míra nedoručitelnosti (7 dní)',
  'complaint-rate': 'Míra stížností na spam',
  'schedule-time': 'Čas odeslání',
  blacklist: 'Blacklisty IP adres',
};

export function criterionLabel(id: string): string {
  return LABELS[id] ?? id;
}

const pct = (v: number) => `${round(v)} %`;
const round = (v: number) =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');

/**
 * Every metric the gate reports, in words. Known keys get a Czech label and a
 * unit; a key this list does not know is still shown, as `key: value`, so a
 * criterion the server adds later is never silently dropped from the panel.
 */
export function describeMetrics(metrics: Record<string, string | number> | undefined): string[] {
  if (!metrics) return [];
  const m = { ...metrics };
  const out: string[] = [];
  const take = (k: string) => {
    const v = m[k];
    delete m[k];
    return v;
  };
  const num = (k: string) => {
    const v = take(k);
    return typeof v === 'number' ? v : v === undefined ? undefined : Number(v);
  };

  const bounce = num('bounceRatePct');
  const complaint = num('complaintRatePct');
  const complaint24 = num('complaintRate24hPct');
  const threshold = num('thresholdPct');
  const window = take('window');
  if (bounce !== undefined) out.push(`Naměřeno: ${pct(bounce)} nedoručitelných zpráv`);
  if (complaint !== undefined)
    out.push(
      `Naměřeno: ${pct(complaint)} stížností${window ? ` (okno ${window === '24h' ? '24 hodin' : '7 dní'})` : ''}`,
    );
  if (complaint24 !== undefined) out.push(`Za posledních 24 hodin: ${pct(complaint24)}`);
  if (threshold !== undefined) out.push(`Hranice: ${pct(threshold)}`);

  const sample = num('sampleSize');
  const sample7d = num('sample7d');
  const sample24h = num('sample24h');
  const minSample = num('minSample');
  if (sample !== undefined)
    out.push(
      `Vzorek: ${sample}${minSample !== undefined ? ` (minimum ${minSample})` : ''}` +
        (minSample !== undefined && sample < minSample ? ' — do rozhodnutí se nepočítá' : ''),
    );
  if (sample7d !== undefined)
    out.push(
      `Vzorek za 7 dní: ${sample7d} doručených${minSample !== undefined ? ` (minimum ${minSample})` : ''}` +
        (minSample !== undefined && sample7d < minSample ? ' — do rozhodnutí se nepočítá' : ''),
    );
  if (sample24h !== undefined) out.push(`Vzorek za 24 hodin: ${sample24h} doručených`);
  if (sample === undefined && sample7d === undefined && minSample !== undefined)
    out.push(`Minimální vzorek: ${minSample}`);

  const pairs: Array<[string, (v: number | string) => string]> = [
    ['recipientCount', (v) => `Příjemců: ${v}`],
    ['suppressedPct', (v) => `Potlačeno: ${pct(Number(v))}`],
    ['suppressedCount', (v) => `Potlačených adres: ${v}`],
    ['cappedPct', (v) => `Zastaví limit četnosti: ${pct(Number(v))}`],
    ['subjectLength', (v) => `Délka předmětu: ${v} znaků`],
    ['spamScore', (v) => `Skóre: ${v}/10`],
    ['unknownTags', (v) => `Neznámých polí: ${v}`],
    ['unknownFilters', (v) => `Neznámých filtrů: ${v}`],
    ['remainingCapacity', (v) => `Dnes lze odeslat ještě: ${v}`],
    ['overflow', (v) => `Počká na zítřek: ${v}`],
    ['blacklisted', (v) => `Na blacklistu: ${v} IP`],
    ['total', (v) => `IP adres celkem: ${v}`],
    ['checkedIps', (v) => `Zkontrolovaných IP: ${v}`],
    ['scheduledHourUtc', (v) => `Hodina odeslání (UTC): ${v}`],
  ];
  for (const [k, fmt] of pairs) {
    const v = take(k);
    if (v !== undefined) out.push(fmt(v));
  }
  for (const [k, v] of Object.entries(m)) out.push(`${k}: ${v}`);
  return out;
}

export interface Remedy {
  text: string;
  href?: string;
  linkLabel?: string;
}

/** What to do about a blocking criterion, and the page in the app where it is done. */
export function remedyFor(id: string, campaignId: string): Remedy {
  const edit = `/campaigns/${campaignId}/edit`;
  switch (id) {
    case 'domain-auth':
      return {
        text: 'Doplňte u odesílací domény záznamy SPF a DKIM v DNS a nechte doménu znovu ověřit.',
        href: '/domains',
        linkLabel: 'Otevřít domény',
      };
    case 'audience-empty':
      return {
        text: 'Vyberte pro kampaň seznam, ve kterém je alespoň jeden aktivní kontakt.',
        href: edit,
        linkLabel: 'Upravit kampaň',
      };
    case 'unsubscribe-link':
      return {
        text: 'Přidejte do obsahu odkaz pro odhlášení ({{unsubscribe_url}}), nebo kampaň postavte z bloků, kam ho doplníme sami.',
        href: edit,
        linkLabel: 'Upravit obsah',
      };
    case 'subject':
      return { text: 'Vyplňte předmět kampaně.', href: edit, linkLabel: 'Upravit kampaň' };
    case 'spam-score':
      return {
        text: 'Upravte texty, na které spamový filtr upozorňuje (viz podrobnosti výše).',
        href: edit,
        linkLabel: 'Upravit obsah',
      };
    case 'bounce-rate':
      return {
        text: 'Vyčistěte seznam od neplatných adres; nedoručitelné adresy z posledních odeslání najdete v potlačených adresách.',
        href: '/suppressions',
        linkLabel: 'Otevřít potlačené adresy',
      };
    case 'complaint-rate':
      return {
        text: 'Posílejte jen kontaktům, které o e-maily stojí, a zkontrolujte, odkud seznam pochází. Přihlášky z posledních dnů najdete u seznamů.',
        href: '/lists',
        linkLabel: 'Otevřít seznamy',
      };
    case 'ip-warmup':
      return {
        text: 'Dnešní limit zahřívaných IP adres je vyčerpaný. Naplánujte kampaň na zítřek.',
      };
    case 'blacklist':
      return {
        text: 'Všechny vaše odesílací IP adresy jsou na blacklistu. Požádejte provozovatele blacklistu o vyřazení; dokud nejsou venku, zprávy se nedoručí.',
      };
    default:
      return {
        text: 'Opravte kampaň podle podrobností výše.',
        href: edit,
        linkLabel: 'Upravit kampaň',
      };
  }
}

export interface GroupedChecks {
  blocking: Check[];
  warnings: Check[];
  info: Check[];
  passed: Check[];
}

export function groupChecks(checks: Check[]): GroupedChecks {
  return {
    blocking: checks.filter((c) => c.severity === 'fail'),
    warnings: checks.filter((c) => c.severity === 'warn'),
    info: checks.filter((c) => c.severity === 'info'),
    passed: checks.filter((c) => c.severity === 'pass'),
  };
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  go: 'Kampaň je připravená k odeslání.',
  caution: 'Kampaň lze odeslat, ale má varování.',
  'no-go': 'Kampaň v tomto stavu odeslat nelze.',
};

/**
 * The body a confirmation sends. The acknowledgement is added only when it
 * was ticked — and never as `false`: an absent field is the server's default.
 */
export function confirmBody(
  base: Record<string, unknown> | undefined,
  acknowledged: boolean,
): Record<string, unknown> | undefined {
  if (!acknowledged) return base;
  return { ...(base ?? {}), [ACKNOWLEDGE_FIELD]: true };
}

/** Whether the confirm button may be pressed. */
export function canConfirm(verdict: Verdict, acknowledged: boolean): boolean {
  return verdict !== 'no-go' || acknowledged;
}

export interface ApiFailure {
  status: number;
  code?: string;
  message: string;
  /** Present when the gate refused: each blocking criterion with its numbers. */
  blocking?: RefusedCriterion[];
}

/** Read an error response whole — never a truncated slice of it. */
export function readFailure(status: number, text: string): ApiFailure {
  try {
    const body = JSON.parse(text) as {
      code?: string;
      message?: string;
      details?: { blocking?: RefusedCriterion[] };
    };
    return {
      status,
      code: body.code,
      message: body.message ?? text,
      ...(body.code === 'DELIVERABILITY_NO_GO' && Array.isArray(body.details?.blocking)
        ? { blocking: body.details!.blocking }
        : {}),
    };
  } catch {
    return { status, message: text || `HTTP ${status}` };
  }
}
