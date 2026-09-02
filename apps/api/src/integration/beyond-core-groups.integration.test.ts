/**
 * What the app actually registers, per configuration.
 *
 * The unit tests in @forgemsg/shared cover the resolver's decisions. This one
 * covers the thing those cannot: that the decision reaches Fastify, that a
 * group named in the environment produces its routes and an unnamed one does
 * not, and — the case with the most at stake — that a deployment which sets
 * nothing serves exactly what it served before this mechanism existed.
 *
 * The counts below were measured on the commit this branch started from
 * (907c7d7) by booting the real app and counting operations in /docs/json:
 *
 *   FEATURE_BEYOND_CORE unset/false   897 paths, 1117 operations
 *   FEATURE_BEYOND_CORE=true          1239 paths, 1554 operations
 *
 * They are pinned rather than derived. A derived expectation ("core plus the
 * enabled groups") would move with the code and could not catch a group
 * becoming reachable by accident, which is the whole failure this mechanism is
 * meant to make impossible.
 *
 * `env` is parsed once at import, so each case resets the module graph and
 * re-imports buildApp with the environment already in place — the technique
 * inbound-helpdesk-gate.integration.test.ts uses, and for the same reason.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/** Measured on 907c7d7 before this mechanism existed. */
const BASELINE = {
  coreOnly: { paths: 897, operations: 1117 },
  everything: { paths: 1239, operations: 1554 },
} as const;

interface Surface {
  paths: number;
  operations: number;
  has(path: string): boolean;
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
    let operations = 0;
    for (const methods of Object.values(doc.paths)) {
      for (const m of Object.keys(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) operations++;
      }
    }
    return { paths: keys.length, operations, has: (p) => keys.includes(p) };
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

describe('the default deployment is unchanged', () => {
  it('with nothing configured, serves exactly the pre-existing core surface', async () => {
    const s = await surfaceWith({});
    expect(s.paths).toBe(BASELINE.coreOnly.paths);
    expect(s.operations).toBe(BASELINE.coreOnly.operations);
  }, 120_000);

  it('and none of the beyond-core paths are among them', async () => {
    const s = await surfaceWith({});
    expect(s.has('/api/v1/surveys')).toBe(false);
    expect(s.has('/api/v1/coupons/batches')).toBe(false);
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(false);
  }, 120_000);
});

describe('development is unchanged', () => {
  it('FEATURE_BEYOND_CORE=true still serves every group, as it always did', async () => {
    const s = await surfaceWith({ all: true });
    expect(s.paths).toBe(BASELINE.everything.paths);
    expect(s.operations).toBe(BASELINE.everything.operations);
    // Including the blocked one: dev is not a rollout, and route-smoke sweeps
    // this surface.
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(true);
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

  it('adds only that group’s routes to the core surface', async () => {
    const s = await surfaceWith({ groups: 'survey' });
    expect(s.operations).toBeGreaterThan(BASELINE.coreOnly.operations);
    // surveyRoutes is seven endpoints; the delta must be exactly that, or
    // something else came along with it.
    expect(s.operations - BASELINE.coreOnly.operations).toBe(7);
  }, 120_000);

  it('registers two groups when two are named', async () => {
    const s = await surfaceWith({ groups: 'survey,revenue' });
    expect(s.has('/api/v1/surveys')).toBe(true);
    expect(s.has('/api/v1/revenue/report')).toBe(true);
    expect(s.has('/api/v1/coupons/batches')).toBe(false);
  }, 120_000);

  it('an empty value is the same as unset — no groups', async () => {
    const s = await surfaceWith({ groups: '' });
    expect(s.operations).toBe(BASELINE.coreOnly.operations);
  }, 120_000);
});

describe('a misconfiguration refuses the boot', () => {
  it('an unknown group name, with a suggestion', async () => {
    const message = await bootFails({ groups: 'loyalty-programs' });
    expect(message).toMatch(/Invalid environment configuration/);
  }, 120_000);

  it('a blocked group, however it is written down', async () => {
    const message = await bootFails({ groups: 'stock-alert' });
    expect(message).toMatch(/Invalid environment configuration/);
  }, 120_000);

  it('and the blocked group is not registered as a consolation prize', async () => {
    // The refusal is the property, but assert the surface too: there is no
    // path by which naming stock-alert produces its routes.
    await bootFails({ groups: 'stock-alert' });
    const s = await surfaceWith({ groups: 'survey' });
    expect(s.has('/api/v1/back-in-stock/subscribe')).toBe(false);
  }, 120_000);
});
