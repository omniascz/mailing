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
import { DEV_TRACKING_SECRET } from '@forgemsg/shared';
import {
  resolveBeyondCoreGroups,
  BeyondCoreConfigError,
  type BeyondCoreGroup,
  type BeyondCoreResolution,
} from '@forgemsg/shared/beyond-core';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * The development DKIM master key. 64 hex characters, deliberately obvious.
 *
 * Exported rather than inlined so the production guard in productionIssues()
 * compares against the same literal the schema hands out — a copy would drift,
 * and a drifted guard is a guard that stops firing. Unlike DEV_TRACKING_SECRET
 * this is not in packages/shared: only apps/api ever holds the master key, and
 * putting it somewhere the workers can import would invite exactly that.
 */
export const DEV_DKIM_MASTER_KEY =
  '00000000000000000000000000000000000000000000000000000000deadbeef';

/** Domain half of an address, lowercased. Only ever called on `.email()`-validated input. */
const domainOf = (address: string): string =>
  address.slice(address.lastIndexOf('@') + 1).toLowerCase();

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

/**
 * An on/off env var that must never stop the app booting when it is absent.
 *
 * Deliberately not `z.coerce.boolean()`: that coerces by JS truthiness, so the
 * string `'false'` — the obvious way to write it in a .env file — parses as
 * `true`. Values are matched explicitly and anything else is a loud error,
 * because a silently-misread feature switch is worse than a failed boot.
 */
const boolFlag = (fallback: boolean) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.enum(['true', 'false', '1', '0', 'yes', 'no']).optional(),
    )
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1' || v === 'yes'));

