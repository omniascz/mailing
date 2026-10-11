'use client';

import { useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorStateFor } from '@/lib/api-outcome';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  useEffect(() => {
    console.error('[dashboard/error.tsx]', error);
  }, [error]);

  // An API failure says what it was (api-outcome.ts) — a refused request, a
  // server error, an API that did not answer — instead of the production
  // build's generic message. Retrying a server-rendered page needs a refresh
  // as well as a reset, or the same failed render is shown again.
  const state = errorStateFor(error.digest);
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="mx-auto max-w-xl py-12" data-testid="error-state" data-digest={error.digest}>
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <div className="mb-3 flex items-center gap-2 text-rose-700">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">{state?.title ?? 'Načítání selhalo'}</h2>
        </div>
        <p className="text-sm text-rose-900/80">
          {state?.text ?? (error.message || 'Neznámá chyba při načítání stránky.')}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-rose-700/70">ID: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex gap-2">
          {state?.href ? (
            <Link
              href={state.href}
              className="inline-flex items-center justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {state.linkLabel}
            </Link>
          ) : null}
          {state?.retry !== false ? (
            <Button onClick={retry} variant="primary" loading={retrying}>
              <RefreshCw className="h-4 w-4" /> Zkusit znovu
            </Button>
          ) : null}
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
