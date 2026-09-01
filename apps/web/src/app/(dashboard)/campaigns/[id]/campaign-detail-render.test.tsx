/**
 * The campaign detail page must actually put the poll report and the A/B
 * result on the screen.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - It renders the page's initial markup only. `environment: 'node'` has no
 *   DOM, so effects, hooks and clicks are out of reach. Nothing here proves a
 *   button works — only that the server-rendered output contains the numbers.
 * - It does not talk to the API. `apiFetch` is mocked, so the SHAPES below are
 *   this test's assumption about what the endpoints return. They are pinned
 *   against a real database by the integration test
 *   apps/api/src/routes/v1/campaign-reports-contract.integration.test.ts —
 *   if that one is deleted, these fixtures become fiction.
 * - It does not prove the CSS lands anywhere or that the card is visible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const routes = new Map<string, unknown>();

vi.mock('@/lib/api', () => ({
  apiFetch: async (path: string, opts?: { fallback?: unknown }) =>
    routes.has(path) ? routes.get(path) : opts?.fallback,
}));

vi.mock('@/lib/capabilities.server', () => ({
  getCapabilities: async () => ({ geoAnalytics: false }),
}));

vi.mock('./campaign-actions', () => ({ CampaignActions: () => null }));
vi.mock('./clone-campaign-button', () => ({ CloneCampaignButton: () => null }));

const { default: CampaignDetailPage } = await import('./page');

const CAMPAIGN = {
  id: 'c1',
  name: 'Podzimní newsletter',
  type: 'email',
  status: 'sent',
  pausedReason: null,
  subject: 'Ahoj',
  preheader: null,
  fromName: null,
  fromEmail: null,
  replyTo: null,
  scheduledAt: null,
  sentAt: '2026-09-01T08:00:00.000Z',
  totalSent: 1000,
  totalDelivered: 990,
  totalOpens: 300,
  totalClicks: 120,
  totalBounces: 10,
  totalUnsubscribes: 2,
  totalComplaints: 0,
  parentCampaignId: null,
  content: null,
  listId: null,
  segmentId: null,
  excludeSegmentId: null,
  abConfig: null,
  createdAt: '2026-08-30T08:00:00.000Z',
};

async function render(
  overrides: Record<string, unknown> & { __routes?: Record<string, unknown> } = {},
) {
  const { __routes = {}, ...campaign } = overrides;
  routes.clear();
  routes.set('/api/v1/campaigns/c1', { ...CAMPAIGN, ...campaign });
  for (const [path, value] of Object.entries(__routes)) {
    routes.set(path, value);
  }
  const el = (await CampaignDetailPage({
    params: Promise.resolve({ id: 'c1' }),
  })) as ReactElement;
  return renderToStaticMarkup(el);
}

beforeEach(() => routes.clear());

describe('matcher self-test', () => {
  it('renderToStaticMarkup really produces markup under environment: node', () => {
    const html = renderToStaticMarkup(<p>marker-9f3a</p>);
    expect(html).toContain('marker-9f3a');
    expect(html).toBe('<p>marker-9f3a</p>');
  });

  it('a campaign with neither poll nor A/B renders neither card', async () => {
    const html = await render();
    // If these two strings ever appear unconditionally, every assertion below
    // would pass with the cards wired to nothing.
    expect(html).not.toContain('Poll results');
    expect(html).not.toContain('A/B test');
  });
});

describe('poll report on the campaign detail page', () => {
  const POLLS = [
    {
      blockId: 'b1',
      question: 'Jak se ti líbí náš newsletter?',
      options: [
        { index: 0, label: 'Moc', votes: 30 },
        { index: 1, label: 'Jde to', votes: 10 },
        { index: 2, label: 'Vůbec', votes: 0 },
      ],
      totalVotes: 40,
    },
  ];

  it('renders the question, every option and its share of the vote', async () => {
    const html = await render({ __routes: { '/api/v1/campaigns/c1/poll-results': POLLS } });

    expect(html).toContain('Poll results');
    expect(html).toContain('Jak se ti líbí náš newsletter?');
    expect(html).toContain('Moc');
    expect(html).toContain('Jde to');
    expect(html).toContain('Vůbec');
    // 30 of 40 = 75.0%, 10 of 40 = 25.0%, 0 of 40 = 0.0% — and no NaN.
    expect(html).toContain('75.0%');
    expect(html).toContain('25.0%');
    expect(html).toContain('0.0%');
    expect(html).not.toContain('NaN');
  });

  it('shows a poll that nobody has answered yet instead of hiding it', async () => {
    const html = await render({
      __routes: {
        '/api/v1/campaigns/c1/poll-results': [
          {
            blockId: 'b1',
            question: 'Nezodpovězená otázka',
            options: [{ index: 0, label: 'Ano', votes: 0 }],
            totalVotes: 0,
          },
        ],
      },
    });

    expect(html).toContain('Nezodpovězená otázka');
    expect(html).toContain('0 votes');
    expect(html).not.toContain('NaN');
  });
});

describe('A/B result on the campaign detail page', () => {
  const AB_CONFIG = {
    variants: [
      { id: 'a', subject: 'Sleva 20 %', percentage: 10 },
      { id: 'b', subject: 'Jenom dnes', percentage: 10 },
    ],
    testDurationHours: 4,
  };

  const RESULT = {
    winnerVariantId: 'b',
    winnerMetric: 'click_rate',
    // decimal columns arrive as STRINGS and are fractions of 1
    winnerScore: '0.184000',
    runnerUpScore: '0.092000',
    confidencePct: '97.30',
    holdbackCount: 800,
    autoSendDispatched: true,
    decision: 'auto_send',
    decisionReason: null,
    dispatchedAt: '2026-09-01T12:00:00.000Z',
    selectedAt: '2026-09-01T12:00:00.000Z',
  };

  it('names the winner and converts the stored scales correctly', async () => {
    const html = await render({
      abConfig: AB_CONFIG,
      __routes: { '/api/v1/campaigns/c1/ab-result': RESULT },
    });

    expect(html).toContain('A/B test');
    expect(html).toContain('Jenom dnes');
    expect(html).toContain('winner');
    // score is a fraction → 18.40%; confidence is already a percentage → 97.3%
    expect(html).toContain('18.40%');
    expect(html).toContain('9.20%');
    expect(html).toContain('97.3%');
    // The two scales must not be confused: 0.18% would be the score left
    // unmultiplied, 9730.0% the confidence multiplied a second time.
    expect(html).not.toContain('0.18%');
    expect(html).not.toContain('9730');
    // 100 − (10 + 10) = 80 % holdback
    expect(html).toContain('80%');
  });

  it('says the test is still running rather than showing a blank card', async () => {
    const html = await render({ abConfig: AB_CONFIG });

    expect(html).toContain('A/B test');
    expect(html).toContain('No winner yet');
    expect(html).toContain('4 hours');
  });

  it('makes a needs_review decision and its unsent holdback loud', async () => {
    const html = await render({
      abConfig: AB_CONFIG,
      __routes: {
        '/api/v1/campaigns/c1/ab-result': {
          ...RESULT,
          confidencePct: '61.00',
          autoSendDispatched: false,
          dispatchedAt: null,
          decision: 'needs_review',
          decisionReason: 'Winner did not clear the 95% confidence threshold.',
        },
      },
    });

    expect(html).toContain('Needs review');
    expect(html).toContain('the holdback has not been sent');
    expect(html).toContain('Winner did not clear the 95% confidence threshold.');
    expect(html).toContain('not sent');
  });

  it('does not treat a single-variant config as an A/B test', async () => {
    const html = await render({ abConfig: { variants: [{ id: 'a', percentage: 100 }] } });
    expect(html).not.toContain('A/B test');
  });
});
