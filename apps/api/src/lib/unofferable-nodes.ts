/**
 * Workflow node types that must not be saved.
 *
 * The editor palette does not offer `cascade` — it is not in ADDABLE and the
 * string appears nowhere in apps/web. But the save route validates nodes as
 * `{ id: string, type: string }`, so anything can arrive through the API, a
 * workflow import or the marketplace, and the editor will happily render a node
 * it cannot create.
 *
 * A cascade step declares { channel, delayHours, condition } and nothing else:
 * no templateId, no subject, no body, no campaignId. It has nowhere to get the
 * content it is supposed to send, so since the queue payload contracts landed it
 * fails on every run. A workflow containing one looks built and never delivers.
 *
 * Refused rather than fixed: deciding where a cascade step gets its content is
 * a design question, not a bug fix.
 */

import { AppError } from './app-error.js';

export const UNOFFERABLE_NODE_TYPES: Record<string, string> = {
  cascade:
    'The cascade step has no content fields — no template, subject, body or ' +
    'campaign — so it cannot send anything and fails on every run. It is not ' +
    'offered in the editor and cannot be saved through the API.',
};

/** Throws when any node is of a type this product does not offer. */
export function assertNodesOfferable(
  nodes: ReadonlyArray<{ id: string; type: string }> | undefined,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    const reason = UNOFFERABLE_NODE_TYPES[node.type];
    if (reason) {
      throw new AppError({
        code: 'NODE_TYPE_NOT_OFFERED',
        statusCode: 400,
        message: `Node "${node.id}" is of type "${node.type}". ${reason}`,
      });
    }
  }
}
