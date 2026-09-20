import { describe, it, expect } from 'vitest';
import {
  deleteNode,
  insertAfter,
  linearize,
  whyNotDelete,
  whyNotInsertAfter,
  type Graph,
} from './graph-ops';

/**
 * The step list's graph edits. That the results run the way they read is
 * proved against a real database and a real executor in apps/api
 * integration/workflow-editor-branches.integration.test.ts, which loads this
 * same module by path.
 */

const node = (id: string, type = 'send_email') => ({ id, type, config: {} });

/** trigger → condition ⇒ yes | no */
const branched = (): Graph => ({
  nodes: [node('t', 'trigger'), node('c', 'condition'), node('yes'), node('no')],
  edges: [
    { id: 'e0', source: 't', target: 'c' },
    { id: 'e1', source: 'c', target: 'yes', label: 'true' },
    { id: 'e2', source: 'c', target: 'no', label: 'false' },
  ],
});

/** trigger → condition -[true]→ mail (the shape 21 shipped templates use) */
const oneSided = (): Graph => ({
  nodes: [node('t', 'trigger'), node('c', 'condition'), node('mail')],
  edges: [
    { id: 'e0', source: 't', target: 'c' },
    { id: 'e1', source: 'c', target: 'mail', label: 'true' },
  ],
});

const linear = (): Graph => ({
  nodes: [node('t', 'trigger'), node('a'), node('b')],
  edges: [
    { id: 'e0', source: 't', target: 'a' },
    { id: 'e1', source: 'a', target: 'b' },
  ],
});

/** Edges as "source -[label]-> target", sorted, so generated ids do not matter. */
const wiring = (g: Graph) =>
  g.edges.map((e) => `${e.source} -[${e.label ?? ''}]-> ${e.target}`).sort();

describe('a fork cannot be edited from the list', () => {
  it('no step can be inserted after a branching node, and it says why', () => {
    const reason = whyNotInsertAfter(branched().edges, 'c');
    expect(reason).toContain('branches');
    expect(() => insertAfter(branched(), 'c', node('new'))).toThrow(/branches/);
  });

  it('a branching node cannot be removed, and neither can the trigger', () => {
    const g = branched();
    expect(whyNotDelete(g.nodes[1]!, g.edges)).toContain('branches');
    expect(whyNotDelete(g.nodes[0]!, g.edges)).toContain('trigger');
    expect(() => deleteNode(g, 'c')).toThrow(/branches/);
  });

  it('everything else on the spine is still editable', () => {
    const g = linear();
    expect(whyNotInsertAfter(g.edges, 'a')).toBeNull();
    expect(whyNotDelete(g.nodes[1]!, g.edges)).toBeNull();
  });
});

describe('inserting keeps the label of the edge it splits', () => {
  it('on a labelled edge, the branch goes on pointing at its branch', () => {
    const after = insertAfter(oneSided(), 'c', node('new'));
    expect(wiring(after)).toEqual(['c -[true]-> new', 'new -[]-> mail', 't -[]-> c']);
  });

  it('on a plain edge, nothing gains a label', () => {
    expect(wiring(insertAfter(linear(), 'a', node('new')))).toEqual([
      'a -[]-> new',
      'new -[]-> b',
      't -[]-> a',
    ]);
  });

  it('after the last step, the new step is simply appended', () => {
    expect(wiring(insertAfter(linear(), 'b', node('new')))).toEqual([
      'a -[]-> b',
      'b -[]-> new',
      't -[]-> a',
    ]);
  });
});

describe('deleting keeps every way in, with its label', () => {
  it('the step on a branch is removed and the branch survives', () => {
    const g = branched();
    const withStep = insertAfter(g, 'yes', node('extra'));
    const after = deleteNode(withStep, 'yes');
    expect(wiring(after)).toEqual(['c -[false]-> no', 'c -[true]-> extra', 't -[]-> c']);
    expect(after.nodes.map((n) => n.id)).not.toContain('yes');
  });

  it('a middle step of a linear flow is stitched over', () => {
    expect(wiring(deleteNode(linear(), 'a'))).toEqual(['t -[]-> b']);
  });

  it('the last step leaves no dangling edge', () => {
    expect(wiring(deleteNode(linear(), 'b'))).toEqual(['t -[]-> a']);
  });

  it('two branches that meet again both keep their way through', () => {
    // c -[true]-> join, c -[false]-> join is two edges into one node.
    const g: Graph = {
      nodes: [node('t', 'trigger'), node('c', 'condition'), node('join'), node('end')],
      edges: [
        { id: 'e0', source: 't', target: 'c' },
        { id: 'e1', source: 'c', target: 'join', label: 'true' },
        { id: 'e2', source: 'c', target: 'join', label: 'false' },
        { id: 'e3', source: 'join', target: 'end' },
      ],
    };
    expect(wiring(deleteNode(g, 'join'))).toEqual([
      'c -[false]-> end',
      'c -[true]-> end',
      't -[]-> c',
    ]);
  });

  it('does not produce an edge from a node to itself', () => {
    const g: Graph = {
      nodes: [node('t', 'trigger'), node('a')],
      edges: [
        { id: 'e0', source: 't', target: 'a' },
        { id: 'e1', source: 'a', target: 't' },
      ],
    };
    // Deleting `a` would join t → t; the API refuses that, so it is dropped.
    expect(wiring(deleteNode(g, 'a'))).toEqual([]);
  });
});

describe('linearize', () => {
  it('stops at the fork and lists the branches as orphans', () => {
    const { spine, orphans } = linearize(branched().nodes, branched().edges);
    expect(spine.map((n) => n.id)).toEqual(['t', 'c']);
    expect(orphans.map((n) => n.id)).toEqual(['yes', 'no']);
  });

  it('walks a one-sided branch as an ordinary step', () => {
    const { spine, orphans } = linearize(oneSided().nodes, oneSided().edges);
    expect(spine.map((n) => n.id)).toEqual(['t', 'c', 'mail']);
    expect(orphans).toEqual([]);
  });
});
