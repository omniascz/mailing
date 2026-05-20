import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: string;
  conditions: Record<string, unknown> | null;
  contactCount: number | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [seg, countResp] = await Promise.all([
    apiFetch<Segment | null>(`/api/v1/segments/${id}`, { fallback: null }),
    // Live count — uses the same query the campaign audience picker hits
    // at send time, so what you see here is what gets sent to.
    apiFetch<{ count: number } | null>(`/api/v1/segments/${id}/count`, { fallback: null }),
  ]);
  if (!seg) notFound();
  const liveCount = countResp?.count ?? null;

  const conditionsJson = seg.conditions
    ? JSON.stringify(seg.conditions, null, 2)
    : 'No conditions defined';

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/segments"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to segments
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-secondary-900">{seg.name}</h1>
            <Badge variant="default">{seg.type}</Badge>
          </div>
          {seg.description ? (
            <p className="mt-2 text-sm text-secondary-600">{seg.description}</p>
          ) : null}
        </div>
        <Link
          href={`/segments/${seg.id}/edit`}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50"
        >
          Edit rules
        </Link>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Live match"
          value={liveCount != null ? liveCount.toLocaleString('cs-CZ') : '—'}
        />
        <Kpi
          label="Last evaluated"
          value={seg.lastEvaluatedAt ? new Date(seg.lastEvaluatedAt).toLocaleString('cs-CZ') : '—'}
        />
        <Kpi label="Updated" value={new Date(seg.updatedAt).toLocaleString('cs-CZ')} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>Raw segment rule JSON — visual editor coming soon.</CardDescription>
        </CardHeader>
        <CardContent>
          {seg.conditions ? (
            <pre className="overflow-x-auto rounded-md bg-secondary-50 p-4 text-xs text-secondary-800">
              {conditionsJson}
            </pre>
          ) : (
            <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
              <Users className="mx-auto mb-2 h-5 w-5 text-secondary-300" />
              This segment is empty — add at least one condition for it to match contacts.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-secondary-900">{value}</p>
    </div>
  );
}
