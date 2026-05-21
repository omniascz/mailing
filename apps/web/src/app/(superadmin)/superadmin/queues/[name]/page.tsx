import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface FailedJob {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  data: unknown;
  processedOn: number | null;
}

export const dynamic = 'force-dynamic';

export default async function SuperadminFailedJobsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const jobs = await apiFetch<FailedJob[]>(
    `/api/v1/superadmin/queues/${encodeURIComponent(name)}/failed?limit=20`,
    { fallback: [] },
  );

  return (
    <div>
      <Link
        href="/superadmin/queues"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to queues
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">
          Failed jobs — <span className="font-mono text-base text-slate-400">{name}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Most recent 20 failed jobs.</p>
      </header>

      {jobs.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          No failed jobs in this queue.
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <details
              key={job.id}
              className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm"
            >
              <summary className="cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-slate-400">#{job.id}</span>{' '}
                    <span className="font-medium">{job.name}</span>
                  </div>
                  <div className="text-xs text-rose-200">
                    {job.attemptsMade} attempts ·{' '}
                    {job.processedOn
                      ? new Date(job.processedOn).toLocaleString('cs-CZ')
                      : 'unknown'}
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-rose-100">{job.failedReason}</p>
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-950 p-3 font-mono text-[11px] text-slate-300">
                {JSON.stringify(job.data, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
