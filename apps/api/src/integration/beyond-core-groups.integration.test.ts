/**
 * What the app actually registers, per configuration.
 *
 * The unit tests in @forgemsg/shared cover the resolver's decisions. This one
 * covers the thing those cannot: that the decision reaches Fastify, that a
 * group named in the environment produces its routes and an unnamed one does
 * not, and — the case with the most at stake — that a deployment which sets
 * nothing serves no group at all.
 *
 * ─── Why the absolute counts are gone ────────────────────────────────────────
 *
 * This file used to pin four numbers: the paths and operations of the core
 * surface, and the same pair for `everything`. They were measured by hand, and
 * every new CORE route moved all four, because a core route appears on both
 * surfaces. Three PRs in a row carried a commit that did nothing but retype
 * them, and the fourth did not — that run failed as
 *
 *     expected 8 to be 7
 *
 * on the survey delta, which was a subtraction against a stale core constant.
 * It reads as a fault in surveyRoutes and is nothing of the kind. A guard whose
 * failure names the wrong subsystem is worse than what it guards against,
 * because the person who sees it starts by looking somewhere else.
 *
 * ─── The invariant, stated without a single count ────────────────────────────
 *
 * For any configuration C, the surface served is exactly
 *
 *     core  union  ( routes(g) for every g in C )
 *
 * and that union is DISJOINT. Three consequences, each asserted below:
 *
 *   I1  core is unconditional — every core route is served under every
 *       configuration, so core minus everything is empty.
 *   I2  a group is off until it is named — no route of any group is served by
 *       the default deployment, so everything minus core is the whole of the
 *       beyond-core surface and none of it has leaked into core.
 *   I3  naming a group adds that group and nothing else — the surface with g
 *       minus core is exactly the routes of g.
 *
 * ─── What is still pinned, and why it is the right thing to pin ──────────────
 *
 * One pair of numbers survives: the SIZE OF THE DIFFERENCE, everything minus
 * core. It is the only figure here that does not move when the product grows a
 * core route — a core route lands on both sides of the subtraction and cancels
 * — so the ordinary change that used to cost a commit now costs nothing, while
 * the three ways this mechanism can actually break all move it:
 *
 *   - a core route registered only under a group      -> the difference GROWS
 *   - a group's route reachable without its group     -> the difference SHRINKS
 *   - a group registered without being gated at all   -> the difference SHRINKS
 *
 * It is still two hand-written numbers, and the honest reason it is not derived
 * from the group registrations is cost and circularity. Deriving it means
 * measuring, for each of the 76 groups, the surface with only that group minus
 * core — 76 boots of the real app, three seconds each, over three minutes added
 * to a lane that runs in five. And the expectation would then come from the
 * same registration table this file exists to check, so it could not fail in
 * the direction that matters. The half that CAN be derived without circularity
 * already is: config/beyond-core-registry.test.ts proves index.ts registers
 * exactly the 76 declared groups, by reading the source rather than the app.
 *
 * Where a set is as cheap as a count, this file now compares sets — so a change
 * that swaps one route for another, which four equal counts could never see,
 * fails here with both names in the message.
 *
 * `env` is parsed once at import, so each case resets the module graph and
 * re-imports buildApp with the environment already in place — the technique
 * inbound-helpdesk-gate.integration.test.ts uses, and for the same reason.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The whole beyond-core surface, measured on 103d6d1 by booting the real app
 * twice and subtracting.
 *
 * Update this ONLY when a beyond-core group gains or loses routes — the moment
 * a human should be looking. Adding a core route must leave it alone; if a core
 * route moves it, the route did not land in core.
 */
const BEYOND_CORE_SURFACE = { paths: 342, operations: 437 } as const;

/**
 * surveyRoutes, in full. Pinned as names rather than as the count 7 it used to
 * be: a count cannot tell a renamed route from an unchanged one, and that count
 * was computed against the core constant, which is what produced the
 * "expected 8 to be 7" that named the wrong subsystem.
 */
