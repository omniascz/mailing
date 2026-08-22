import { notFound } from 'next/navigation';
import { getCapabilities } from '@/lib/capabilities.server';
import Link from 'next/link';
import { Eye, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface PreviewJob {
  id: string;
  campaignId: string | null;
  provider: string;
  subject: string | null;
  clients: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: Array<{ client: string; url: string; thumbnailUrl?: string }>;
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

export default async function InboxPreviewPage() {
  // Not a hidden-but-reachable page: without a Litmus key the provider is a
  // mock that reports 'completed' with screenshots on preview.mock.local, so
  // the route does not exist rather than showing broken renders. Set
  // LITMUS_API_KEY and it is back.
  const { inboxPreview } = await getCapabilities();
  if (!inboxPreview) notFound();

  const jobs = await apiFetch<PreviewJob[]>('/api/v1/inbox-preview?limit=50', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Inbox preview</h1>
          <p className="mt-1 text-sm text-secondary-500">
            See how your campaigns render in Gmail, Outlook, Apple Mail, iOS, and more before
            sending.
          </p>
        </div>
        <Link
          href="/inbox-preview/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New preview
        </Link>
      </header>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No previews yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Send an HTML email through the preview service to check rendering across email
              clients.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/inbox-preview/${job.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-secondary-900">
                          {job.subject || '(no subject)'}
                        </p>
                        <Badge variant={STATUS_TONE[job.status]}>{job.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-secondary-500">
                        {new Date(job.createdAt).toLocaleString('cs-CZ')} · provider {job.provider}{' '}
                        · {job.clients.length} clients
                      </p>
                      {job.error ? <p className="mt-1 text-xs text-rose-600">{job.error}</p> : null}
                    </div>
                    <p className="shrink-0 text-sm text-secondary-500">
                      {job.results.length}/{job.clients.length} rendered
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
