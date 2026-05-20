/**
 * Browser-side Sentry init. Runs only when NEXT_PUBLIC_SENTRY_DSN is set
 * — local dev and tests pay nothing. Bundled into the client JS, so any
 * value here ships to the browser; never put secrets here.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    // Browser sample rate kept conservative — UI errors are noisy and
    // most are environmental (ad blockers, extensions). Bump during
    // incidents.
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.02'),
    // Session replay is enticing but bandwidth-heavy + PII risk. Off
    // until we explicitly want it for an incident.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
