'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertOctagon } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="cs">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480 }}>
            <AlertOctagon style={{ width: 32, height: 32, color: '#dc2626' }} />
            <h1 style={{ fontSize: 24, marginTop: 16, color: '#0f172a' }}>Aplikace se zhroutila</h1>
            <p style={{ marginTop: 8, color: '#475569', fontSize: 14 }}>
              Došlo k chybě v rootu aplikace. Zkuste stránku načíst znovu.
              {error.digest ? (
                <code style={{ display: 'block', marginTop: 8, fontSize: 11 }}>{error.digest}</code>
              ) : null}
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                padding: '8px 16px',
                background: '#2563eb',
                color: 'white',
                border: 0,
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Znovu načíst
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