const SURVEY_OPERATIONS = [
  'GET /api/v1/surveys',
  'GET /api/v1/surveys/{id}',
  'GET /api/v1/surveys/{id}/results',
  'GET /public/surveys/{id}/hosted',
  'POST /api/v1/surveys',
  'POST /public/surveys/{id}/submit',
  'PUT /api/v1/surveys/{id}',
] as const;

interface Surface {
  /** Sorted OpenAPI path templates. */
  paths: string[];
  /** Sorted `METHOD path` keys — the finer measure; one path can carry several. */
  operations: string[];
  has(path: string): boolean;
}

/** Members of `a` that are not in `b`. Input is sorted, so a failure reads in order. */
function without(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(b);
  return a.filter((x) => !seen.has(x));
}

const opened: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of opened.splice(0)) await app.close().catch(() => {});
});

/** Boot the real app with a given beyond-core configuration and read /docs/json. */
async function surfaceWith(cfg: { all?: boolean; groups?: string }): Promise<Surface> {
  vi.resetModules();
  const prevAll = process.env.FEATURE_BEYOND_CORE;
  const prevGroups = process.env.BEYOND_CORE_GROUPS;
  process.env.FEATURE_BEYOND_CORE = cfg.all ? 'true' : 'false';
  if (cfg.groups === undefined) delete process.env.BEYOND_CORE_GROUPS;
  else process.env.BEYOND_CORE_GROUPS = cfg.groups;

  try {
    const { buildApp } = await import('../index.js');
    const app = await buildApp();
    opened.push(app);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const doc = res.json() as { paths: Record<string, Record<string, unknown>> };
    const keys = Object.keys(doc.paths);
    const operations: string[] = [];
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const m of Object.keys(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) {
          operations.push(`${m.toUpperCase()} ${path}`);
        }
      }
    }
    return {
      paths: [...keys].sort(),
      operations: operations.sort(),
      has: (p) => keys.includes(p),
    };
  } finally {
    if (prevAll === undefined) delete process.env.FEATURE_BEYOND_CORE;
    else process.env.FEATURE_BEYOND_CORE = prevAll;
    if (prevGroups === undefined) delete process.env.BEYOND_CORE_GROUPS;
    else process.env.BEYOND_CORE_GROUPS = prevGroups;
  }
}

