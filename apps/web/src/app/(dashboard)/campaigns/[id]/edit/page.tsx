import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock, LayoutGrid } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { EditCampaignForm } from './edit-campaign-form';

/**
 * `& Record<string, unknown>` is not slack: campaigns.content has four shapes
 * in this codebase and the visual editor's is `{ schema, html }`. The form
 * copies the whole object into each A/B variant, so it must not be narrowed
 * away to the two keys this page happens to read.
 */
type CampaignContent = {
  html?: string;
  plainText?: string;
} & Record<string, unknown>;

interface Campaign {
  id: string;
  name: string;
  type: string;
  status:
    | 'draft'
    | 'scheduled'
    | 'queueing'
    | 'sending'
    | 'sent'
    | 'failed'
    | 'paused'
    | 'cancelled';
  subject: string | null;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  content: CampaignContent | null;
  listId: string | null;
  timewarp: {
    enabled: boolean;
    localHour: number;
    fallbackTimezone?: string;
  } | null;
  utmTracking: {
    enabled: boolean;
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  } | null;
  segmentId: string | null;
  excludeSegmentId: string | null;
  abConfig: Record<string, unknown> | null;
}

interface ListLite {
  id: string;
  name: string;
  liveContactCount: number;
}

interface SegmentLite {
  id: string;
  name: string;
}

export const dynamic = 'force-dynamic';

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, lists, segments] = await Promise.all([
    apiFetch<Campaign | null>(`/api/v1/campaigns/${id}`, { fallback: null }),
    apiFetch<ListLite[]>('/api/v1/lists', { fallback: [] }),
    apiFetch<SegmentLite[]>('/api/v1/segments', { fallback: [] }),
  ]);
  if (!campaign) notFound();

  const editable = campaign.status === 'draft';

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/campaigns/${campaign.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to campaign
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-secondary-900">Edit — {campaign.name}</h1>
            <Badge variant={editable ? 'default' : 'warning'}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-secondary-500">
            {editable
              ? 'Draft mode — changes save immediately when you hit Save.'
              : 'This campaign has already left the draft stage. Content is shown read-only.'}
          </p>
        </div>
        <Link
          href={`/editor/campaigns/${campaign.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
        >
          <LayoutGrid className="h-4 w-4" />
          {editable ? 'Open visual editor' : 'Open in visual editor'}
        </Link>
      </header>

      {!editable ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent>
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Content is locked</p>
                <p className="mt-1 text-sm text-amber-800">
                  Campaigns that have been scheduled, sent, paused, or cancelled can't be edited.
                  Clone this campaign to start a new draft with the same content.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Campaign content</CardTitle>
          <CardDescription>
            Subject, sender, audience, A/B test, HTML body. Plain text is auto-derived if you leave
            it blank.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditCampaignForm
            campaign={campaign}
            lists={lists.map((l) => ({ id: l.id, name: l.name, count: l.liveContactCount }))}
            segments={segments.map((sgm) => ({ id: sgm.id, name: sgm.name }))}
            editable={editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
