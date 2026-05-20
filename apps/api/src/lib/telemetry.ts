/**
 * Sentry instrumentation — server-side error capture for the API.
 *
 * `initTelemetry()` is a no-op when SENTRY_DSN is unset, so dev runs and
 * test suites never ship anywhere. In production set SENTRY_DSN and
 * unhandled errors propagating to the Fastify error handler get
 * forwarded with the usual breadcrumbs (request method/path, user/org
 * from the session).
 */
import * as Sentry from '@sentry/node';
import { env } from './env.js';

let initialized = false;

/**
 * Headers that must never leave the process. Includes session cookies,
 * bearer tokens, the internal worker-API shared secret, and CDN
 * forwarding headers that may carry user IPs (kept out of Sentry to
 * minimize PII; the `request_id` tag is enough for log cross-reference).
 */
const REDACTED_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'x-api-key',
  'x-internal-secret',
  'x-forwarded-for',
  'x-real-ip',
]);

/**
 * Request body fields to redact. Casing-insensitive; matches anywhere
 * in nested objects via recursive scrub. We don't allow-list because
 * any future password-like field would silently leak — deny-list with
 * common names is safer.
 */
const REDACTED_BODY_FIELDS = new Set([
  'password',
  'newpassword',
  'confirmpassword',
  'currentpassword',
  'oldpassword',
  'token',
  'apikey',
  'api_key',
  'secret',
  'passwordhash',
  'password_hash',
]);

interface SentryEvent {
  request?: {
    headers?: Record<string, string>;
    data?: unknown;
  };
}

function scrubHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) {
      headers[key] = '[redacted]';
    }
  }
}

function scrubBody(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(scrubBody);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = REDACTED_BODY_FIELDS.has(key.toLowerCase()) ? '[redacted]' : scrubBody(value);
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
      const req = (event as SentryEvent).request;
      if (req) {
        scrubHeaders(req.headers);
        if (req.data !== undefined) {
          req.data = scrubBody(req.data);
        }
      }
      return event;
    },
  });

  initialized = true;
}

export function isTelemetryEnabled(): boolean {
  return initialized;
}

/**
 * Capture an error with optional structured context. Safe to call when
 * telemetry isn't initialized — falls through silently. Always pair
 * with a logger.error() so we still see the message in stdout when
 * Sentry is disabled.
 */
export function captureException(
  err: unknown,
  context?: {
    orgId?: string;
    userId?: string;
    requestId?: string;
    route?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context?.orgId) scope.setTag('org_id', context.orgId);
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.requestId) scope.setTag('request_id', context.requestId);
    if (context?.route) scope.setTag('route', context.route);
    if (context?.extra) scope.setContext('extra', context.extra);
    Sentry.captureException(err);
  });
}

/** Flushes pending events. Call before process.exit() to avoid losing in-flight. */
export async function flushTelemetry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.close(timeoutMs);
}
