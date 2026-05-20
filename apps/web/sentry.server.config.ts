/**
 * Server-side Sentry init (Next.js Node runtime — server components,
 * API routes, server actions). Never bundled into the browser. SENTRY_DSN
 * is the server-side variant; can be the same value as the client DSN
 * if a single Sentry project is used.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
  });
}
