/**
 * Sentry instrumentation for the worker process. Mirror of the API
 * helper at `apps/api/src/lib/telemetry.ts`. No-op when SENTRY_DSN is
 * unset so local dev + tests don't ship anything.
 *
 * The scrubbing below is duplicated in that mirror rather than lifted into
 * `@forgemsg/shared`: this module is deliberately dependency-free (only
 * `@sentry/node` and the local env), because it has to run before anything else
 * is imported in order to instrument the runtime. Keep the two in sync by hand.
 */
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

let initialized = false;

/**
 * Job payloads can contain rendered email HTML + recipient PII (email
 * addresses, names). We scrub the body fields most likely to carry
 * secrets before shipping. Keys are casing-insensitive.
 */
const REDACTED_FIELDS = [
  'token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'x-internal-secret',
  // DKIM signing material. `dkimprivatekey` is the one that actually matters:
  // it is the literal field name carried on the mta / batch-sender / splitter
  // job payloads (see `queues/index.ts`). The rest are the shapes the same key
  // travels under elsewhere — `privateKeyPem` on the gRPC contract and in the
  // rotation service, `privateKey` on the BYODKIM import body — listed so a
  // rename on one of those paths does not silently reopen this.
  'dkimprivatekey',
  'privatekey',
  'private_key',
  'privatekeypem',
  'dkim',
  'pem',
] as const;

const REDACTED_FIELD_SET: ReadonlySet<string> = new Set<string>(REDACTED_FIELDS);

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
 * `console.*` — so `scrubObject` cannot reach into them by key and this is the
 * only handle available. The trailing `\b` makes alternation order irrelevant:
 * `privatekey` cannot swallow the prefix of `privateKeyPem`.
 */
const REDACTED_PAIR = new RegExp(
  String.raw`\b(${REDACTED_FIELDS.join('|')})\b(\s*[:=]\s*)('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)`,
  'gi',
);

/** Redacts secrets inlined into free text — i.e. breadcrumb messages. */
function scrubText(text: string): string {
  return text.replace(PEM_BLOCK, '[redacted]').replace(REDACTED_PAIR, "$1$2'[redacted]'");
}

function scrubObject(node: unknown): unknown {
  if (typeof node === 'string') return scrubText(node);
  if (Array.isArray(node)) return node.map(scrubObject);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = REDACTED_FIELD_SET.has(key.toLowerCase()) ? '[redacted]' : scrubObject(value);
    }
    return out;
  }
  return node;
}

/**
 * Scrubs the breadcrumb trail. This closes a trap rather than a live leak.
 * `consoleIntegration` is on by default, so every `console.*` call becomes a
 * breadcrumb carrying `util.format(...args)` truncated to 2 KB — and beforeSend
 * used to scrub `contexts.job` and nothing else, leaving the trail untouched.
 * Nothing logs a job payload today; the first `console.error('...', job.data)`
 * added by somebody debugging a send would have shipped a plaintext DKIM key to
 * a third party as a side effect of the log line.
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
    if (c.data !== undefined) c.data = scrubObject(c.data);
  }
}

/** Exported for the test — the exact transform beforeSend applies. */
export function scrubEvent<T extends { contexts?: Record<string, unknown>; breadcrumbs?: unknown }>(
  event: T,
): T {
  if (event.contexts?.job) {
    event.contexts.job = scrubObject(event.contexts.job) as Record<string, unknown>;
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
      // captureJobException calls scope.setContext('job', { ... }); the console
      // integration fills event.breadcrumbs. Scrub both.
      return scrubEvent(event);
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
