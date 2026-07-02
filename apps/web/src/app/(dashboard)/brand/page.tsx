import { Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { ImportBrandFromUrl } from './import-brand-from-url';

interface BrandGuidelinesData {
  primaryColors?: string[];
  approvedFonts?: string[];
  voiceDescription?: string;
  logoUrl?: string | null;
}
interface BrandGuideline {
  id: string;
  name: string;
  active: boolean;
  guidelines: BrandGuidelinesData;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function BrandPage() {
  const guidelines = await apiFetch<BrandGuideline[]>('/api/v1/brand-guidelines', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Brand kit</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Import your logo, colours and fonts from your website, then reuse them across campaigns.
        </p>
      </header>

      <ImportBrandFromUrl />

      <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wider text-secondary-400">
        Saved brand kits
      </h2>

      {guidelines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Palette className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No brand kits yet</p>
            <p className="mt-1 text-sm text-secondary-500">Import one from your website above.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {guidelines.map((g) => (
            <li key={g.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{g.name}</CardTitle>
                    {g.active ? <Badge variant="success">Active</Badge> : null}
                  </div>
                  {g.guidelines.voiceDescription ? (
                    <CardDescription>{g.guidelines.voiceDescription}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4">
                    {g.guidelines.logoUrl ? (
                      <img
                        src={g.guidelines.logoUrl}
                        alt={`${g.name} logo`}
                        className="h-10 w-auto max-w-[140px] object-contain"
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {(g.guidelines.primaryColors ?? []).map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center gap-1 rounded border border-secondary-200 px-1.5 py-0.5 text-xs text-secondary-600"
                        >
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ backgroundColor: c }}
                          />
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  {(g.guidelines.approvedFonts ?? []).length > 0 ? (
                    <p className="mt-3 text-xs text-secondary-500">
                      Fonts: {(g.guidelines.approvedFonts ?? []).join(', ')}
                    </p>
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
