'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { AlertOctagon, RefreshCw, ArrowLeft } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx] rendered error boundary', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary-50 px-6">
      <div className="max-w-md">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white text-rose-600 ring-1 ring-secondary-200">
          <AlertOctagon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold text-secondary-900">Něco se nepovedlo.</h1>
        <p className="mt-2 text-sm text-secondary-600">
          Akce selhala kvůli neočekávané chybě. Můžete ji zkusit znovu, nebo se vrátit na hlavní
          stránku.
        </p>
        {error.digest ? (
          <p className="mt-3 inline-block rounded bg-secondary-100 px-2 py-1 font-mono text-[11px] text-secondary-700">
            ID chyby: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <RefreshCw className="h-4 w-4" /> Zkusit znovu
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:border-secondary-400"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
