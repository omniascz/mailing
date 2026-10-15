import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HIDDEN_WORKFLOW_TEMPLATES, isHiddenWorkflowTemplate } from './hidden-templates.js';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from './registry.js';
import { BUILT_IN_EMAIL_KEY } from './email-content.js';
import { TEMPLATES, getTemplateById } from '../editor/templates/index.js';

/**
 * Which template nodes are informational e-mails of an order, and which forks
 * migration 0038 re-marks — one list, held equal here (Z163; Michal, 15. 10.
 * 19:40, point 1c a)+b)+c)). The migration itself is walked against a real
 * database, with real forks, in apps/workers/src/integration/
 * purchase-event-transactional.integration.test.ts.
 */

const MIGRATION = new URL(
  '../../../drizzle/0038_flow_order_info_transactional.sql',
  import.meta.url,
);

type Node = WorkflowTemplate['nodes'][number];

interface Row {
  slug: string;
  triggerType: string;
  eventName: string | null;
  nodeId: string;
  builtInId: string;
  subject: string;
  emailName: string;
}

/** The VALUES rows of the migration's `info` table, as written. */
function migrationRows(): Row[] {
  const text = readFileSync(MIGRATION, 'utf8');
  const rows: Row[] = [];
  for (const line of text.split('\n')) {
    if (!/^\s*\('/.test(line)) continue;
    const cells: (string | null)[] = [];
    for (const m of line.matchAll(/'((?:[^']|'')*)'|NULL/g)) {
      cells.push(m[0] === 'NULL' ? null : m[1]!.replace(/''/g, "'"));
    }
    expect(cells, line).toHaveLength(7);
    const [slug, triggerType, eventName, nodeId, builtInId, subject, emailName] = cells;
    rows.push({
      slug: slug!,
      triggerType: triggerType!,
      eventName: eventName ?? null,
      nodeId: nodeId!,
      builtInId: builtInId!,
      subject: subject!,
      emailName: emailName!,
    });
  }
  return rows;
}

/** Would conditions (i)–(iv) of the migration take this node of this template for `row`? */
function matches(t: WorkflowTemplate, node: Node, row: Row): boolean {
  const config = node.config as Record<string, unknown>;
  const eventName = (t.trigger.config as { eventName?: unknown }).eventName;
  return (
    t.trigger.type === row.triggerType &&
    (row.eventName === null || eventName === row.eventName) &&
    node.id === row.nodeId &&
    node.type === 'send_email' &&
    config[BUILT_IN_EMAIL_KEY] === row.builtInId &&
    config.subject === row.subject
  );
}

const key = (slug: string, nodeId: string) => `${slug} ${nodeId}`;
const priorityOf = (node: Node) => (node.config as { priority?: unknown }).priority;

/** Every template node with a priority of any kind. */
const marked: { t: WorkflowTemplate; n: Node }[] = [];
for (const t of WORKFLOW_TEMPLATES) {
  for (const n of t.nodes) {
    if (priorityOf(n) !== undefined) marked.push({ t, n });
  }
}
const markedKeys = marked.map(({ t, n }) => key(t.slug, n.id)).sort();

describe('the informational nodes of an order (Z163)', () => {
  it('exactly seven template nodes carry a priority, all of them transactional', () => {
    expect(markedKeys).toEqual([
      'payment-pending-cs e1',
      'pickup-invoice-cs e1',
      'pickup-invoice-cs e2',
      'post-purchase-cs e1',
      'post-purchase-cs e2',
      'post-purchase-cs e3',
      'transactional-order-confirmation e1',
    ]);
    for (const { n } of marked) expect(priorityOf(n)).toBe('transactional');
  });

  it('the migration re-marks the same seven, with their trigger, e-mail and subject', () => {
    const rows = migrationRows();
    expect(rows.map((r) => key(r.slug, r.nodeId)).sort()).toEqual(markedKeys);
    for (const row of rows) {
      const t = WORKFLOW_TEMPLATES.find((x) => x.slug === row.slug)!;
      const node = t.nodes.find((n) => n.id === row.nodeId)!;
      expect(matches(t, node, row), key(row.slug, row.nodeId)).toBe(true);
      expect(row.emailName).toBe(getTemplateById(row.builtInId)!.name);
    }
  });

  it('no node of another template, hidden ones included, matches a migration row', () => {
    const rows = migrationRows();
    const stray: string[] = [];
    for (const t of WORKFLOW_TEMPLATES) {
      for (const node of t.nodes) {
        for (const row of rows) {
          if (row.slug !== t.slug && matches(t, node, row)) {
            stray.push(`${key(t.slug, node.id)} ~ ${key(row.slug, row.nodeId)}`);
          }
        }
      }
    }
    expect(stray).toEqual([]);
  });

  it('the hidden templates carry no priority at all (Z162: their mixed nodes wait)', () => {
    const hidden = WORKFLOW_TEMPLATES.filter((t) => isHiddenWorkflowTemplate(t.slug));
    expect(hidden).toHaveLength(Object.keys(HIDDEN_WORKFLOW_TEMPLATES).length);
    expect(marked.filter(({ t }) => isHiddenWorkflowTemplate(t.slug))).toEqual([]);
  });

  it('the marketing nodes on purchase_event stay without a priority', () => {
    const unmarked: string[] = [];
    for (const t of WORKFLOW_TEMPLATES) {
      if (t.trigger.type !== 'purchase_event') continue;
      for (const n of t.nodes) {
        if (n.type !== 'send_email' || priorityOf(n) !== undefined) continue;
        unmarked.push(key(t.slug, n.id));
      }
    }
    expect(unmarked).toContain('post-purchase-cs e4');
    expect(unmarked).toContain('cross-sell-cs e1');
    expect(unmarked).toContain('cross-sell-related-products e1');
    expect(unmarked).toContain('cross-sell-category-affinity e1');
  });

  it('each re-marked e-mail has a name of its own in the catalogue (the fork finds it so)', () => {
    for (const row of migrationRows()) {
      const ids = TEMPLATES.filter((x) => x.name === row.emailName).map((x) => x.id);
      expect(ids, row.emailName).toEqual([row.builtInId]);
    }
  });
});
