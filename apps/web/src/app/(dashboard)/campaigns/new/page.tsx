import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { NewCampaignForm } from './new-campaign-form';

interface List {
  id: string;
  name: string;
  liveContactCount: number;
}

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  // Preload lists for the audience picker — server-rendered so the picker
  // is populated on first paint and survives JS load.
  const lists = await apiFetch<List[]>('/api/v1/lists', { fallback: [] });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/campaigns"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
          <CardDescription>
            Create a draft. You'll set up content on the next screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewCampaignForm
            lists={lists.map((l) => ({
              id: l.id,
              name: l.name,
              count: l.liveContactCount,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
