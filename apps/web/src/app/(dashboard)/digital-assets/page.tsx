import { FileDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface DigitalAsset {
  id: string;
  name: string;
  description: string | null;
  contentType: string | null;
  fileSizeBytes: number | null;
  maxDownloads: number | null;
  requiresLicenseKey: boolean;
  active: boolean;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

function humanSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DigitalAssetsPage() {
  const assets = await apiFetch<DigitalAsset[]>('/api/v1/digital-assets', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Digital assets</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Downloadable products delivered via signed, expiring links — with optional license keys.
        </p>
      </header>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileDown className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No digital assets yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {assets.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-secondary-900">{a.name}</p>
                    <Badge variant={a.active ? 'success' : 'default'}>
                      {a.active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  {a.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary-500">{a.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-secondary-500">
                    <span>{humanSize(a.fileSizeBytes)}</span>
                    {a.maxDownloads ? <span>· max {a.maxDownloads} downloads</span> : null}
                    {a.requiresLicenseKey ? <Badge variant="primary">License key</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
