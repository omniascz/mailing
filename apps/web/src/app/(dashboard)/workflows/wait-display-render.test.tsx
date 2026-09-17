/**
 * The workflow detail page and the template gallery must say how long a wait
 * step waits — for every shape the executor times, and for the old
 * `{ duration: { days, hours } }` object that can still sit in the database
 * until someone re-saves the workflow.
 *
 * Both pages read `duration` as `{ days, hours }` only, so the shape every
 * template and the editor write, `{ duration: 1, unit: 'days' }`, came out as
 * "immediate" — and an `until` string came out as "Until undefined".
 *
 * WHAT THIS TEST CANNOT SEE
 * - It renders the server components' initial markup with `apiFetch` mocked;
 *   the node shapes are this file's fixtures. The executor side of each shape
 *   is apps/api services/workflows/actions.ts executeWait.
 * - It does not prove the text is visible (CSS, layout).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const routes = new Map<string, unknown>();

vi.mock('@/lib/api', () => ({
  apiFetch: async (path: string, opts?: { fallback?: unknown }) =>
    routes.has(path) ? routes.get(path) : opts?.fallback,
}));
vi.mock('./gallery/fork-button', () => ({ ForkButton: () => null }));

const { default: WorkflowDetailPage } = await import('./[id]/page');
const { default: TemplateDetailPage } = await import('./gallery/[slug]/page');

const graph = (waitConfig: unknown) => ({
  nodes: [
    { id: 't', type: 'trigger', config: { triggerType: 'manual' } },
    { id: 'w1', type: 'wait', config: waitConfig },
    { id: 'e1', type: 'send_email', config: { subject: 'Ahoj' } },
  ],
  edges: [
    { id: 'a', source: 't', target: 'w1' },
    { id: 'b', source: 'w1', target: 'e1' },
  ],
});

/** Text content of the markup, tags removed and entities decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

async function renderDetail(waitConfig: unknown): Promise<string[]> {
  routes.clear();
  routes.set('/api/v1/workflows/wf1', {
    id: 'wf1',
    name: 'Flow',
    description: null,
    status: 'draft',
    triggerType: 'manual',
    triggerConfig: {},
    ...graph(waitConfig),
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
  const el = (await WorkflowDetailPage({ params: Promise.resolve({ id: 'wf1' }) })) as ReactElement;
  return text(renderToStaticMarkup(el));
}

async function renderGallery(waitConfig: unknown): Promise<string[]> {
  routes.clear();
  routes.set('/api/v1/workflow-templates/tpl', {
    slug: 'tpl',
    name: 'Template',
    category: 'welcome',
    description: 'd',
    recommendedFor: [],
    locale: 'en',
    steps: 3,
    trigger: { type: 'manual', config: {} },
    ...graph(waitConfig),
  });
  const el = (await TemplateDetailPage({
    params: Promise.resolve({ slug: 'tpl' }),
  })) as ReactElement;
  return text(renderToStaticMarkup(el));
}

/** The line rendered right under the step titled "Wait". */
const waitSubtitle = (lines: string[]) => {
  const i = lines.indexOf('Wait');
  expect(i, `no "Wait" step rendered in: ${lines.join(' | ')}`).toBeGreaterThanOrEqual(0);
  return lines[i + 1];
};

const CASES: Array<[string, unknown, string]> = [
  ['one day', { duration: 1, unit: 'days' }, '1 day'],
  ['hours', { duration: 2, unit: 'hours' }, '2 hours'],
  ['minutes', { duration: 30, unit: 'minutes' }, '30 minutes'],
  ['zero', { duration: 0, unit: 'hours' }, 'No delay'],
  ['executor defaults (1, hours)', {}, '1 hour'],
  ['a unit the executor reads as days', { duration: 3, unit: 'weeks' }, '3 days'],
  ['an ISO until', { until: '2030-01-01T09:00:00Z' }, 'Until 2030-01-01 09:00 UTC'],
  [
    'an event-relative until before',
    { until: { field: 'event.starts_at', offsetHours: -24 } },
    '1 day before event.starts_at',
  ],
  [
    'an event-relative until after',
    { until: { field: 'event.starts_at', offsetHours: 1, offsetMinutes: 30 } },
    '1 hour 30 minutes after event.starts_at',
  ],
  ['an event-relative until at', { until: { field: 'order.shipped_at' } }, 'At order.shipped_at'],
  [
    'an until the executor cannot resolve',
    { until: { event: 'order_packed' } },
    'Skipped — no date field to wait for',
  ],
  [
    'the old object, still in the database',
    { duration: { days: 1, hours: 6 } },
    '1 day 6 hours — old format; runs fail on this step until it is saved again in the editor',
  ],
];

describe.each([
  ['workflow detail', renderDetail],
  ['template gallery', renderGallery],
])('%s shows how long a wait waits', (_page, render) => {
  beforeEach(() => routes.clear());

  it.each(CASES)('%s', async (_label, config, expected) => {
    const lines = await render(config);
    expect(waitSubtitle(lines)).toBe(expected);
  });
});
