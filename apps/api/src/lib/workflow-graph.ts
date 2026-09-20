/**
 * What a workflow graph has to look like before it is written.
 *
 * There are five doors into the `workflows` table and each one used to check a
 * different amount:
 *
 *   POST/PUT /api/v1/workflows      Zod `{ id, type }` + offerable + wait (#189)
 *   POST /workflows/templates/:id/use   nothing
 *   POST /workflow-templates/:slug/fork wait only (#190)
 *   POST /workflows/import              wait only (#190)
 *   sandbox copy / ticketing seed       nothing
 *
 * Measured before this module: an import blob with a `cascade` node was stored
 * with 201 while the same node over REST was refused with 400, and a node with
 * `config: null` answered 500 — `remapNodeRefs` calls `Object.entries(config)`
 * (services/workflows/export.ts) and that throws on null. Over REST the same
 * node was stored, and then every run failed on it: executeAction reads
 * `node.config.<field>` for all but two node types.
 *
 * So the checks live here, together, and the writers call this one function:
 * createWorkflow and updateWorkflow (which covers POST, PUT, fork and the
 * template "use" route), importWorkflow, and the ticketing seed.
 *
 * Deliberately NOT checked here:
 *   - edges. Nothing today refuses a graph for its edges, and inventing rules
 *     for them is a separate question (an edge to a node that does not exist
 *     ends the run, it does not break it).
 *   - the sandbox copy. It copies rows this org already has, node for node;
 *     they were checked at their own door, nothing new is authored, and
 *     refusing here would fail the whole sandbox over a workflow the customer
 *     can already run.
 *
 * Every graph this repo ships passes (asserted in workflow-graph.test.ts).
 */

import { AppError } from './app-error.js';
import { assertNodesOfferable } from './unofferable-nodes.js';
import { assertWaitConfigsValid } from './workflow-wait-config.js';

export interface GraphNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

function reject(message: string): never {
  throw new AppError({ code: 'INVALID_GRAPH_NODE', statusCode: 400, message });
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Throws a 400 unless every node is one the executor can run: a string id, a
 * string type, an object config, a type this product offers, and — for wait
 * steps — a delay the executor can time.
 *
 * `undefined` means "this write does not touch the graph" (PUT without nodes)
 * and passes.
 */
export function assertWorkflowGraphAccepted(nodes: unknown): void {
  if (nodes === undefined) return;
  if (!Array.isArray(nodes)) reject('nodes must be an array.');

  for (const [index, node] of nodes.entries()) {
    const where = `Node #${index + 1}`;
    if (!isPlainObject(node)) reject(`${where} is not an object.`);
    if (typeof node.id !== 'string' || node.id.length === 0) {
      reject(`${where} has no id.`);
    }
    if (typeof node.type !== 'string' || node.type.length === 0) {
      reject(`Node "${node.id}" has no type.`);
    }
    // executeAction reads node.config.<field> for every type but trigger and
    // unsubscribe, and remapNodeRefs reads it for all of them on import.
    if (!isPlainObject(node.config)) {
      reject(
        `Node "${node.id}" has no config object` + (node.config === null ? ' (it is null).' : '.'),
      );
    }
  }

  const typed = nodes as GraphNode[];
  assertNodesOfferable(typed);
  assertWaitConfigsValid(typed);
}
