/**
 * The pre-send panel: what it shows for each verdict, and what a confirmation
 * sends.
 *
 * WHAT THIS TEST CANNOT SEE
 * - `environment: 'node'` has no DOM: the panel is rendered for its markup,
 *   nothing is clicked. The clicks, the request bodies and the server's real
 *   answers are apps/web/e2e/pre-send-panel.spec.ts.
 * - The report shapes below are the ones the server returned in Z125's
 *   integration run (deliverability-gate.integration.test.ts output), not
 *   invented ones.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: unknown;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children as string}
    </a>
  ),
}));

const { PreSendPanel, FailureView } = await import('./pre-send-panel');
const { confirmBody, canConfirm, describeMetrics, readFailure, ACKNOWLEDGE_FIELD } =
  await import('./pre-send-report');
import type { PreSendReport } from './pre-send-report';

const BAD: PreSendReport = {
  verdict: 'no-go',
  checks: [
    {
      id: 'bounce-rate',
      severity: 'fail',
      title: 'Recent 7-day bounce rate 15.0% — over ISP threshold',
      detail: 'Sending while bounce rate is above 5% risks suspension. Clean your list first.',
      metrics: { bounceRatePct: 15, thresholdPct: 5, sampleSize: 100, minSample: 100 },
    },
    {
      id: 'complaint-rate',
      severity: 'info',
      title: 'Not enough recent history to judge: 85 of 100 delivered messages',
      metrics: {
        complaintRatePct: 1.1764705882352942,
        sample7d: 85,
        sample24h: 85,
        minSample: 100,
      },
    },
    {
      id: 'subject',
      severity: 'warn',
      title: 'Subject line too short',
      metrics: { subjectLength: 4 },
    },
    { id: 'domain-auth', severity: 'pass', title: 'Sending domain fully authenticated' },
  ],
};
const GOOD: PreSendReport = {
  verdict: 'go',
  checks: [{ id: 'domain-auth', severity: 'pass', title: 'Sending domain fully authenticated' }],
};

const render = (report: PreSendReport | null, acknowledged = false) =>
  renderToStaticMarkup(
    <PreSendPanel
      campaignId="c1"
      intent="send"
      report={report}
      loading={false}
      acknowledged={acknowledged}
      onAcknowledge={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
      confirming={false}
    />,
  );
/** Whether the confirm button carries the `disabled` attribute (its class names mention it too). */
const confirmTag = (html: string) =>
  / disabled=""/.test(html.match(/<button[^>]*data-testid="pre-send-confirm"[^>]*>/)![0])
    ? 'disabled'
    : 'enabled';

describe('matcher self-test', () => {
  it('the panel renders, and the two verdicts render differently', () => {
    expect(render(GOOD)).toContain('pre-send-panel');
    expect(render(GOOD)).not.toEqual(render(BAD));
    expect(confirmTag(render(BAD))).toContain('disabled');
    expect(confirmTag(render(GOOD))).not.toContain('disabled');
  });
});

describe('what the panel shows', () => {
  it('go: the confirm button is live, there is nothing to acknowledge', () => {
    const html = render(GOOD);
    expect(html).toContain('Kampaň je připravená k odeslání.');
    expect(confirmTag(html)).not.toContain('disabled');
    expect(html).not.toContain('pre-send-acknowledge');
  });

  it('no-go: disabled until acknowledged, every blocking criterion with its numbers and a remedy', () => {
    const html = render(BAD);
    expect(html).toContain('Kampaň v tomto stavu odeslat nelze.');
    expect(confirmTag(html)).toContain('disabled');
    expect(html).toContain('Blokující (1)');
    expect(html).toContain('Naměřeno: 15 % nedoručitelných zpráv');
    expect(html).toContain('Hranice: 5 %');
    expect(html).toContain('Vzorek: 100 (minimum 100)');
    expect(html).toContain('Co s tím: ');
    expect(html).toContain('href="/suppressions"');
    expect(html).toContain('Rozumím riziku a chci kampaň odeslat i tak.');
    // Grouped: the thin complaint sample is information, the short subject a warning.
    expect(html).toContain('Varování (1)');
    expect(html).toContain('Informativní (1)');
    expect(html).toContain(
      'Vzorek za 7 dní: 85 doručených (minimum 100) — do rozhodnutí se nepočítá',
    );
    expect(html).toContain('Délka předmětu: 4 znaků');
    // Nothing cut short: the server's own sentence is there in full.
    expect(html).toContain(
      'Sending while bounce rate is above 5% risks suspension. Clean your list first.',
    );
  });

  it('no-go, acknowledged: the confirm button unlocks', () => {
    expect(confirmTag(render(BAD, true))).not.toContain('disabled');
  });
});

describe('what a confirmation sends', () => {
  it('the acknowledgement only when ticked, and never as false', () => {
    expect(confirmBody(undefined, false)).toBeUndefined();
    expect(confirmBody(undefined, true)).toEqual({ [ACKNOWLEDGE_FIELD]: true });
    const scheduled = { scheduledAt: '2999-01-01T08:00:00.000Z' };
    expect(confirmBody(scheduled, false)).toEqual(scheduled);
    expect(confirmBody(scheduled, false)).not.toHaveProperty(ACKNOWLEDGE_FIELD);
    expect(confirmBody(scheduled, true)).toEqual({
      scheduledAt: '2999-01-01T08:00:00.000Z',
      acknowledgeDeliverabilityRisk: true,
    });
    expect(canConfirm('no-go', false)).toBe(false);
    expect(canConfirm('no-go', true)).toBe(true);
    expect(canConfirm('caution', false)).toBe(true);
  });
});

describe('a refusal from the server is shown whole', () => {
  // The body #245's gate answered with in Z125's integration run.
  const BODY = JSON.stringify({
    code: 'DELIVERABILITY_NO_GO',
    statusCode: 422,
    message:
      'The pre-send check says no-go: bounce-rate: Recent 7-day bounce rate 15.0% — over ISP threshold [bounceRatePct=15, thresholdPct=5, sampleSize=100, minSample=100]. Fix it, or send again with acknowledgeDeliverabilityRisk: true to send anyway (the override is recorded).',
    details: {
      verdict: 'no-go',
      blocking: [
        {
          id: 'bounce-rate',
          title: 'Recent 7-day bounce rate 15.0% — over ISP threshold',
          metrics: { bounceRatePct: 15, thresholdPct: 5, sampleSize: 100, minSample: 100 },
        },
      ],
      warnings: [],
      override: 'acknowledgeDeliverabilityRisk',
    },
  });

  it('lists the blocking criteria with their numbers', () => {
    const failure = readFailure(422, BODY);
    expect(failure.blocking).toHaveLength(1);
    const html = renderToStaticMarkup(<FailureView failure={failure} campaignId="c1" />);
    expect(html).toContain('Server kampaň odmítl (422)');
    expect(html).toContain('Míra nedoručitelnosti (7 dní)');
    expect(html).toContain('Naměřeno: 15 % nedoručitelných zpráv');
    expect(html).toContain('Vzorek: 100 (minimum 100)');
  });

  it('any other error keeps its whole message', () => {
    const long = 'x'.repeat(300);
    const failure = readFailure(400, JSON.stringify({ code: 'BAD_REQUEST', message: long }));
    const html = renderToStaticMarkup(<FailureView failure={failure} campaignId="c1" />);
    expect(html).toContain(long);
  });

  it('an unknown metric is still shown, not dropped', () => {
    expect(describeMetrics({ newThing: 7 })).toEqual(['newThing: 7']);
  });
});
