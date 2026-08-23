import { ImageIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { EditImageButton } from './edit-image-button';

interface MediaAsset {
  id: string;
  folder: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  storageUrl: string;
  thumbnailUrl: string | null;
  altText: string | null;
  derivedFromId: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function MediaPage() {
  const assets = await apiFetch<MediaAsset[]>('/api/v1/media', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Media library</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Images and assets used across campaigns and templates. Editing one saves a new copy; the
          original stays where campaigns already point at it.
        </p>
      </header>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No media yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Uploads from the editor and campaign builder appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((a) => (
            <li key={a.id}>
              <Card className="overflow-hidden">
                <div className="aspect-square bg-secondary-100">
                  {a.mimeType.startsWith('image/') ? (
                    <img
                      src={a.thumbnailUrl ?? a.storageUrl}
                      alt={a.altText ?? a.filename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-secondary-300" />
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <p className="truncate text-xs font-medium text-secondary-900" title={a.filename}>
                    {a.filename}
                  </p>
                  <p className="mt-0.5 text-[11px] text-secondary-500">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ''}
                    {humanSize(a.sizeBytes)}
                    {a.derivedFromId ? ' · edited copy' : ''}
                  </p>
                  {a.mimeType.startsWith('image/') ? (
                    <div className="mt-1.5">
                      <EditImageButton
                        id={a.id}
                        filename={a.filename}
                        width={a.width}
                        height={a.height}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
