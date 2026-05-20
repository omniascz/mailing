import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { SegmentBuilder } from '@/components/segments/segment-builder';

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

export default async function NewSegmentPage() {
  const [tags, campaigns] = await Promise.all([
    apiFetch<Tag[]>('/api/v1/tags', { fallback: [] }),
    apiFetch<Campaign[]>('/api/v1/campaigns?limit=100', { fallback: [] }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/segments"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to segments
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New segment</CardTitle>
          <CardDescription>
            Build a reusable audience slice with rules. Segments are evaluated live — your campaigns
            pick up new matches automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SegmentBuilder tags={tags} campaigns={campaigns} />
        </CardContent>
      </Card>
    </div>
  );
}
