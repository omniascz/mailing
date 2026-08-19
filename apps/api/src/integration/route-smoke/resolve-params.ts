/**
 * Fill in `{id}` and friends with values that get a request past validation and
 * into the handler, because a route that 404s on a made-up id has not really
 * been tested.
 *
 * The map is derived from the database rather than hand-written: 266 of the 632
 * GET routes take a path parameter and a hardcoded table would rot on the first
 * rename. Two rules cover almost all of them:
 *
 *   /api/v1/campaigns/{id}            → the segment before {id} names the
 *                                       collection, so look in `campaigns`
 *   /api/v1/contacts/{contactId}/...  → the parameter itself names it, so strip
 *                                       `Id` and pluralise → `contacts`
 *
 * A candidate is only used if a table of that name actually exists, so a wrong
 * guess costs nothing. Where no row exists we fall back to a syntactically valid
 * dummy: the request then reaches the handler and 404s, which still exercises
 * everything up to the lookup — far more than a 400 on a malformed uuid would.
 *
 * ─── What this actually achieves today ──────────────────────────────────────
 *
 * Measured over the 151 distinct parameter slots on the 266 parameterised GET
 * routes:
 *
 *   20  filled from a real row
 *   40  non-uuid parameters filled from LITERALS below
 *   69  mapped to the right table, which the seed leaves empty
 *   22  no table matched at all (`/orgs/{id}`, `/migrations/{id}` — collections
 *       that are not tables)
 *
 * So the limit is the seed, not the mapping: the suffix rule alone moved 29
 * slots out of "no table" and into "table found, no rows", and they will start
 * resolving to real ids the moment anything seeds them, with no change here.
 * Deepening this further means seeding more entities, not guessing harder.
 */
import type { Sql } from 'postgres';

/** Valid uuid that will not match a row. Better than a malformed one: the
 *  handler runs and answers 404 rather than validation rejecting at the door. */
export const DUMMY_UUID = '00000000-0000-0000-0000-0000000000ff';

export interface ParamResolution {
  values: Map<string, string>;
  /** How each parameter key was filled, for the coverage report. */
  realIds: number;
  dummies: number;
}

function snake(s: string): string {
  return s
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function pluralise(s: string): string {
  if (s.endsWith('y')) return `${s.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(s)) return `${s}es`;
  return `${s}s`;
}

/**
 * Non-uuid parameters. These are matched by name because there is nothing in
 * the path to look them up by; the values only need to be well-formed enough to
 * reach the handler.
 */
const LITERALS: Record<string, string> = {
  token: 'smoke-token-not-a-real-one',
  siteToken: 'smoke-site-token',
  trackingId: 'smoke-tracking-id',
  slug: 'acme-demo',
  pageSlug: 'acme-demo',
  eventSlug: 'acme-demo',
  idOrSlug: 'acme-demo',
  idOrKey: 'acme-demo',
  objectKey: 'smoke_object',
  domain: 'example.com',
  sku: 'SMOKE-SKU-1',
  platform: 'facebook',
  provider: 'google',
  entityType: 'contact',
  industry: 'saas',
  segment: 'all',
  product: 'email',
  name: 'smoke',
  vA: 'a',
  vB: 'b',
};

/** Candidate table names for a parameter, most specific first. */
export function candidateTables(param: string, precedingSegment: string | null): string[] {
  const out: string[] = [];
  if (/Id$/.test(param) && param !== 'Id') {
    out.push(pluralise(snake(param.replace(/Id$/, ''))));
  }
  if (precedingSegment) {
    const seg = snake(precedingSegment);
    out.push(seg, pluralise(seg));
  }
  return [...new Set(out)];
}

/**
 * URL segments are short where table names are qualified: `/blog/posts/{id}`
 * against `blog_posts`, `/tickets/{id}` against `helpdesk_tickets`,
 * `/forms/{id}` against `signup_forms`. Matching on the suffix recovers those
 * without a hand-written table map — 51 of 151 parameter slots resolved to no
 * table at all before this rule.
 *
 * Shortest match wins, deterministically, so an ambiguous suffix picks the
 * least-qualified table rather than an arbitrary one.
 */
export function suffixMatch(candidate: string, tables: Iterable<string>): string | null {
  const matches = [...tables].filter((t) => t.endsWith(`_${candidate}`));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!;
}

/**
 * Resolve every distinct parameter key seen across the route list to a value.
 *
 * The key is `paramName@precedingSegment`, not just the name: `{id}` appears on
 * 146 routes and means a different table on nearly every one.
 */
export async function resolveParams(
  sql: Sql,
  orgId: string,
  keys: Array<{ key: string; param: string; precedingSegment: string | null }>,
): Promise<ParamResolution> {
  const tables = new Set(
    (
      await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `
    ).map((r) => r.table_name),
  );
  const hasOrgId = new Set(
    (
      await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'org_id'
      `
    ).map((r) => r.table_name),
  );

  const values = new Map<string, string>();
  let realIds = 0;
  let dummies = 0;

  for (const { key, param, precedingSegment } of keys) {
    if (param === 'orgId') {
      values.set(key, orgId);
      realIds++;
      continue;
    }
    const literal = LITERALS[param];
    if (literal !== undefined) {
      values.set(key, literal);
      dummies++;
      continue;
    }

    let found: string | null = null;
    const candidates = candidateTables(param, precedingSegment);
    const resolvedTables = [
      ...candidates.filter((c) => tables.has(c)),
      ...candidates.map((c) => suffixMatch(c, tables)).filter((t): t is string => t !== null),
    ];
    for (const table of resolvedTables) {
      if (!tables.has(table)) continue;
      // Scope to the tenant under test where the table is tenant-scoped, so the
      // handler sees a row it is actually allowed to read.
      const rows = hasOrgId.has(table)
        ? await sql.unsafe<{ id: string }[]>(
            `SELECT id::text AS id FROM "${table}" WHERE org_id = $1 LIMIT 1`,
            [orgId],
          )
        : await sql.unsafe<{ id: string }[]>(`SELECT id::text AS id FROM "${table}" LIMIT 1`);
      if (rows[0]?.id) {
        found = rows[0].id;
        break;
      }
    }

    if (found) {
      values.set(key, found);
      realIds++;
    } else {
      values.set(key, DUMMY_UUID);
      dummies++;
    }
  }

  return { values, realIds, dummies };
}
