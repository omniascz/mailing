/**
 * The graph edits the step list can make without breaking a branched flow.
 *
 * This editor shows one linear spine (see `linearize`); branches hang off it
 * and are listed as "outside the main flow". The edits used to ignore that:
 *
 *   - inserting a step after a node whose outgoing edge carried a label
 *     replaced that edge with two unlabelled ones, so a condition lost the
 *     branch it pointed at and the run ended there;
 *   - inserting after a node with two branches added a THIRD, unlabelled edge
 *     — measured: the API stores it, and the executor never takes it, so the
 *     new step simply never runs;
 *   - deleting a branching node stitched only its FIRST branch back in and
 *     left the other one with no way in.
 *
 * So the operations that can be done correctly carry the labels through, and
 * the two that cannot be expressed in a list — editing at a fork — are refused
 * here and not offered in the UI, with the reason. Branch editing needs the
 * canvas; this module's job is to not silently break a flow in the meantime.
 *
 * No `@/` imports: apps/api's integration suite loads this file by path and
 * runs these exact functions against a real database.
 */

export interface GraphNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** Generic in the node so the editor keeps its own stricter node type. */
export interface Graph<N extends GraphNode = GraphNode> {
  nodes: N[];
  edges: GraphEdge[];
}

export const outgoingEdges = (edges: GraphEdge[], nodeId: string): GraphEdge[] =>
  edges.filter((e) => e.source === nodeId);

/** A node the executor branches at: more than one way out. */
export const isFork = (edges: GraphEdge[], nodeId: string): boolean =>
  outgoingEdges(edges, nodeId).length > 1;

/**
 * Walk the graph from the trigger via outgoing edges. Stops at the first
 * branch — branches are kept as orphans shown below the main flow so users
 * notice them. For unbranched workflows (the common case) this gives a clean
 * linear list to edit.
 */
export function linearize<N extends GraphNode>(
  nodes: N[],
  edges: GraphEdge[],
): { spine: N[]; orphans: N[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.source) ?? [];
    arr.push(e);
    outgoing.set(e.source, arr);
  }
  const start = nodes.find((n) => n.type === 'trigger');
  if (!start) return { spine: nodes, orphans: [] };

  const spine: N[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start.id;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const node = byId.get(cur);
    if (node) spine.push(node);
    const outs: GraphEdge[] = outgoing.get(cur) ?? [];
    if (outs.length === 1) cur = outs[0]!.target;
    else cur = undefined; // branch or end
  }
  return { spine, orphans: nodes.filter((n) => !seen.has(n.id)) };
}

/** Why a step cannot be inserted after this one, or null when it can. */
export function whyNotInsertAfter(edges: GraphEdge[], nodeId: string): string | null {
  if (isFork(edges, nodeId)) {
    return 'This step branches. A step added here would sit on no branch and never run — branch editing is coming with the canvas.';
  }
  return null;
}

/** Why this step cannot be removed, or null when it can. */
export function whyNotDelete(node: GraphNode, edges: GraphEdge[]): string | null {
  if (node.type === 'trigger') return 'The trigger is where every run starts.';
  if (isFork(edges, node.id)) {
    return 'This step branches. Removing it here would keep one branch and strand the other — branch editing is coming with the canvas.';
  }
  return null;
}

/**
 * Put `node` on the edge leaving `afterNodeId`.
 *
 * The label of that edge stays on the FIRST half: a condition's `true` edge
 * goes on pointing at the branch, which now starts with the new step. The
 * second half is a plain edge, which is what the executor follows from a step
 * that does not branch.
 */
export function insertAfter<N extends GraphNode>(
  graph: Graph<N>,
  afterNodeId: string,
  node: N,
): Graph<N> {
  const reason = whyNotInsertAfter(graph.edges, afterNodeId);
  if (reason) throw new Error(reason);

  const [existing] = outgoingEdges(graph.edges, afterNodeId);
  const nodes = [...graph.nodes, node];

  if (!existing) {
    return {
      nodes,
      edges: [...graph.edges, { id: freshEdgeId(), source: afterNodeId, target: node.id }],
    };
  }

  return {
    nodes,
    edges: [
      ...graph.edges.filter((e) => e.id !== existing.id),
      {
        id: freshEdgeId(),
        source: afterNodeId,
        target: node.id,
        ...(existing.label === undefined ? {} : { label: existing.label }),
      },
      { id: freshEdgeId(), source: node.id, target: existing.target },
    ],
  };
}

/**
 * Remove a step and join what pointed at it to what it pointed at.
 *
 * Every incoming edge is rejoined, not just the first, and each keeps its own
 * label — otherwise deleting the step on a condition's `true` branch would
 * turn that branch into an unlabelled edge the executor never takes. An edge
 * that would point a node at itself, or repeat a (source, label) pair the
 * graph already has, is dropped: the API refuses both (#192).
 */
export function deleteNode<N extends GraphNode>(graph: Graph<N>, nodeId: string): Graph<N> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return graph;
  const reason = whyNotDelete(node, graph.edges);
  if (reason) throw new Error(reason);

  const incoming = graph.edges.filter((e) => e.target === nodeId);
  const [outgoing] = outgoingEdges(graph.edges, nodeId);
  const kept = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  const taken = new Set(kept.map((e) => `${e.source}\u0000${e.label ?? ''}`));

  const stitched: GraphEdge[] = [];
  if (outgoing) {
    for (const edge of incoming) {
      if (edge.source === outgoing.target) continue;
      const key = `${edge.source}\u0000${edge.label ?? ''}`;
      if (taken.has(key)) continue;
      taken.add(key);
      stitched.push({
        id: freshEdgeId(),
        source: edge.source,
        target: outgoing.target,
        ...(edge.label === undefined ? {} : { label: edge.label }),
      });
    }
  }

  return { nodes: graph.nodes.filter((n) => n.id !== nodeId), edges: [...kept, ...stitched] };
}

export function freshEdgeId(): string {
  return `e-${Math.random().toString(36).slice(2, 10)}`;
}

export function freshNodeId(): string {
  return `n-${Math.random().toString(36).slice(2, 10)}`;
}