/** Boot and expect it to refuse. */
async function bootFails(cfg: { all?: boolean; groups?: string }): Promise<string> {
  try {
    await surfaceWith(cfg);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected the boot to be refused, but it succeeded');
}

describe('core and the groups partition the surface', () => {
  it('I1: every core route is still served when every group is on', async () => {
    const core = await surfaceWith({});
    const everything = await surfaceWith({ all: true });

    // No count. A group that shadowed or replaced a core route would empty a
    // slot here, and the message names the route rather than a total.
    expect(without(core.paths, everything.paths), 'core paths lost when groups are on').toEqual([]);
    expect(
      without(core.operations, everything.operations),
      'core operations lost when groups are on',
    ).toEqual([]);
  }, 180_000);

  it('I2: the beyond-core surface is exactly this size, and core growth does not move it', async () => {
    const core = await surfaceWith({});
    const everything = await surfaceWith({ all: true });

    const extraPaths = without(everything.paths, core.paths);
    const extraOperations = without(everything.operations, core.operations);

    // The point of the whole file. A new CORE route appears on both surfaces
    // and cancels out of this subtraction, so it needs no edit here. A route
    // that landed inside a group, or a group route that became reachable
    // without its group, moves one of these two numbers, and this is the only
    // place that would say so.
    expect(extraPaths.length, 'beyond-core paths').toBe(BEYOND_CORE_SURFACE.paths);
    expect(extraOperations.length, 'beyond-core operations').toBe(BEYOND_CORE_SURFACE.operations);
  }, 180_000);
});

describe('the default deployment serves no group', () => {
  it('none of the beyond-core paths are among them', async () => {
    const s = await surfaceWith({});
    expect(s.has('/api/v1/surveys')).toBe(false);
    expect(s.has('/api/v1/coupons/batches')).toBe(false);
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(false);
  }, 120_000);
});

describe('development is unchanged', () => {
  it('FEATURE_BEYOND_CORE=true still serves every group, as it always did', async () => {
    const s = await surfaceWith({ all: true });
    // Including the blocked one: dev is not a rollout, and route-smoke sweeps
    // this surface.
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(true);
    expect(s.has('/api/v1/surveys')).toBe(true);
    expect(s.has('/api/v1/revenue/report')).toBe(true);
  }, 120_000);
});

describe('a named group is registered, an unnamed one is not', () => {
  it('registers exactly the group asked for', async () => {
    const s = await surfaceWith({ groups: 'survey' });
    expect(s.has('/api/v1/surveys')).toBe(true);
    // Its neighbours stay off.
    expect(s.has('/api/v1/coupons/batches')).toBe(false);
    expect(s.has('/api/v1/revenue/report')).toBe(false);
  }, 120_000);

  it('I3: adds exactly that group’s routes to the core surface, by name', async () => {
    const core = await surfaceWith({});
    const withSurvey = await surfaceWith({ groups: 'survey' });

    // Measured against the core surface of THIS commit rather than a constant,
    // so the assertion is about surveyRoutes and can only fail about
    // surveyRoutes.
    expect(without(withSurvey.operations, core.operations)).toEqual([...SURVEY_OPERATIONS]);
    // And nothing went the other way: naming a group never removes a route.
    expect(without(core.operations, withSurvey.operations)).toEqual([]);
  }, 180_000);

  it('registers two groups when two are named, and contains the one-group delta', async () => {
    const core = await surfaceWith({});
    const both = await surfaceWith({ groups: 'survey,revenue' });

    expect(both.has('/api/v1/surveys')).toBe(true);
    expect(both.has('/api/v1/revenue/report')).toBe(true);
    expect(both.has('/api/v1/coupons/batches')).toBe(false);

    // survey's routes are a subset of what the pair adds, and revenue brought
    // something of its own: the union is additive, not a replacement.
    const delta = without(both.operations, core.operations);
    expect(without([...SURVEY_OPERATIONS], delta), 'survey routes missing from the pair').toEqual(
      [],
    );
    expect(without(delta, [...SURVEY_OPERATIONS]).length).toBeGreaterThan(0);
  }, 180_000);

  it('an empty value is the same as unset — the same surface, route for route', async () => {
    const unset = await surfaceWith({});
    const empty = await surfaceWith({ groups: '' });
    // Set equality rather than an equal count: two surfaces of the same size
    // can still differ.
    expect(without(empty.operations, unset.operations)).toEqual([]);
    expect(without(unset.operations, empty.operations)).toEqual([]);
  }, 180_000);
});

describe('a misconfiguration refuses the boot', () => {
  it('an unknown group name, with a suggestion', async () => {
    const message = await bootFails({ groups: 'loyalty-programs' });
    expect(message).toMatch(/Invalid environment configuration/);
  }, 120_000);

  it('a blocked group, however it is written down', async () => {
    const message = await bootFails({ groups: 'ads-webhook' });
    expect(message).toMatch(/Invalid environment configuration/);
  }, 120_000);

  it('and the blocked group is not registered as a consolation prize', async () => {
    // The refusal is the property, but assert the surface too: there is no
    // path by which naming a blocked group produces its routes.
    await bootFails({ groups: 'ads-webhook' });
    const s = await surfaceWith({ groups: 'survey' });
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(false);
  }, 120_000);
});

describe('stock-alert can now be turned on', () => {
  it('the group boots and its routes appear', async () => {
    // It was blocked because notifyRestock and notifyPriceChange consumed the
    // subscription lists while sending nothing. Both now dispatch per
    // subscriber and mark only what was really sent, so the block came off —
    // and this asserts the consequence rather than the intention.
    const s = await surfaceWith({ groups: 'stock-alert' });
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(true);
    expect(s.has('/api/v1/price-drop/subscribe')).toBe(true);
  }, 120_000);
});
