import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function AuditLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await apiFetch<AuditLog | null>(`/api/v1/audit-logs/${id}`, { fallback: null });
  if (!log) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings/audit-log"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to audit log
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-secondary-900">{log.action}</h1>
          <Badge variant="default">{log.resource}</Badge>
        </div>
        <p className="mt-1 text-xs text-secondary-500">
          {new Date(log.createdAt).toLocaleString('cs-CZ')}
        </p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Actor</CardTitle>
            <CardDescription>Who performed this action</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row
                label="User ID"
                value={log.userId ? <code className="font-mono text-xs">{log.userId}</code> : null}
              />
              <Row
                label="IP address"
                value={
                  log.ipAddress ? <code className="font-mono text-xs">{log.ipAddress}</code> : null
                }
              />
              <Row label="User agent" value={log.userAgent} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
            <CardDescription>What was acted on</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Resource" value={log.resource} />
              <Row
                label="Resource ID"
                value={
                  log.resourceId ? (
                    <code className="font-mono text-xs">{log.resourceId}</code>
                  ) : null
                }
              />
              <Row label="Action" value={log.action} />
            </dl>
          </CardContent>
        </Card>
      </section>

      {log.changes ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Changes</CardTitle>
            <CardDescription>Field-level diff captured at write time</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-secondary-900 p-4 text-xs leading-relaxed text-secondary-100">
              {JSON.stringify(log.changes, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {log.metadata ? (
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Additional context attached to the event</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-secondary-900 p-4 text-xs leading-relaxed text-secondary-100">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-secondary-500">{label}</dt>
      <dd className="truncate text-right text-secondary-900">
        {value || <span className="text-secondary-400">—</span>}
      </dd>
    </div>
  );
}
