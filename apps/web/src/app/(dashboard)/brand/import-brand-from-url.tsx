'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface BrandKit {
  siteName: string | null;
  logoUrl: string | null;
  themeColor: string | null;
  colors: string[];
  fonts: string[];
}

export function ImportBrandFromUrl() {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kit, setKit] = useState<BrandKit | null>(null);

  async function scan(save: boolean) {
    if (!url.trim()) return;
    save ? setSaving(true) : setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/brand-guidelines/scrape-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), save }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data: { kit: BrandKit } };
      setKit(body.data.kit);
      if (save) {
        toast('success', 'Brand kit saved — imported from your website.');
        router.refresh();
      }
    } catch {
      toast('error', 'Could not scan that URL. Check it is public and reachable.');
    } finally {
      save ? setSaving(false) : setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import from website</CardTitle>
        <CardDescription>
          Enter your website URL — we&apos;ll pull the logo, colours and fonts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourbrand.com"
            className="flex-1 rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => scan(false)}
            disabled={loading || !url.trim()}
            className="rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50 disabled:opacity-50"
          >
            {loading ? 'Scanning…' : 'Preview'}
          </button>
        </div>

        {kit ? (
          <div className="mt-4 rounded-lg border border-secondary-200 p-4">
            <div className="flex flex-wrap items-center gap-4">
              {kit.logoUrl ? (
                <img
                  src={kit.logoUrl}
                  alt="Detected logo"
                  className="h-10 w-auto max-w-[140px] object-contain"
                />
              ) : (
                <span className="text-xs text-secondary-400">No logo detected</span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {kit.colors.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded border border-secondary-200 px-1.5 py-0.5 text-xs text-secondary-600"
                  >
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {kit.fonts.length > 0 ? (
              <p className="mt-3 text-xs text-secondary-500">Fonts: {kit.fonts.join(', ')}</p>
            ) : null}
            <button
              type="button"
              onClick={() => scan(true)}
              disabled={saving}
              className="mt-4 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save as brand kit'}
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
