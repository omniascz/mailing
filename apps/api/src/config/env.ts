/**
 * The API's environment schema. One module, deliberately.
 *
 * There used to be two: this one, and `lib/env.ts` — a separate boot-time
 * validator imported for its side effect on the first line of index.ts. They
 * disagreed. `lib/env.ts` required DATABASE_URL, REDIS_URL and JWT_SECRET with
 * no defaults; this file defaulted the first two to localhost. Which behaviour
 * you got depended on which module you happened to read, and the effective one
 * was whichever ran first. Everything from both now lives here, including the
 * post-parse production checks that only `lib/env.ts` had.
 *
 * Usage:
 *   import { env } from './config/env.js';
 *   await connect(env.DATABASE_URL);
 */

import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Blocks `.default()` at the type level. `.default` still exists at runtime —
 * this is a type guard, not a deletion — but calling it is a compile error.
 */
type NoChainedDefault<T> = T & { readonly default: never };

/**
 * Required in production, relaxed in dev/test.
 *
 * Do NOT write `prodRequired(schema).default('dev-value')`. `.default()` is
 * applied to the *result*, so in production the schema becomes
 * `schema.default('dev-value')` — a missing variable then parses successfully
 * and the app runs on a value committed to this repository instead of refusing
 * to boot. That shipped twice: SESSION_SECRET and INTERNAL_API_SECRET.
 *
 * Pass the dev default as the second argument. It is applied only outside
 * production, so the two cases cannot be conflated. The return type makes the
 * wrong form a typecheck error rather than a production incident.
 *
 * This helper is duplicated in apps/workers and apps/voice-bot rather than
 * shared. `packages/shared` is consumed as a TypeScript project reference
 * against its `dist` declarations: exporting the helper from raw `src` breaks
 * type identity and silently degrades `z.infer<typeof Env>` to `{}`, and
 * exporting it from `dist` would make boot-time env parsing depend on another
 * package being built first — a worse failure mode for the one module whose
 * job is to fail fast with a readable message. Each copy is covered by tests.
 */
function prodRequired<T extends z.ZodString>(schema: T): NoChainedDefault<T | z.ZodOptional<T>>;
function prodRequired<T extends z.ZodString>(
  schema: T,
  devDefault: string,
): NoChainedDefault<T | z.ZodDefault<T>>;
function prodRequired<T extends z.ZodString>(schema: T, devDefault?: string) {
  if (isProduction) return schema as NoChainedDefault<T>;
  return (
    devDefault === undefined ? schema.optional() : schema.default(devDefault)
  ) as NoChainedDefault<z.ZodOptional<T> | z.ZodDefault<T>>;
}