const Env = z
  .object({
    // ─── Runtime ──────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

    // ─── Product scope ────────────────────────────────────────────────────────
    /**
     * Everything outside the core product, behind one switch.
     *
     * ForgeMsg's core is sending: newsletters, transactional mail, attachments,
     * scheduled one-off sends, templates rendered from a payload the customer's
     * own system supplies — plus what sending needs (contacts, segmentation,
     * deliverability, reporting). CRM, helpdesk, booking, loyalty, commerce,
     * ads, CDP, SEO, social and blog were built to the wider 2026-05
     * positioning in POZICOVANI.md and are not that product.
     *
     * Off: their routes are never registered, so they are absent from
     * /docs/json and answer 404 — we do not advertise an endpoint we do not
     * stand behind. Nothing is deleted; on, the app behaves exactly as before.
     * Defaults on outside production so they keep being developed and tested.
     */
    FEATURE_BEYOND_CORE: boolFlag(!isProduction),

    /**
     * The groups to register, by name, comma-separated.
     *
     * This is the production way in; FEATURE_BEYOND_CORE is refused there. A
     * plain string rather than a parsed list because the parsing has to reject
     * unknown and blocked names with a message, which zod would flatten into
     * "Invalid enum value" — see resolveBeyondCoreGroups.
     *
     * `.default('')` and not `.optional()`: unset and empty must be the same
     * answer, and making the empty string the value rather than a nullish hole
     * is what stops a later `??` from inventing a different default. Both mean
     * no groups.
     */
    BEYOND_CORE_GROUPS: z.string().default(''),

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
    // One bucket, one name. Five call sites used to read this straight from
    // process.env with their own fallback, and the fallbacks disagreed:
    // 'forgemsg' in analytics + media, 'forgemsg-recordings' in the event
    // archive, call recordings and voicemail. With the variable unset — which
    // is every developer machine that skipped .env — media went to one bucket
    // and the archive to another, and nothing said so.
    //
    // `.min(1)` because `??` does not catch an empty string: `MINIO_BUCKET=`
    // in a .env file used to sail through and hand the S3 client `''`.
    // prodRequired for the same reason MINIO_ACCESS_KEY has it — a committed
    // default is a fine developer convenience and a bad production value.
    MINIO_BUCKET: prodRequired(z.string().min(1), 'forgemsg'),
    // Video messages live in their own store; it was read only in
    // services/video/recorder.ts and never validated.
    MINIO_VIDEO_BUCKET: prodRequired(z.string().min(1), 'forgemsg-videos'),
    MINIO_USE_SSL: z.coerce.boolean().default(false),

    // ─── Secrets (must be set in prod) ────────────────────────────────────────
    JWT_SECRET: z.string().min(16, {
      message: 'JWT_SECRET must be at least 16 chars (use a 64-byte random in production)',
    }),
    SESSION_SECRET: prodRequired(z.string().min(32), 'dev-cookie-secret-change-in-production'),
    // Shared secret for /api/v1/internal/*. The API is published on an
    // internet-facing ingress with `path: /`, so an unset secret in production
    // means those routes are open to the world.
    INTERNAL_API_SECRET: prodRequired(
      z.string().min(32),
      'dev-internal-secret-change-in-production',
    ),
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
    // HMAC-SHA256 over every token we hand to a recipient: the open pixel, every
    // wrapped link, the unsubscribe link in List-Unsubscribe, the preference
    // centre and view-in-browser. It is read in packages/shared, not here, so the
    // PR #9 sweep — which walked `process.env` keys inside apps/api — never saw
    // it. A forged open or click moves campaign statistics and, through them, the
    // A/B winner; a forged unsubscribe token alters someone else's subscription.
    // The dev fallback lives with the code that signs, so all three processes
    // agree on one literal instead of keeping copies that drift.
    TRACKING_SECRET: prodRequired(z.string().min(32), DEV_TRACKING_SECRET),
    // Deliberately optional: HIPAA mode is per-org opt-in (enableHipaaMode), so
    // requiring this would stop every non-healthcare deployment from booting.
    // The guarantee is enforced where it belongs instead — enableHipaaMode
    // refuses without a key, and encryptPhiValue throws rather than silently
    // storing PHI as plaintext. 64 hex chars = the 32 bytes AES-256 needs.
    HIPAA_FIELD_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'HIPAA_FIELD_KEY must be 64 hex chars (32 bytes)')
      .optional(),
    // Master key for the DKIM private keys at rest (lib/crypto/envelope.ts). It
    // wraps a per-row DEK, which encrypts the key itself.
    //
    // NOT optional the way HIPAA_FIELD_KEY is. HIPAA mode is per-org opt-in, so
    // most deployments legitimately never set that one. DKIM is not opt-in —
    // every deployment that sends mail signs it, so a production instance
    // without this key can neither store a new key nor read an existing one,
    // and refusing to boot says so at deploy time instead of at the first send.
    //
    // The dev default is committed on purpose: without it `pnpm dev` and the
    // test suites cannot round-trip a key. productionIssues() below refuses to
    // start production on this exact value, so the convenience cannot leak.
    DKIM_MASTER_KEY: prodRequired(
      z.string().regex(/^[0-9a-fA-F]{64}$/, 'DKIM_MASTER_KEY must be 64 hex chars (32 bytes)'),
      DEV_DKIM_MASTER_KEY,
    ),
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
    // Billing is not optional in production, and these were.
    //
    // routes/v1/billing.ts is registered with a plain app.register — core, not
    // registerBeyondCore — so every deployment serves /billing/checkout,
    // /billing/portal and /billing/webhook. With the keys unset the process
    // starts happily and each of those fails at use instead: checkout, portal
    // and cancel throw `AppError.badRequest('Stripe not configured')` (400),
    // and the webhook throws `STRIPE_WEBHOOK_SECRET not configured` (500). A
    // customer clicking Upgrade gets a broken button, and Stripe's
    // subscription events are answered 500 and retried into nothing.
    //
    // Measured before this change: NODE_ENV=production with both unset and
    // everything else set booted clean. That is the difference from MINIO_*,
    // where the same audit found the boot already refusing.
    //
    // prodRequired with no dev default, like the object-store credentials in
    // #99: absent in development, mandatory in production, and the failure
    // moves from a 400 the customer sees to a refusal to start that the
    // operator sees.
    STRIPE_SECRET_KEY: prodRequired(z.string()),
    STRIPE_WEBHOOK_SECRET: prodRequired(z.string()),

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

    // ─── System mail sender ───────────────────────────────────────────────────
    // One name for one thing. There used to be three — SYSTEM_EMAIL_FROM,
    // SYSTEM_FROM_EMAIL and DOI_FROM_EMAIL — each read straight off process.env
    // at its own call site with its own committed fallback, on three different
    // domains. Setting one left the other two paths sending from somewhere else.
    //
    // Required in every environment, dev included. There is deliberately no
    // devDefault: an address that "works" unconfigured is exactly how the old
    // fallbacks shipped, and system mail has to come from a domain the operator
    // controls and has SPF/DKIM for.
    //
    // .min(1) before .email() only buys a readable message — an empty string
    // fails either way. It matters because the old call sites used `??`, which
    // does not treat '' as absent: a set-but-empty variable produced an empty
    // From rather than the fallback, all the way to MAIL FROM:<>.
    SYSTEM_EMAIL_FROM: z
      .string()
      .min(1, 'SYSTEM_EMAIL_FROM is required and must not be empty')
      .email('SYSTEM_EMAIL_FROM must be a valid email address'),
    SYSTEM_EMAIL_FROM_NAME: z
      .string()
      .min(1, 'SYSTEM_EMAIL_FROM_NAME is required and must not be empty'),

    // Optional override for scheduled-report delivery, so replies to a report can
    // reach a mailbox someone reads. Empty is treated as absent here — unlike the
    // required pair above — because a deploy that passes every variable through
    // unconditionally has no other way to say "not set". Its domain is checked
    // against SYSTEM_EMAIL_FROM below.
    REPORTS_FROM_EMAIL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().email('REPORTS_FROM_EMAIL must be a valid email address').optional(),
    ),

    // ─── Filesystem (dev-only paths) ──────────────────────────────────────────
    IMPORT_UPLOAD_DIR: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    // MINIO_ENDPOINT defaults to localhost, which inside the API container is
    // the API. docker-compose.prod.yml passed the credentials and nothing else,
    // so every upload in production aimed at the wrong host and failed at use
    // with a connection error rather than at boot with a reason.
    //
    // Object storage is not optional in production. The surfaces that need it
    // are core, not add-ons: mediaRoutes and digitalAssetRoutes are both
    // registered with a plain app.register (index.ts), not through
    // registerBeyondCore, so they exist in every deployment — and both write
    // and read through lib/object-store.ts. An image in a template is served
    // from that store to every recipient's mail client. MINIO_ACCESS_KEY,
    // MINIO_SECRET_KEY, MINIO_BUCKET and MINIO_VIDEO_BUCKET are all
    // prodRequired above, which means a production process with any of them
    // unset does not start.
    //
    // The endpoint has to be checked here rather than being prodRequired
    // because it carries a dev default of `localhost` and defaults survive
    // prodRequired's dev branch only — it is the one MINIO_* variable whose
    // absence would otherwise resolve to a plausible, wrong value instead of
    // an error. Leaving it at that default in production is the same shape as
    // SENDING_IPS without WARMUP_API_URL in the engine.
    //
    // This comment used to say the opposite — "an API with no object storage
    // is a legitimate deployment" — and the message below used to offer
    // unsetting the credentials as the way to declare that. Neither was true.
    // prodRequired makes them required, so following that advice produced
    // `MINIO_ACCESS_KEY: Required` and a refusal to boot: an escape hatch that
    // did not exist, printed by the very check that closed it.
    if (isProduction && !process.env.MINIO_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MINIO_ENDPOINT'],
        message:
          'MINIO_ENDPOINT is required in production. It defaults to `localhost`, which ' +
          'inside a container is this process — so uploads would be attempted against the ' +
          'API itself. Set it to the host of the object store. Production always needs one — ' +
          'the media library and digital assets are core surfaces and serve from it — which ' +
          'is why MINIO_ACCESS_KEY, MINIO_SECRET_KEY and MINIO_BUCKET are required too.',
      });
    }

    // Launch is on a shared IP pool: reputation is borrowed, not owned, and the
    // only thing separating this mail from the rest of the pool is domain
    // authentication. A reports sender on a second domain needs its own
    // SPF/DKIM/DMARC, and unaligned mail off a shared pool is what gets the
    // whole system stream filtered. One domain, verified once.
    if (
      cfg.REPORTS_FROM_EMAIL &&
      domainOf(cfg.REPORTS_FROM_EMAIL) !== domainOf(cfg.SYSTEM_EMAIL_FROM)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REPORTS_FROM_EMAIL'],
        message:
          `REPORTS_FROM_EMAIL (${cfg.REPORTS_FROM_EMAIL}) must be on the same domain as ` +
          `SYSTEM_EMAIL_FROM (${cfg.SYSTEM_EMAIL_FROM}). A second sending domain needs its ` +
          `own SPF/DKIM before it can carry system mail.`,
      });
    }
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

  // The schema cannot catch this one. DKIM_MASTER_KEY is prodRequired, so a
  // production boot with the variable absent already fails — but a deployment
  // that copied .env.example, or a container that inherited the dev compose
  // file, arrives with a *present* and well-formed value that happens to be the
  // one committed to this repository. Every DKIM key in that database would
  // then be decryptable by anyone holding a checkout, which is the same as not
  // encrypting them at all, while every check reports the feature as on.
  //
  // Explicit rather than folded into the `startsWith('dev-')` shape used for
  // JWT_SECRET: a hex key has no prefix to look for.
  if (env.DKIM_MASTER_KEY === DEV_DKIM_MASTER_KEY) {
    issues.push(
      'DKIM_MASTER_KEY is still the development default committed to this repository. ' +
        'Every DKIM private key encrypted with it is readable by anyone with a checkout. ' +
        'Generate one with `openssl rand -hex 32`.',
    );
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
    // Listed before the spread deliberately: an unset variable gets this value,
    // a set one — including a deliberately empty one — overrides it. That is
    // what lets the tests exercise the empty-string case against the real
    // loader instead of a re-implementation of it.
    SYSTEM_EMAIL_FROM: 'no-reply@test.invalid',
    SYSTEM_EMAIL_FROM_NAME: 'ForgeMsg Test',
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

  // Publish the RESOLVED master key back to process.env.
  //
  // lib/crypto/envelope.ts reads the variable at use time rather than importing
  // this module — that is what lets a test point it at a different key without
  // rebuilding the config, and it is the shape hipaa.ts already uses. But the
  // dev default lives in the schema, not in the environment, so without this
  // line a developer or a test with no DKIM_MASTER_KEY set would pass boot
  // validation and then throw on the first key it tried to read: validated in
  // one place, absent in the other.
  //
  // In production this is a no-op — the value came from process.env to begin
  // with. It only ever materialises a default that was already decided here.
  process.env.DKIM_MASTER_KEY = parsed.data.DKIM_MASTER_KEY;

  return parsed.data;
}

const base = loadEnv();

/**
 * Resolve the beyond-core groups at boot, not per request.
 *
 * An unknown or blocked name has to stop the process, and it has to stop it
 * here — the same place every other configuration mistake is caught — rather
 * than at the first request that would have needed the group. `fail()` exits in
 * production and throws in dev/test, which is what lets a test assert the
 * refusal without killing the runner.
 */
let resolved: BeyondCoreResolution;
try {
  resolved = resolveBeyondCoreGroups({
    raw: base.BEYOND_CORE_GROUPS,
    all: base.FEATURE_BEYOND_CORE,
    isProduction,
  });
} catch (err) {
  if (err instanceof BeyondCoreConfigError) fail(`  - ${err.message}`);
  throw err;
}

// Printed, not inferred. An operator reading the boot log sees the rollout as
// a list of names; a boolean would have made them go and read the code.
console.log(`[env] ${resolved.summary}`);

export const env: Env & { BEYOND_CORE_ENABLED: ReadonlySet<BeyondCoreGroup> } = {
  ...base,
  BEYOND_CORE_ENABLED: resolved.enabled,
};
