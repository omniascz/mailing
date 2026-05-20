/**
 * Sentry instrumentation for the worker process. Mirror of the API
 * helper at `apps/api/src/lib/telemetry.ts`. No-op when SENTRY_DSN is
 * unset so local dev + tests don't ship anything.
 */
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

let initialized = false;

/**
 * Job payloads can contain rendered email HTML + recipient PII (email
 * addresses, names). We scrub the body fields most likely to carry
 * secrets before shipping. Keys are casing-insensitive.
 */
const REDACTED_FIELDS = new Set([
  'token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'x-internal-secret',
]);

function scrubObject(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(scrubObject);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = REDACTED_FIELDS.has(key.toLowerCase()) ? '[redacted]' : scrubObject(value);
    }
    return out;
  }
  return node;
}

export function initTelemetry(): void {
  if (initialized) return;
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    beforeSend(event) {
      // captureJobException calls scope.setContext('job', { ... }) — scrub it.
      if (event.contexts?.job) {
        event.contexts.job = scrubObject(event.contexts.job) as typeof event.contexts.job;
      }
      return event;
    },
  });

  initialized = true;
}

export function isTelemetryEnabled(): boolean {
  return initialized;
}

export function captureJobException(
  err: unknown,
  context: {
    queue: string;
    jobId?: string;
    jobName?: string;
    attempts?: number;
    orgId?: string;
    campaignId?: string;
  },
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    scope.setTag('queue', context.queue);
    if (context.jobId) scope.setTag('job_id', context.jobId);
    if (context.jobName) scope.setTag('job_name', context.jobName);
    if (context.orgId) scope.setTag('org_id', context.orgId);
    if (context.campaignId) scope.setTag('campaign_id', context.campaignId);
    scope.setContext('job', {
      queue: context.queue,
      jobId: context.jobId,
      jobName: context.jobName,
      attempts: context.attempts ?? 1,
    });
    Sentry.captureException(err);
  });
}

export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.close(timeoutMs);
}
