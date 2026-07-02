import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface ReportRun {
  name: string;
  from: string | null;
  to: string | null;
  totals: Record<string, number>;
  rows: Array<{ group: string; values: Record<string, number> }>;
}

export const dynamic = 'force-dynamic';

const RATE_METRICS = new Set([
  'open_rate',
  'click_rate',
  'click_to_open_rate',
  'bounce_rate',
  'unsubscribe_rate',
  'complaint_rate',
]);

function fmt(metric: string, value: number): string {
  if (RATE_METRICS.has(metric)) return `${(value * 100).toFixed(2)}%`;
  return value.toLocaleString('cs-CZ');
}

export default async function ReportRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await apiFetch<ReportRun | null>(`/api/v1/reports/${id}/run`, { fallback: null });

  if (!report) {
    return (
      <div className="mx-auto max-w-7xl">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-secondary-500">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-secondary-500">
            Report not found or could not be run.
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = Object.keys(report.totals);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-secondary-500">
        <ArrowLeft className="h-4 w-4" /> Reports
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="text-2xl font-semibold text-secondary-900">{report.name}</h1>
        <p className="mt-1 text-sm text-secondary-500">
          {report.from ? new Date(report.from).toLocaleDateString('cs-CZ') : 'Start'} –{' '}
          {report.to ? new Date(report.to).toLocaleDateString('cs-CZ') : 'now'}
        </p>
      </header>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-secondary-200 bg-secondary-50 text-left">
                  <th className="px-4 py-2 font-medium text-secondary-600">Group</th>
                  {metrics.map((m) => (
                    <th key={m} className="px-4 py-2 text-right font-medium text-secondary-600">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.group} className="border-b border-secondary-100">
                    <td className="px-4 py-2 font-medium text-secondary-900">{row.group}</td>
                    {metrics.map((m) => (
                      <td key={m} className="px-4 py-2 text-right tabular-nums text-secondary-700">
                        {fmt(m, row.values[m] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-secondary-50 font-semibold">
                  <td className="px-4 py-2 text-secondary-900">Total</td>
                  {metrics.map((m) => (
                    <td key={m} className="px-4 py-2 text-right tabular-nums text-secondary-900">
                      {fmt(m, report.totals[m] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