const Env = z.object({
  // ─── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

  // ─── Public URLs ──────────────────────────────────────────────────────────
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Checked again after parsing: both must actually be set in production, or
  // DOI email links and tracking pixels point nowhere.
  API_PUBLIC_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  TRACKING_BASE_URL: z.string().url().optional(),

  // ─── Datastores ───────────────────────────────────────────────────────────
  // No defaults. `lib/env.ts` required these outright and ran first, so a boot
  // without them already failed — defaulting them here would be a regression
  // dressed up as a merge. The test branch below supplies its own values.
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid postgresql:// URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid redis:// URL' }),
  EU_DATABASE_URL: z.string().url().optional(),
  AP_DATABASE_URL: z.string().url().optional(),
  CLICKHOUSE_URL: z.string().url().default('http://localhost:8123'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),

  // ─── Object storage (MinIO in dev, S3 in prod) ────────────────────────────
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  // `minioadmin/minioadmin` is the MinIO default and is written in this file,
  // so booting production on it means anyone can read and write the bucket.
  MINIO_ACCESS_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_SECRET_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_BUCKET: z.string().default('forgemsg'),
  MINIO_USE_SSL: z.coerce.boolean().default(false),

  // ─── Secrets (must be set in prod) ────────────────────────────────────────
  JWT_SECRET: z.string().min(16, {
    message: 'JWT_SECRET must be at least 16 chars (use a 64-byte random in production)',
  }),
  SESSION_SECRET: prodRequired(z.string().min(32), 'dev-cookie-secret-change-in-production'),
  // Shared secret for /api/v1/internal/*. The API is published on an
  // internet-facing ingress with `path: /`, so an unset secret in production
  // means those routes are open to the world.
  INTERNAL_API_SECRET: prodRequired(z.string().min(32), 'dev-internal-secret-change-in-production'),
  DMARC_INBOUND_SECRET: prodRequired(z.string().min(16)),

  // ─── Our own signing / encryption keys ────────────────────────────────────
  // Each of these signs or encrypts something WE issue, and each previously
  // fell back to a string committed in this repository. Verified by running
  // them with the variable unset: a forged token signed with the fallback was
  // accepted by the real verifier in every case.
  //
  // HMAC-SHA256 over the signed-download token (assetId, contactId, exp).
  ASSET_SIGNING_SECRET: prodRequired(z.string().min(32), 'dev-asset-signing-secret-change-me-32'),
  // Shared secret on the inbound-email webhook. The check used to be
  // `if (secret && …)`, so an unset value skipped authentication entirely.
  INBOUND_EMAIL_SECRET: prodRequired(z.string().min(32), 'dev-inbound-email-secret-change-me-32'),
  // AES-256-GCM key material for the `fmcid` contact token in form autofill.
  FORM_AUTOFILL_SECRET: prodRequired(z.string().min(32), 'dev-form-autofill-secret-change-me-32'),
  // HMAC-SHA256 over the preference-centre token (orgId, contactId, exp).
  // A forged one lets anybody edit any contact's GDPR consent.
  PREFERENCE_CENTRE_SECRET: prodRequired(
    z.string().min(32),
    'dev-preference-centre-secret-change-32',
  ),
  // Deliberately optional: HIPAA mode is per-org opt-in (enableHipaaMode), so
  // requiring this would stop every non-healthcare deployment from booting.
  // The guarantee is enforced where it belongs instead — enableHipaaMode
  // refuses without a key, and encryptPhiValue throws rather than silently
  // storing PHI as plaintext. 64 hex chars = the 32 bytes AES-256 needs.
  HIPAA_FIELD_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'HIPAA_FIELD_KEY must be 64 hex chars (32 bytes)')
    .optional(),
  // Deliberately optional: absent means the partner provisioning endpoint is
  // closed, which is already the correct default. checkPartnerSecret returns
  // false for every input when unset — pinned by a test.
  PARTNER_PROVISION_SECRET: z.string().min(32).optional(),

  // Found while classifying the rest: these also guard requests coming IN to
  // us, not calls going out, so they belong in this group rather than with the
  // third-party credentials.
  //
  // verifyFblSecret read `if (!expected) return true; // not configured — allow`
  // — an unset value accepted any feedback-loop POST, and those writes land in
  // the suppression list.
  FBL_WEBHOOK_SECRET: prodRequired(z.string().min(32), 'dev-fbl-webhook-secret-change-me-32ch'),
  // Meta/WhatsApp subscription handshakes compared against `?? ''`, so an
  // attacker sending an empty hub.verify_token matched when unset.
  META_WEBHOOK_VERIFY_TOKEN: prodRequired(z.string().min(16), 'dev-meta-verify-token-change-me'),
  WHATSAPP_VERIFY_TOKEN: prodRequired(z.string().min(16), 'dev-whatsapp-verify-token-change'),
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: prodRequired(
    z.string().min(16),
    'dev-facebook-verify-token-change',
  ),

  // ─── External providers ───────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // ─── Telemetry ────────────────────────────────────────────────────────────
  // With SENTRY_DSN unset, telemetry init is a no-op, so dev runs and tests
  // ship nothing anywhere. Sample rate stays low by default; raise it during
  // an incident.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  SENTRY_RELEASE: z.string().optional(),

  // ─── Platform operator alerts ─────────────────────────────────────────────
  // Address notified on platform events (new signups, abuse reports). Unset
  // makes alerting a no-op.
  OPERATOR_EMAIL: z.string().email().optional(),

  // ─── Instatus status page ─────────────────────────────────────────────────
  // Both keys must be set together. With either unset the status-page client
  // is a no-op and /internal/status-page/* answers
  // { status: 'noop', available: false } instead of erroring.
  INSTATUS_API_KEY: z.string().optional(),
  INSTATUS_PAGE_ID: z.string().optional(),

  // ─── Email / DMARC / deliverability ───────────────────────────────────────
  DMARC_REPORT_EMAIL: z.string().email().default('dmarc-reports@forgemsg.com'),

  // ─── Filesystem (dev-only paths) ──────────────────────────────────────────
  IMPORT_UPLOAD_DIR: z.string().optional(),
});

export type Env = z.infer<typeof Env>;

/**
 * Production-only sanity checks a schema cannot express: values that are
 * individually well-formed but wrong for a deployed environment.
 *
 * Exported so tests can exercise each rule without booting the module.
 */
export function productionIssues(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const issues: string[] = [];

  if (env.JWT_SECRET.startsWith('dev-') || env.JWT_SECRET.includes('change')) {
    issues.push('JWT_SECRET still looks like the dev placeholder. Generate a real one.');
  }

  // Prod pointing at localhost almost always means a misconfigured container.
  if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')) {
    issues.push(
      'DATABASE_URL points at localhost in production — almost certainly a misconfigured deploy.',
    );
  }

  // This used to read `if (refineProd(z.unknown()) && !env.API_PUBLIC_URL)`.
  // refineProd returned its argument unchanged in both branches, so the left
  // operand was a truthy Zod object and the whole guard reduced to the right
  // half — the check worked, but only by accident, and read as if it were
  // conditional on something.
  if (!env.API_PUBLIC_URL) {
    issues.push(
      'API_PUBLIC_URL must be set in production — DOI email links and tracking pixels break without it.',
    );
  }

  if (!env.APP_URL) {
    issues.push('APP_URL must be set in production.');
  }

  return issues;
}

/**
 * Vitest sets NODE_ENV=test. Most unit tests never boot the server, but some
 * import index.ts transitively and would die at module load under the strict
 * schema. Tests get lax datastore values; integration suites set their own.
 */
function testDefaults(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-not-for-production',
    ...process.env,
    NODE_ENV: 'test',
  };
}

function fail(issues: string): never {
  // Plain console.error — the pino logger does not exist this early.
  console.error(`✖ Invalid environment configuration:\n${issues}`);
  if (isProduction) {
    process.exit(1);
  }
  // In dev/test, throw so tests surface the problem instead of half-booting.
  throw new Error('Invalid environment configuration');
}

function loadEnv(): Env {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const parsed = Env.safeParse(isTest ? testDefaults() : process.env);

  if (!parsed.success) {
    fail(
      parsed.error.issues
        .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('\n'),
    );
  }

  const issues = productionIssues(parsed.data);
  if (issues.length > 0) {
    fail(issues.map((m) => `  - ${m}`).join('\n'));
  }

  return parsed.data;
}

export const env: Env = loadEnv();
