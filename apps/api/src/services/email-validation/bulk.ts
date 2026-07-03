/**
 * Bulk email validation (§9 P1).
 *
 * Validates a batch of up to 5 000 email addresses per request. Reuses
 * the single-address `validateEmail` and `validateEmailSync` helpers
 * but adds two performance + accuracy wins:
 *
 *   1. **Per-domain MX dedupe** — most of a CSV import's domains are
 *      shared (corporate domains, gmail.com, etc). We resolve MX once
 *      per distinct domain and reuse the result across every address.
 *
 *   2. **Redis cache** — domain MX verdicts are cached for 24h. A
 *      second import of the same list never hits DNS at all.
 *
 * Suggested fix surfaces the most common typo correction
 * ("gnail.com" → "gmail.com") so the operator can preview cleanup
 * before committing the import.
 */

import dns from 'node:dns/promises';
import { redis } from '../../lib/redis.js';
import {
  validateEmailSync,
  type EmailValidationResult,
} from './index.js';
import { suggestEmailCorrection } from './suggest.js';

const DOMAIN_CACHE_TTL_SEC = 24 * 3600;

const COMMON_TYPOS: Record<string, string> = {
  'gnail.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotnail.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outloo.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'seznam.c': 'seznam.cz',
  'seznam.cn': 'seznam.cz',
  'centrum.c': 'centrum.cz',
};

export interface BulkValidationOpts {
  /** Skip MX lookups (faster, less accurate). Default: false. */
  syntaxOnly?: boolean;
  /** Per-address timeout for MX lookup. Default: 3000 ms. */
  mxTimeoutMs?: number;
}

export interface BulkAddressResult extends EmailValidationResult {
  email: string;
  // `suggestion` (typo / TLD fix) is inherited from EmailValidationResult.
}

export interface BulkValidationReport {
  total: number;
  valid: number;
  invalid: number;
  highRisk: number; // score < 50
  disposable: number;
  roleBased: number;
  results: BulkAddressResult[];
}

/** Lower-cased, trimmed domain extraction. */
function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function suggestionFor(email: string): string | undefined {
  const domain = extractDomain(email);
  if (!domain) return undefined;
  // Curated table first (fast, exact), then the fuzzy Levenshtein suggester.
  const replacement = COMMON_TYPOS[domain];
  if (replacement && replacement !== domain) {
    const local = email.slice(0, email.lastIndexOf('@'));
    return `${local}@${replacement}`;
  }
  return suggestEmailCorrection(email) ?? undefined;
}

async function resolveMxOnce(domain: string, timeoutMs: number): Promise<boolean> {
  const cacheKey = `email-validation:mx:${domain}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached === 'true') return true;
  if (cached === 'false') return false;

  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
    const hasMx = Array.isArray(records) && records.length > 0;
    await redis.setex(cacheKey, DOMAIN_CACHE_TTL_SEC, hasMx ? 'true' : 'false').catch(() => {});
    return hasMx;
  } catch {
    await redis.setex(cacheKey, 60, 'false').catch(() => {}); // shorter TTL on failure
    return false;
  }
}

export async function bulkValidate(
  emails: string[],
  opts: BulkValidationOpts = {},
): Promise<BulkValidationReport> {
  const timeoutMs = opts.mxTimeoutMs ?? 3000;
  const distinctDomains = new Set<string>();

  // Pre-pass: syntactic check + collect domains worth a DNS pass.
  const initialPass = emails.map((raw) => {
    const email = (raw ?? '').toLowerCase().trim();
    const synth = validateEmailSync(email);
    const domain = extractDomain(email);
    if (
      !opts.syntaxOnly &&
      synth.isValid &&
      !synth.isDisposable &&
      domain
    ) {
      distinctDomains.add(domain);
    }
    return { email, syntax: synth, domain, suggestion: suggestionFor(email) };
  });

  // MX dedupe — one lookup per distinct domain, cached for 24h after.
  const domainResults = new Map<string, boolean>();
  if (!opts.syntaxOnly) {
    await Promise.all(
      Array.from(distinctDomains).map(async (d) => {
        domainResults.set(d, await resolveMxOnce(d, timeoutMs));
      }),
    );
  }

  // Compose final per-address verdicts using the cached MX result.
  const results: BulkAddressResult[] = initialPass.map((row) => {
    const base = row.syntax as EmailValidationResult;
    let score = base.score;
    const reasons = [...base.reasons];
    let hasMx: boolean | null = base.hasMx;

    if (!opts.syntaxOnly && base.isValid && !base.isDisposable && row.domain) {
      hasMx = domainResults.get(row.domain) ?? false;
      if (!hasMx) {
        score = Math.max(0, score - 30);
        reasons.push('no_mx_record');
      }
    }

    return {
      email: row.email,
      score,
      reasons,
      isValid: score > 0,
      isDisposable: base.isDisposable,
      isRoleBased: base.isRoleBased,
      hasMx,
      suggestion: row.suggestion ?? null,
    };
  });

  return {
    total: results.length,
    valid: results.filter((r) => r.isValid).length,
    invalid: results.filter((r) => !r.isValid).length,
    highRisk: results.filter((r) => r.score > 0 && r.score < 50).length,
    disposable: results.filter((r) => r.isDisposable).length,
    roleBased: results.filter((r) => r.isRoleBased).length,
    results,
  };
}
