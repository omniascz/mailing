import { getCapabilities } from '@/lib/capabilities';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface PreviewJob {
  id: string;
  provider: string;
  subject: string | null;
  clients: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: Array<{
    client: string;
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  }>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

const STATUS_TONE: Record<PreviewJob['status'], 'default' | 'primary' | 'success' | 'danger'> = {
  pending: 'default',
  running: 'primary',
  completed: 'success',
  failed: 'danger',
};

export const dynamic = 'force-dynamic';

export default async function InboxPreviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Not a hidden-but-reachable page: without a Litmus key the provider is a
  // mock that reports 'completed' with screenshots on preview.mock.local, so
  // the route does not exist rather than showing broken renders. Set
  // LITMUS_API_KEY and it is back.
  const { inboxPreview } = await getCapabilities();
  if (!inboxPreview) notFound();

  const { id } = await params;
  const job = await apiFetch<PreviewJob | null>(`/api/v1/inbox-preview/${id}`, { fallback: null });
  if (!job) notFound();

  const pending = job.status === 'pending' || job.status === 'running';

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/inbox-preview"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to previews
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-secondary-900">
            {job.subject || '(no subject)'}
          </h1>
          <Badge variant={STATUS_TONE[job.status]}>{job.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-secondary-500">
          Provider: {job.provider} · Started {new Date(job.createdAt).toLocaleString('cs-CZ')}
          {job.completedAt
            ? ` · Completed ${new Date(job.completedAt).toLocaleString('cs-CZ')}`
            : ''}
        </p>
      </header>

      {job.error ? (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent>
            <p className="text-sm font-medium text-rose-900">Preview failed</p>
            <p className="mt-1 text-sm text-rose-800">{job.error}</p>
          </CardContent>
        </Card>
      ) : null}

      {pending && job.results.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-12 justify-center text-secondary-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">
              Rendering across {job.clients.length} clients — typically 30–90 seconds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {job.results.map((r) => (
            <li key={r.client}>
              <Card className="overflow-hidden p-0">
                <a href={r.url} target="_blank" rel="noreferrer" className="block">
                  {r.thumbnailUrl ? (
                    // Provider URLs are external (Litmus / mock CDN). next/image
                    // would need explicit remotePatterns — plain img keeps this
                    // shell flexible while we wait on env config.
                    <img
                      src={r.thumbnailUrl}
                      alt={r.client}
                      className="block h-64 w-full bg-secondary-100 object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-secondary-50 text-xs text-secondary-400">
                      No thumbnail
                    </div>
                  )}
                </a>
                <CardContent className="flex items-center justify-between gap-2 p-4">
                  <p className="truncate text-sm font-medium text-secondary-900">{r.client}</p>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800"
                  >
                    Open full <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
