/**
 * Resolving a rollout from the environment.
 *
 * The cases that matter are the refusals. A mechanism that turns groups on is
 * easy; what this module exists for is the three ways an operator can get it
 * wrong — a typo, a group that must not be turned on, and the all-at-once flag
 * reaching production — and none of those may be answered by doing less and
 * carrying on.
 */
import { describe, it, expect } from 'vitest';
import {
  BEYOND_CORE_GROUPS,
  BEYOND_CORE_BLOCKED,
  BeyondCoreConfigError,
  parseGroupList,
  resolveBeyondCoreGroups,
} from './index.js';

const dev = { all: false, isProduction: false };
const prod = { all: false, isProduction: true };

describe('parsing the list', () => {
  it('unset and empty are the same answer', () => {
    expect(parseGroupList(undefined)).toEqual([]);
    expect(parseGroupList('')).toEqual([]);
    // The #85 shape: `''` must not fall through to a default the way `??` lets
    // it. Asserted on the resolver too, not just the splitter.
    expect(resolveBeyondCoreGroups({ raw: '', ...prod }).enabled.size).toBe(0);
    expect(resolveBeyondCoreGroups({ raw: undefined, ...prod }).enabled.size).toBe(0);
  });

  it('tolerates the whitespace and trailing commas a hand-edited .env grows', () => {
    expect(parseGroupList(' survey , revenue ,')).toEqual(['survey', 'revenue']);
    expect(parseGroupList(',,survey,,')).toEqual(['survey']);
    expect(parseGroupList('   ')).toEqual([]);
  });
});

describe('enabling by name', () => {
  it('enables exactly what is named', () => {
    const r = resolveBeyondCoreGroups({ raw: 'survey,revenue', ...prod });
    expect([...r.enabled].sort()).toEqual(['revenue', 'survey']);
    expect(r.enabled.has('survey')).toBe(true);
    expect(r.enabled.has('coupon')).toBe(false);
  });

  it('names the groups in the summary, sorted, so a log line is readable', () => {
    const r = resolveBeyondCoreGroups({ raw: 'revenue,survey', ...prod });
    expect(r.summary).toBe('beyond-core: 2 group(s) enabled — revenue, survey');
  });

  it('says so plainly when nothing is on', () => {
    expect(resolveBeyondCoreGroups({ raw: '', ...prod }).summary).toBe(
      'beyond-core: no groups enabled',
    );
  });

  it('a repeated name is still one group', () => {
    const r = resolveBeyondCoreGroups({ raw: 'survey,survey', ...prod });
    expect(r.enabled.size).toBe(1);
  });
});

describe('an unknown name refuses the boot', () => {
  it('throws, and names the offender', () => {
    expect(() => resolveBeyondCoreGroups({ raw: 'survey,nonsense', ...prod })).toThrow(
      BeyondCoreConfigError,
    );
    expect(() => resolveBeyondCoreGroups({ raw: 'nonsense', ...prod })).toThrow(/"nonsense"/);
  });

  it('suggests the near miss, which is what a typo needs', () => {
    // The plural is the mistake a person actually makes.
    let message = '';
    try {
      resolveBeyondCoreGroups({ raw: 'loyalty-programs', ...prod });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/loyalty-program/);
    expect(message).toMatch(/Did you mean/);
  });

  it('does not enable the valid names alongside the bad one', () => {
    // Partial application is the failure mode this refusal exists to prevent.
    expect(() => resolveBeyondCoreGroups({ raw: 'survey,nope', ...prod })).toThrow();
  });
});

describe('a blocked group refuses the boot, with the reason', () => {
  it('refuses stock-alert however it is written into the config', () => {
    expect(() => resolveBeyondCoreGroups({ raw: 'stock-alert', ...prod })).toThrow(
      BeyondCoreConfigError,
    );
    expect(() => resolveBeyondCoreGroups({ raw: 'survey,stock-alert', ...dev })).toThrow(
      /stock-alert/,
    );
  });

  it('carries the reason into the message — the operator must learn why', () => {
    let message = '';
    try {
      resolveBeyondCoreGroups({ raw: 'stock-alert', ...prod });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/notifiedAt/);
    expect(message).toMatch(/never fire again|spent/);
  });

  it('blocks in development too — a rollout is a rollout wherever it is rehearsed', () => {
    expect(() => resolveBeyondCoreGroups({ raw: 'stock-alert', ...dev })).toThrow();
  });

  it('every blocked group is refused, not just the one we remembered', () => {
    for (const b of BEYOND_CORE_BLOCKED) {
      expect(() => resolveBeyondCoreGroups({ raw: b.group, ...prod }), b.group).toThrow(
        BeyondCoreConfigError,
      );
    }
  });
});

describe('FEATURE_BEYOND_CORE, the all-at-once shortcut', () => {
  it('is every group outside production — today’s dev and test surface, unchanged', () => {
    const r = resolveBeyondCoreGroups({ raw: '', all: true, isProduction: false });
    expect(r.enabled.size).toBe(BEYOND_CORE_GROUPS.length);
    // Including the blocked ones. Not an oversight: on a workstation this means
    // "this is a development machine", and narrowing it would change the
    // surface route-smoke sweeps.
    for (const b of BEYOND_CORE_BLOCKED) {
      expect(r.enabled.has(b.group), `${b.group} must stay on in dev`).toBe(true);
    }
    expect(r.summary).toMatch(/ALL 76 groups/);
  });

  it('is refused in production, and says what to use instead', () => {
    let message = '';
    try {
      resolveBeyondCoreGroups({ raw: '', all: true, isProduction: true });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/cannot be used in production/);
    expect(message).toMatch(/BEYOND_CORE_GROUPS/);
  });

  it('a blocked name in the list is refused even with the shortcut on', () => {
    // The list is checked before the shortcut short-circuits, so writing a
    // blocked group down is always an error even when it would have been on
    // anyway. Asking for it is the thing being refused.
    expect(() =>
      resolveBeyondCoreGroups({ raw: 'stock-alert', all: true, isProduction: false }),
    ).toThrow(/stock-alert/);
  });
});

describe('the default state', () => {
  it('production with nothing set enables nothing', () => {
    const r = resolveBeyondCoreGroups({ raw: '', all: false, isProduction: true });
    expect(r.enabled.size).toBe(0);
  });
});
