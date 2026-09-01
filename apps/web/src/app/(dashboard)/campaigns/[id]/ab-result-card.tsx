/**
 * What the A/B test decided — GET /api/v1/campaigns/:id/ab-result.
 *
 * #74 and #76 cost two rounds of work making sure an A/B campaign always
 * closes, and the row they write has been unreadable from the product ever
 * since. The `needs_review` decision in particular is load-bearing: below the
 * confidence threshold the holdback slice is deliberately NOT sent and the
 * campaign is parked for a human — which is indistinguishable from "stuck"
 * unless someone can read the reason.
 *
 * Renders nothing for a campaign that is not an A/B test. For one that is but
 * has no result row yet, it shows the variants and their split instead of a
 * blank card, because "the test is still running" is an answer.
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/** The subset of AbVariant this card needs; see apps/api ab-winner.ts. */
export interface AbVariantLite {
  id: string;
  subject?: string;
  percentage?: number;
}

export interface AbConfigLite {
  variants?: AbVariantLite[];
  winnerCriteria?: string;
  testDurationHours?: number;
  autoSendWinner?: boolean;
  confidenceThreshold?: number;
}

/**
 * One row of ab_test_results as it arrives over HTTP.
 *
 * The score columns are `decimal` in Postgres, which drizzle hands back as
 * STRINGS — `'0.184000'`, not `0.184`. They are also fractions of 1, while
 * `confidencePct` is already a percentage. Getting either wrong puts a number
 * off by a factor of a hundred on the screen, so both conversions live in
 * `formatRate` / `formatConfidence` below and are tested.
 */
export interface AbResult {
  winnerVariantId: string;
  winnerMetric: string;
  winnerScore: string;
  runnerUpScore: string;
  confidencePct: string | null;
  holdbackCount: number;
  autoSendDispatched: boolean;
  decision: string;
  decisionReason: string | null;
  dispatchedAt: string | null;
  selectedAt: string;
}

/** A stored score is a fraction of 1; the screen wants a percentage. */
export function formatRate(score: string | null | undefined): string {
  if (score === null || score === undefined) return '—';
  const n = Number(score);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

/** `confidencePct` is ALREADY 0–100. It does not get multiplied. */
export function formatConfidence(pct: string | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

const METRIC_LABEL: Record<string, string> = {
  click_rate: 'click rate',
  open_rate: 'open rate',
};

export function AbResultCard({
  abConfig,
  result,
}: {
  abConfig: AbConfigLite | null;
  result: AbResult | null;
}) {
  const variants = abConfig?.variants ?? [];
  // Fewer than two variants is not an A/B test — it is the same test the
  // splitter and validateCampaignReadiness both apply before they do anything.
  if (variants.length < 2) return null;

  const totalPct = variants.reduce((sum, v) => sum + (v.percentage ?? 0), 0);
  const holdbackPct = Math.max(0, 100 - totalPct);
  const winner = result ? variants.find((v) => v.id === result.winnerVariantId) : undefined;
  const needsReview = result?.decision === 'needs_review';

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>A/B test</CardTitle>
        <CardDescription>
          {variants.length} variants
          {holdbackPct > 0
            ? ` on ${totalPct}% of the audience; the remaining ${holdbackPct}% is the holdback that gets the winner.`
            : '; no holdback — the whole audience is split between the variants and no winner is sent afterwards.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="mb-5 space-y-2">
          {variants.map((v) => {
            const isWinner = result?.winnerVariantId === v.id;
            return (
              <li
                key={v.id}
                className={`flex items-baseline justify-between gap-4 rounded-md border px-3 py-2 text-sm ${
                  isWinner
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-secondary-200 bg-white'
                }`}
              >
                <span className="min-w-0">
                  <span className="mr-2 font-mono text-xs text-secondary-500">{v.id}</span>
                  <span className="text-secondary-900">
                    {v.subject || <span className="text-secondary-400">no subject</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {isWinner ? <Badge variant="success">winner</Badge> : null}
                  <span className="tabular-nums text-secondary-500">{v.percentage ?? 0}%</span>
                </span>
              </li>
            );
          })}
        </ul>

        {result === null ? (
          <p className="text-sm text-secondary-500">
            No winner yet. The winner is picked{' '}
            {abConfig?.testDurationHours
              ? `${abConfig.testDurationHours} hours after the test slice goes out`
              : 'once the test slice has run'}
            .
          </p>
        ) : (
          <div className="space-y-3">
            {needsReview ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  Needs review — the holdback has not been sent
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {result.decisionReason ??
                    'The winner did not clear the confidence threshold, so nothing was dispatched automatically.'}
                </p>
              </div>
            ) : null}

            <dl className="space-y-2 text-sm">
              <ResultRow
                label="Winner"
                value={winner?.subject ?? result.winnerVariantId}
                suffix={winner ? result.winnerVariantId : 'variant no longer in the config'}
              />
              <ResultRow
                label={`Winning ${METRIC_LABEL[result.winnerMetric] ?? result.winnerMetric}`}
                value={formatRate(result.winnerScore)}
                suffix={`runner-up ${formatRate(result.runnerUpScore)}`}
              />
              <ResultRow label="Confidence" value={formatConfidence(result.confidencePct)} />
              <ResultRow
                label="Holdback"
                value={result.holdbackCount.toLocaleString('cs-CZ')}
                suffix={
                  result.autoSendDispatched
                    ? `sent ${result.dispatchedAt ? new Date(result.dispatchedAt).toLocaleString('cs-CZ') : ''}`.trim()
                    : 'not sent'
                }
              />
              <ResultRow
                label="Decided"
                value={new Date(result.selectedAt).toLocaleString('cs-CZ')}
              />
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-secondary-500">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="font-medium text-secondary-900">{value}</span>
        {suffix ? <span className="ml-2 text-xs text-secondary-500">{suffix}</span> : null}
      </dd>
    </div>
  );
}
