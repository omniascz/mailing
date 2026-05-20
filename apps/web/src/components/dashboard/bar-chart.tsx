import { cn } from '@/lib/cn';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional tint key. Falls back to the primary palette. */
  tone?: 'good' | 'neutral' | 'warn' | 'bad';
}

const TONE_BG: Record<NonNullable<BarDatum['tone']>, string> = {
  good: 'bg-emerald-500',
  neutral: 'bg-primary-500',
  warn: 'bg-amber-500',
  bad: 'bg-rose-500',
};

/**
 * Horizontal bar chart suitable for cohort distributions where the
 * absolute counts span a long tail. Uses width relative to the largest
 * bar (not total) so even small buckets remain visible.
 *
 * Rendered as plain HTML so it works inside Server Components without
 * pulling in Recharts. If we ever need axes / tooltips, swap for a
 * Recharts implementation behind the same prop shape.
 */
export function BarChart({ data }: { data: BarDatum[] }) {
  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
        No data yet — run the daily refresh or import contacts to see cohorts.
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const pct = Math.max(2, (d.value / max) * 100);
        const tone = d.tone ?? 'neutral';
        return (
          <li key={d.label} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3">
            <span className="truncate text-sm text-secondary-700">{d.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-secondary-100">
              <div
                className={cn('h-full rounded-full', TONE_BG[tone])}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right text-sm tabular-nums text-secondary-600">
              {d.value.toLocaleString('cs-CZ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
