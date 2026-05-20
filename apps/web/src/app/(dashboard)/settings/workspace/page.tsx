import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { WorkspaceForm } from './workspace-form';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  dataRegion: 'us' | 'eu' | 'ap';
  settings: Record<string, unknown>;
  ipRestrictionsEnabled: boolean;
  hipaaMode: boolean;
  trackingEuStrict: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage() {
  const org = await apiFetch<Organization | null>('/api/v1/organizations/current', {
    fallback: null,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Workspace</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Branding, locale defaults, and compliance toggles. Per-campaign overrides take precedence.
        </p>
      </header>

      {org ? (
        <WorkspaceForm
          orgId={org.id}
          initialName={org.name}
          initialSettings={org.settings ?? {}}
          ipRestrictionsEnabled={org.ipRestrictionsEnabled}
          trackingEuStrict={org.trackingEuStrict}
          hipaaMode={org.hipaaMode}
          slug={org.slug}
          plan={org.plan}
          dataRegion={org.dataRegion}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Not loaded</CardTitle>
            <CardDescription>
              Couldn't fetch your workspace. The API may be down or your session has expired.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  );
}
