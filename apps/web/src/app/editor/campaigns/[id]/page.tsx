import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { VisualEditorShell } from './visual-editor-shell';

interface CampaignContent {
  html?: string;
  plainText?: string;
  schema?: unknown;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  preheader: string | null;
  content: CampaignContent | null;
}

export const dynamic = 'force-dynamic';

export default async function VisualCampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await apiFetch<Campaign | null>(`/api/v1/campaigns/${id}`, { fallback: null });
  if (!campaign) notFound();

  return (
    <VisualEditorShell
      campaignId={campaign.id}
      campaignName={campaign.name}
      campaignStatus={campaign.status}
      initialSchema={campaign.content?.schema ?? null}
      initialSubject={campaign.subject ?? null}
      initialPreheader={campaign.preheader ?? null}
    />
  );
}
