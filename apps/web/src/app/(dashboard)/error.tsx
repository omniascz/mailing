'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard/error.tsx]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <div className="mb-3 flex items-center gap-2 text-rose-700">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Načítání selhalo</h2>
        </div>
        <p className="text-sm text-rose-900/80">
          {error.message || 'Neznámá chyba při načítání stránky.'}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-rose-700/70">ID: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button onClick={reset} variant="primary">
            <RefreshCw className="h-4 w-4" /> Zkusit znovu
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-secondary-300 bg-white px-3 py-2 text-sm font-medium text-secondary-700 hover:border-secondary-400"
          >
            Zpět
          </Link>
        </div>
      </div>
    </div>
  );
}
