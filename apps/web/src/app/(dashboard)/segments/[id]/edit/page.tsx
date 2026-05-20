import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { SegmentBuilder, type BuilderConditions } from '@/components/segments/segment-builder';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  conditions: BuilderConditions | null;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Campaign {
  id: string;
  name: string;
}

export const dynamic = 'force-dynamic';

export default async function EditSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [seg, tags, campaigns] = await Promise.all([
    apiFetch<Segment | null>(`/api/v1/segments/${id}`, { fallback: null }),
    apiFetch<Tag[]>('/api/v1/tags', { fallback: [] }),
    apiFetch<Campaign[]>('/api/v1/campaigns?limit=100', { fallback: [] }),
  ]);
  if (!seg) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/segments/${seg.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to segment
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit segment</CardTitle>
          <CardDescription>
            Changes apply immediately. Active campaigns and workflows pick up the new audience on
            their next evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SegmentBuilder
            segmentId={seg.id}
            initialName={seg.name}
            initialDescription={seg.description ?? ''}
            initialConditions={seg.conditions ?? undefined}
            tags={tags}
            campaigns={campaigns}
          />
        </CardContent>
      </Card>
    </div>
  );
}
