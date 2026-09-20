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

const problem = (nodes: unknown, edges?: unknown): { code?: string; message: string } | null => {
  try {
    assertWorkflowGraphAccepted(nodes, edges);
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

  it('every graph this repo ships, edges included', () => {
    const graphs = [
      ...FLOW_TEMPLATES.map((t) => ({ id: t.id, nodes: t.nodes, edges: t.edges })),
      ...WORKFLOW_TEMPLATES.map((t) => ({ id: t.slug, nodes: t.nodes, edges: t.edges })),
      ...SEED_DEFS.map((d) => ({ id: d.key, ...buildWorkflowGraph(d) })),
    ];
    // Not vacuous: measured at the time of writing, 103 graphs / 493 nodes /
    // 392 edges, none dangling, none duplicated, no self-loops.
    expect(graphs.length).toBeGreaterThan(100);
    expect(graphs.reduce((n, g) => n + g.nodes.length, 0)).toBeGreaterThan(400);
    expect(graphs.reduce((n, g) => n + g.edges.length, 0)).toBeGreaterThan(300);

    const refused = graphs
      .map((g) => ({ id: g.id, problem: problem(g.nodes, g.edges) }))
      .filter((g) => g.problem);
    expect(refused).toEqual([]);
  });
});

describe('an edge the executor cannot follow is refused', () => {
  const nodes = [
    ok,
    { id: 'a', type: 'add_tag', config: {} },
    { id: 'b', type: 'add_tag', config: {} },
  ];
  const edge = (over: Record<string, unknown>) => ({ id: 'e1', source: 't', target: 'a', ...over });

  it.each([
    ['edges that are not an array', { id: 'e' }],
    ['an edge that is not an object', ['e1']],
    ['an edge with no id', [{ source: 't', target: 'a' }]],
    ['an edge with no source', [edge({ source: undefined })]],
    ['an edge with no target', [edge({ target: 42 })]],
    ['a label that is not a string', [edge({ label: 3 })]],
    ['a target that is not a node here', [edge({ target: 'ghost' })]],
    ['a source that is not a node here', [edge({ source: 'ghost' })]],
    ['an edge from a node to itself', [edge({ source: 'a', target: 'a' })]],
    ['two unlabelled edges out of one node', [edge({}), { id: 'e2', source: 't', target: 'b' }]],
    [
      'two edges out of one node with the same label',
      [edge({ label: 'true' }), { id: 'e2', source: 't', target: 'b', label: 'true' }],
    ],
  ])('%s', (_label, edges) => {
    const p = problem(nodes, edges);
    expect(p, 'the graph was accepted').not.toBeNull();
    expect(p!.code).toBe('INVALID_GRAPH_EDGE');
  });

  it.each([
    ['no edges at all (a PUT that does not touch them)', undefined],
    ['an empty list', []],
    ['a linear edge', [edge({})]],
    [
      'a condition with both branches',
      [
        { id: 'e1', source: 't', target: 'a', label: 'true' },
        { id: 'e2', source: 't', target: 'b', label: 'false' },
      ],
    ],
    [
      'two nodes pointing at the same next step',
      [
        { id: 'e1', source: 't', target: 'a' },
        { id: 'e2', source: 'a', target: 'b' },
        { id: 'e3', source: 'b', target: 'a', label: 'again' },
      ],
    ],
  ])('accepts %s', (_label, edges) => {
    expect(problem(nodes, edges)).toBeNull();
  });

  it('names the edge and what is wrong with it', () => {
    const p = problem(nodes, [edge({ id: 'broken', target: 'ghost' })])!;
    expect(p.message).toContain('"broken"');
    expect(p.message).toContain('ghost');
  });

  it('a node id that no longer exists is caught when only the nodes are replaced', () => {
    // What updateWorkflow guards: new nodes, stored edges.
    expect(problem([ok], [{ id: 'e1', source: 't', target: 'a' }])!.code).toBe(
      'INVALID_GRAPH_EDGE',
    );
  });
});
