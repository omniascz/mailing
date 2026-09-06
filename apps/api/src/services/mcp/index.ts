/**
 * Every MCP tool, in one list.
 *
 * Areas are added here as whole units rather than one tool at a time, because a
 * half-covered area is worse than none: an assistant that can find a campaign
 * but not read its numbers will invent the numbers.
 *
 * PLANNED SHAPE — roughly 45 tools, in areas, not 260 wrappers:
 *
 *   1. campaign performance      3   ← #138
 *   2. contacts                  4   ← this PR: find, overview, activity, suppress
 *   3. flows                     3   ← this PR: find, performance by step, pause
 *   4. audience & segments       5   find/describe a segment, size it, who is in it
 *   5. campaign authoring        6   draft, schedule, pause, duplicate, send test
 *   6. deliverability            7   domain + DKIM health, blacklist, seed test,
 *                                    bounce reasons, reputation, warmup state
 *   7. transactional send        3   the existing send_email / send_sms, tidied
 *   8. revenue & attribution     4   revenue by campaign, by channel, RFM
 *   9. account & billing         3   plan, usage, sending limits
 *  10. content                   4   templates, brand kit, spam/accessibility check
 *
 * Batches in that order, one area per PR, each with the isolation tests this
 * one establishes. The order follows what an assistant is asked first, not the
 * shape of the service directory.
 */

import { campaignPerformanceTools } from './tools/campaign-performance.js';
import { contactTools } from './tools/contacts.js';
import { flowTools } from './tools/flows.js';
import { legacyTools } from './tools/legacy.js';
import { toJsonSchema, type McpTool } from './registry.js';

export const ALL_TOOLS: McpTool[] = [
  ...campaignPerformanceTools,
  ...contactTools,
  ...flowTools,
  ...legacyTools,
];

/** The `tools/list` payload, derived from the same schemas the handlers parse with. */
export function describeTools() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: toJsonSchema(t.input),
  }));
}

export function findTool(name: string): McpTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export * from './registry.js';
