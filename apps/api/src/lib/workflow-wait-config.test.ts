import { describe, it, expect } from 'vitest';
import { assertWaitConfigsValid, waitConfigProblem } from './workflow-wait-config.js';
import { FLOW_TEMPLATES } from '../services/workflows/flow-templates.js';
import { WORKFLOW_TEMPLATES } from '../services/workflow-templates/registry.js';
import { buildWorkflowGraph, SEED_DEFS } from '../services/ticketing/seed-workflows.js';

/**
 * The save-time check for wait steps. The executor side of the contract, and
 * the web app's form and editor, are exercised against a real database in
 * integration/workflow-wait-from-ui.integration.test.ts.
 */

describe('waitConfigProblem refuses what the executor cannot time', () => {
  it.each([
    ['the shape the form and editor used to write', { duration: { days: 1, hours: 0 } }],
    ['a string duration', { duration: '1', unit: 'days' }],
    ['a negative duration', { duration: -1, unit: 'hours' }],
    ['NaN', { duration: Number.NaN, unit: 'hours' }],
    ['a unit the executor does not name', { duration: 1, unit: 'weeks' }],
    ['an until string that is not a date', { until: 'tomorrow-ish' }],
    ['an until of the wrong type', { until: 5 }],
    ['a config that is not an object', 'one day'],
    // executeWait reads config.until first: a missing config throws there.
    ['no config at all', undefined],
    ['a null config', null],
  ])('%s', (_label, config) => {
    expect(waitConfigProblem(config)).not.toBeNull();
  });
});

describe('and accepts everything the executor can', () => {
  it.each([
    ['duration and unit', { duration: 1, unit: 'days' }],
    ['every unit', { duration: 30, unit: 'minutes' }],
    ['zero', { duration: 0, unit: 'hours' }],
    ['no unit (executor default: hours)', { duration: 2 }],
    ['an empty config (executor default: 1 hour)', {}],
    ['an ISO until', { until: '2030-01-01T09:00:00Z' }],
    ['an event-relative until', { until: { field: 'event.starts_at', offsetHours: -24 } }],
    ['an until the executor skips rather than fails on', { until: { event: 'order_packed' } }],
  ])('%s', (_label, config) => {
    expect(waitConfigProblem(config)).toBeNull();
  });

  it('every wait in every template and seed this repo ships', () => {
    const graphs = [
      ...FLOW_TEMPLATES.map((t) => ({ id: t.id, nodes: t.nodes })),
      ...WORKFLOW_TEMPLATES.map((t) => ({ id: t.slug, nodes: t.nodes })),
      ...SEED_DEFS.map((d) => ({ id: d.key, nodes: buildWorkflowGraph(d).nodes })),
    ];
    const waits = graphs.flatMap((g) =>
      g.nodes.filter((n) => n.type === 'wait').map((n) => ({ template: g.id, node: n })),
    );
    // Not vacuous: the check below must have had waits to look at. Measured at
    // the time of writing: 136 waits across 103 graphs.
    expect(waits.length).toBeGreaterThan(100);

    const refused = waits
      .map((w) => ({ ...w, problem: waitConfigProblem(w.node.config) }))
      .filter((w) => w.problem);
    expect(refused).toEqual([]);
  });
});

describe('assertWaitConfigsValid', () => {
  it('names the node and throws a 400 INVALID_WAIT_CONFIG', () => {
    try {
      assertWaitConfigsValid([
        { id: 't', type: 'trigger', config: {} },
        { id: 'w1', type: 'wait', config: { duration: { days: 1 } } },
      ]);
      expect.unreachable('a broken wait was accepted');
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_WAIT_CONFIG', statusCode: 400 });
      expect((err as Error).message).toContain('"w1"');
    }
  });

  it('only looks at wait nodes', () => {
    // A send_email with a `duration` key of its own is none of this check's business.
    expect(() =>
      assertWaitConfigsValid([{ id: 'e', type: 'send_email', config: { duration: 'x' } }]),
    ).not.toThrow();
    expect(() => assertWaitConfigsValid(undefined)).not.toThrow();
  });
});
