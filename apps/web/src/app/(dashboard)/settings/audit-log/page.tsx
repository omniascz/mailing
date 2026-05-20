import Link from 'next/link';
import { ArrowLeft, Activity, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

interface AuditLogResponse {
  data: AuditLog[];
  hasMore: boolean;
  cursor: string | null;
}

const ACTION_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  created: 'success',
  updated: 'primary',
  deleted: 'danger',
  login: 'default',
  logout: 'default',
  failed: 'danger',
};

function actionTone(action: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  // e.g. 'contact.created' → 'created'
  const verb = action.split('.').pop() ?? action;
  return ACTION_TONE[verb] ?? 'default';
}

export const dynamic = 'force-dynamic';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    resource?: string;
    action?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.resource) qs.set('resource', params.resource);
  if (params.action) qs.set('action', params.action);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.cursor) qs.set('cursor', params.cursor);
  qs.set('limit', '50');

  // Audit log endpoint returns { data, hasMore, cursor } at top level —
  // apiFetch returns the `data` array directly here since the typed
  // generic expects shape with data property. Use a permissive cast.
  const res = await apiFetch<AuditLogResponse | AuditLog[]>(`/api/v1/audit-logs?${qs.toString()}`, {
    fallback: { data: [], hasMore: false, cursor: null },
  });
  const logs: AuditLog[] = Array.isArray(res) ? res : res.data;
  const hasMore = Array.isArray(res) ? false : res.hasMore;
  const nextCursor = Array.isArray(res) ? null : res.cursor;

  // Discover unique resources + actions for quick filter chips
  const resources = Array.from(new Set(logs.map((l) => l.resource))).sort();

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Audit log</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Every write action against your workspace. Used for GDPR Art. 30 records of processing and
          security investigations.
        </p>
      </header>

      <form
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4"
        action="/settings/audit-log"
        method="GET"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
          <input
            type="text"
            name="resource"
            defaultValue={params.resource ?? ''}
            placeholder="Resource (e.g. contact)"
            className="h-10 w-full rounded-md border border-secondary-300 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <input
          type="text"
          name="action"
          defaultValue={params.action ?? ''}
          placeholder="Action (e.g. contact.deleted)"
          className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <input
          type="datetime-local"
          name="from"
          defaultValue={params.from?.slice(0, 16) ?? ''}
          className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <input
          type="datetime-local"
          name="to"
          defaultValue={params.to?.slice(0, 16) ?? ''}
          className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </form>

      {resources.length > 1 && !params.resource ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="text-xs text-secondary-500">Quick resource filter:</span>
          {resources.slice(0, 8).map((r) => (
            <Link
              key={r}
              href={`/settings/audit-log?resource=${encodeURIComponent(r)}`}
              className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-secondary-700 ring-1 ring-secondary-200 hover:bg-secondary-50"
            >
              {r}
            </Link>
          ))}
        </div>
      ) : null}

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">
              {Object.keys(params).length > 0 ? 'No log entries match' : 'No activity recorded yet'}
            </p>
            <p className="mt-1 text-sm text-secondary-500">
              Audit entries appear as workspace members create, update, or delete things.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
            <table className="w-full">
              <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 text-sm">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-secondary-500">
                      {new Date(l.createdAt).toLocaleString('cs-CZ')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={actionTone(l.action)}>{l.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-secondary-900">{l.resource}</span>
                      {l.resourceId ? (
                        <p className="mt-0.5 font-mono text-xs text-secondary-400">
                          {l.resourceId.slice(0, 8)}…
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary-500">
                      {l.userId ? (
                        `${l.userId.slice(0, 8)}…`
                      ) : (
                        <span className="text-secondary-300">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary-500">
                      {l.ipAddress ?? <span className="text-secondary-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/settings/audit-log/${l.id}`}
                        className="text-xs font-medium text-primary-700 hover:text-primary-900"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Link
                href={`/settings/audit-log?${new URLSearchParams({
                  ...(params.resource ? { resource: params.resource } : {}),
                  ...(params.action ? { action: params.action } : {}),
                  ...(params.from ? { from: params.from } : {}),
                  ...(params.to ? { to: params.to } : {}),
                  cursor: nextCursor,
                }).toString()}`}
                className="rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
              >
                Load older entries
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
