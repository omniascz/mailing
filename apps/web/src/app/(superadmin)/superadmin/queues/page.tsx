import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Activity, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export const dynamic = 'force-dynamic';

export default async function SuperadminQueuesPage() {
  const queues = await apiFetch<QueueStat[]>('/api/v1/superadmin/queues', { fallback: [] });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Queues</h1>
        <p className="mt-1 text-sm text-slate-400">
          BullMQ depth per queue. Click failed count to see recent errors.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Queue</th>
              <th className="px-4 py-3 text-right font-medium">
                <Clock className="ml-auto inline h-3 w-3" /> Waiting
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <Activity className="ml-auto inline h-3 w-3" /> Active
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <CheckCircle2 className="ml-auto inline h-3 w-3" /> Completed
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <AlertCircle className="ml-auto inline h-3 w-3" /> Failed
              </th>
              <th className="px-4 py-3 text-right font-medium">Delayed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {queues.map((q) => (
              <tr key={q.name}>
                <td className="px-4 py-3 font-mono text-xs">{q.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <Cell n={q.waiting} threshold={1000} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{q.active}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-400">{q.completed}</td>
                <td className="px-4 py-3 text-right">
                  {q.failed > 0 ? (
                    <Link
                      href={`/superadmin/queues/${encodeURIComponent(q.name)}`}
                      className="rounded bg-rose-900/40 px-2 py-0.5 text-xs font-medium text-rose-200 hover:bg-rose-900/60"
                    >
                      {q.failed} →
                    </Link>
                  ) : (
                    <span className="text-slate-500">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-400">{q.delayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Tip: <code className="rounded bg-slate-800 px-1 py-0.5">waiting</code> climbing while{' '}
        <code className="rounded bg-slate-800 px-1 py-0.5">active</code> stays at 0 means workers
        aren&apos;t consuming. Check <code>docker logs forgemsg-workers</code> on the host.
      </p>
    </div>
  );
}

function Cell({ n, threshold }: { n: number; threshold: number }) {
  if (n > threshold) {
    return <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">{n}</span>;
  }
  return <span>{n}</span>;
}
