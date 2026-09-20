import { describe, it, expect } from 'vitest';
import { assertWorkflowGraphAccepted } from './workflow-graph.js';
import { FLOW_TEMPLATES } from '../services/workflows/flow-templates.js';
import { WORKFLOW_TEMPLATES } from '../services/workflow-templates/registry.js';
import { buildWorkflowGraph, SEED_DEFS } from '../services/ticketing/seed-workflows.js';

/**
 * The one check every writer runs. That each door actually calls it is proved
 * against a real database in
 * integration/workflow-graph-checks.integration.test.ts.
 */

const ok = { id: 't', type: 'trigger', config: {} };

const problem = (nodes: unknown): { code?: string; message: string } | null => {
  try {
    assertWorkflowGraphAccepted(nodes);
    return null;
  } catch (err) {
    return { code: (err as { code?: string }).code, message: (err as Error).message };
  }
};

describe('a graph the executor cannot run is refused', () => {
  it.each([
    ['a node that is not an object', [ok, 'send_email'], 'INVALID_GRAPH_NODE'],
    ['a node with no id', [{ type: 'send_email', config: {} }], 'INVALID_GRAPH_NODE'],
    ['a node with no type', [{ id: 'x', config: {} }], 'INVALID_GRAPH_NODE'],
    ['a null config', [{ id: 'x', type: 'send_email', config: null }], 'INVALID_GRAPH_NODE'],
    ['a missing config', [{ id: 'x', type: 'send_email' }], 'INVALID_GRAPH_NODE'],
    ['an array config', [{ id: 'x', type: 'send_email', config: [] }], 'INVALID_GRAPH_NODE'],
    ['nodes that are not an array', { id: 'x' }, 'INVALID_GRAPH_NODE'],
    [
      'a node type this product does not offer',
      [{ id: 'c', type: 'cascade', config: { channel: 'email' } }],
      'NODE_TYPE_NOT_OFFERED',
    ],
    [
      'a wait the executor cannot time',
      [{ id: 'w', type: 'wait', config: { duration: { days: 1, hours: 0 } } }],
      'INVALID_WAIT_CONFIG',
    ],
  ])('%s', (_label, nodes, code) => {
    const p = problem(nodes);
    expect(p, 'the graph was accepted').not.toBeNull();
    expect(p!.code).toBe(code);
    expect(p!.message.length).toBeGreaterThan(0);
  });

  it('names which node is wrong', () => {
    expect(problem([ok, { id: 'w1', type: 'wait', config: null }])!.message).toContain('"w1"');
    expect(problem([ok, { type: 'send_email', config: {} }])!.message).toContain('#2');
  });
});

describe('and everything the executor can run is accepted', () => {
  it.each([
    ['no graph at all (a PUT that does not touch it)', undefined],
    ['an empty graph', []],
    [
      'a trigger and a timed wait',
      [ok, { id: 'w', type: 'wait', config: { duration: 1, unit: 'days' } }],
    ],
    ['an until wait', [{ id: 'w', type: 'wait', config: { until: { field: 'event.starts_at' } } }]],
    ['a node with an empty config', [{ id: 'e', type: 'send_email', config: {} }]],
  ])('%s', (_label, nodes) => {
    expect(problem(nodes)).toBeNull();
  });

  it('every graph this repo ships', () => {
    const graphs = [
      ...FLOW_TEMPLATES.map((t) => ({ id: t.id, nodes: t.nodes })),
      ...WORKFLOW_TEMPLATES.map((t) => ({ id: t.slug, nodes: t.nodes })),
      ...SEED_DEFS.map((d) => ({ id: d.key, nodes: buildWorkflowGraph(d).nodes })),
    ];
    // Not vacuous: measured at the time of writing, 103 graphs / 493 nodes.
    expect(graphs.length).toBeGreaterThan(100);
    expect(graphs.reduce((n, g) => n + g.nodes.length, 0)).toBeGreaterThan(400);

    const refused = graphs
      .map((g) => ({ id: g.id, problem: problem(g.nodes) }))
      .filter((g) => g.problem);
    expect(refused).toEqual([]);
  });
});
