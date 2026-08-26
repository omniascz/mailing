/**
 * Sentry instrumentation — server-side error capture for the API.
 *
 * `initTelemetry()` is a no-op when SENTRY_DSN is unset, so dev runs and
 * test suites never ship anywhere. In production set SENTRY_DSN and
 * unhandled errors propagating to the Fastify error handler get
 * forwarded with the usual breadcrumbs (request method/path, user/org
 * from the session).
 *
 * The scrubbing below is duplicated in the workers' mirror at
 * `apps/workers/src/lib/telemetry.ts` rather than lifted into
 * `@forgemsg/shared`: this module is deliberately dependency-free (only
 * `@sentry/node` and the local env), because it has to be imported before
 * Fastify in order to instrument the runtime. Keep the two in sync by hand.
 */
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

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
const REDACTED_BODY_FIELDS = [
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
  // DKIM signing material. `privatekey` is the live one: it is the literal
  // field name on the BYODKIM import body (`routes/v1/domains.ts`), which is
  // the one request in this service that carries a plaintext private key.
  // Fastify keeps the parsed body on its own request wrapper rather than on the
  // raw IncomingMessage that Sentry reads, so that body is not captured today —
  // this is the guard for the day that stops being true.
  'privatekey',
  'private_key',
  'privatekeypem',
  'dkimprivatekey',
  'dkim',
  'pem',
] as const;

const REDACTED_BODY_FIELD_SET: ReadonlySet<string> = new Set<string>(REDACTED_BODY_FIELDS);

/**
 * A PEM block, terminated or not. Sentry's console integration truncates a
 * breadcrumb message to 2 KB, so a key inlined into a log line very often
 * arrives with its BEGIN header and no END footer — the second alternative
 * catches that tail. Tried before the key/value pass because a PEM is
 * recognizable on its own, whatever label it happened to be printed under.
 */
const PEM_BLOCK =
  /-----BEGIN[^-\n]*-----[\s\S]*?-----END[^-\n]*-----|-----BEGIN[^-\n]*-----[\s\S]*/g;

/**
 * `key: value` and `key=value` fragments for the same denied names. Breadcrumb
 * messages are flat strings — `util.format()` of whatever was handed to
 * `console.*` — so `scrubBody` cannot reach into them by key and this is the
 * only handle available. The trailing `\b` makes alternation order irrelevant:
 * `privatekey` cannot swallow the prefix of `privateKeyPem`.
 */
const REDACTED_PAIR = new RegExp(
  String.raw`\b(${REDACTED_BODY_FIELDS.join('|')})\b(\s*[:=]\s*)('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)`,
  'gi',
);

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

/** Redacts secrets inlined into free text — i.e. breadcrumb messages. */
function scrubText(text: string): string {
  return text.replace(PEM_BLOCK, '[redacted]').replace(REDACTED_PAIR, "$1$2'[redacted]'");
}

function scrubBody(node: unknown): unknown {
  if (typeof node === 'string') return scrubText(node);
  if (Array.isArray(node)) return node.map(scrubBody);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = REDACTED_BODY_FIELD_SET.has(key.toLowerCase()) ? '[redacted]' : scrubBody(value);
    }
    return out;
  }
  return node;
}

/**
 * Scrubs the breadcrumb trail. This closes a trap rather than a live leak.
 * `consoleIntegration` is on by default, so every `console.*` call becomes a
 * breadcrumb carrying `util.format(...args)` truncated to 2 KB — and beforeSend
 * used to scrub the request only, leaving the trail untouched. Nothing logs a
 * private key today; the first one that does would have shipped it to a third
 * party as a side effect of the log line.
 *
 * Exported so the test can drive it directly instead of standing up a client.
 */
export function scrubBreadcrumbs(event: { breadcrumbs?: unknown }): void {
  const crumbs = event.breadcrumbs;
  if (!Array.isArray(crumbs)) return;
  for (const crumb of crumbs) {
    if (!crumb || typeof crumb !== 'object') continue;
    const c = crumb as { message?: unknown; data?: unknown };
    if (typeof c.message === 'string') c.message = scrubText(c.message);
    if (c.data !== undefined) c.data = scrubBody(c.data);
  }
}

/** Exported for the test — the exact transform beforeSend applies. */
export function scrubEvent<T extends { request?: unknown; breadcrumbs?: unknown }>(event: T): T {
  const req = (event as SentryEvent).request;
  if (req) {
    scrubHeaders(req.headers);
    if (req.data !== undefined) {
      req.data = scrubBody(req.data);
    }
  }
  scrubBreadcrumbs(event);
  return event;
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
      return scrubEvent(event);
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
