import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { productionIssues, DEV_DKIM_MASTER_KEY } from './env.js';
import { DEV_TRACKING_SECRET } from '@forgemsg/shared';

const ORIGINAL_ENV = { ...process.env };

/**
 * The datastore trio has no defaults since lib/env.ts merged in here, so every
 * case that expects a successful parse has to supply them.
 */
const REQUIRED = {
  DATABASE_URL: 'postgresql://u:p@db.internal:5432/forgemsg',
  REDIS_URL: 'redis://redis.internal:6379',
  JWT_SECRET: 'a-real-jwt-secret-64-bytes-random-value',
  // Required in every environment now, not just production: system mail has to
  // come from a domain the operator owns, and no committed default can be right.
  SYSTEM_EMAIL_FROM: 'no-reply@ops.example',
  SYSTEM_EMAIL_FROM_NAME: 'ForgeMsg',
} as const;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env loader', () => {
  it('accepts dev defaults when nothing is set', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(3001);
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, PORT: '4000' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(4000);
  });

  it('rejects an invalid URL in DATABASE_URL', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, DATABASE_URL: 'not-a-url' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects an invalid LOG_LEVEL', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, LOG_LEVEL: 'verbose' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects out-of-range PORT', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, PORT: '99999' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('coerces MINIO_USE_SSL boolean from string', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, MINIO_USE_SSL: 'true' };
    const mod = await import('./env.js');
    expect(mod.env.MINIO_USE_SSL).toBe(true);
  });
});

/**
 * The `prodRequired` contract.
 *
 * `prodRequired(schema).default('dev-value')` reads like "required in
 * production, defaulted in dev" and does the opposite: `.default()` applies to
 * the *result*, so in production the schema becomes `schema.default('dev-value')`
 * and a missing variable parses successfully — handing the app a value that is
 * committed to this repository instead of refusing to boot.
 *
 * That shipped twice (SESSION_SECRET, INTERNAL_API_SECRET), so the behaviour is
 * pinned here against the real module rather than a re-implementation.
 */
describe('prodRequired — production must not fall back to a committed default', () => {
  /** Everything config/env.ts needs in production, minus the field under test. */
  const PROD_BASE: Record<string, string> = {
    NODE_ENV: 'production',
    ...REQUIRED,
    API_PUBLIC_URL: 'https://api.example.com',
    APP_URL: 'https://app.example.com',
    SESSION_SECRET: 'a-real-session-secret-at-least-32-chars',
    INTERNAL_API_SECRET: 'a-real-internal-secret-at-least-32-chars',
    DMARC_INBOUND_SECRET: 'a-real-dmarc-secret-16+',
    MINIO_ACCESS_KEY: 'real-access-key',
    MINIO_SECRET_KEY: 'real-secret-key',
    // Required in production alongside the two above. Its default is
    // `localhost`, which in a container is the API itself, so an unset value
    // aimed every upload at this process — docker-compose.prod.yml passed the
    // credentials and nothing else for exactly that long.
    MINIO_ENDPOINT: 'minio.internal',
    // Both buckets are prodRequired now: five call sites used to read
    // MINIO_BUCKET straight from process.env with two different fallbacks, so
    // an unset value split media and the event archive across two buckets.
    MINIO_BUCKET: 'prod-bucket',
    MINIO_VIDEO_BUCKET: 'prod-video-bucket',
    ASSET_SIGNING_SECRET: 'a-real-asset-signing-secret-32-chars',
    INBOUND_EMAIL_SECRET: 'a-real-inbound-email-secret-32-chars',
    FORM_AUTOFILL_SECRET: 'a-real-form-autofill-secret-32-chars',
    PREFERENCE_CENTRE_SECRET: 'a-real-preference-centre-secret-32ch',
    FBL_WEBHOOK_SECRET: 'a-real-fbl-webhook-secret-32-chars-x',
    META_WEBHOOK_VERIFY_TOKEN: 'a-real-meta-verify-token',
    WHATSAPP_VERIFY_TOKEN: 'a-real-whatsapp-verify-tok',
    FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'a-real-facebook-verify-tok',
    TRACKING_SECRET: 'a-real-tracking-secret-32-chars-min',
    // 64 hex chars. Not optional the way HIPAA_FIELD_KEY is: every deployment
    // that sends mail signs it, so a production API without this key can
    // neither store a new DKIM key nor read an existing one.
    DKIM_MASTER_KEY: 'f'.repeat(64),
  };

  it('production without MINIO_BUCKET is refused, and the message names it', async () => {
    // The dev default is `forgemsg`. A production deployment that never set the
    // variable would write media, campaign screenshots, the email-event
    // archive, call recordings and voicemail into a bucket named after the
    // product, which is nobody's deliberate choice.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { ...PROD_BASE };
    delete (env as Record<string, string | undefined>).MINIO_BUCKET;
    process.env = env;
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow();
    expect(spy.mock.calls.flat().join(' '), 'an operator reads this line, not the stack').toMatch(
      /MINIO_BUCKET/,
    );
    spy.mockRestore();
  });

  it('an EMPTY MINIO_BUCKET is refused exactly like a missing one', async () => {
    // `??` does not catch `''`, which is why the old call sites let
    // `MINIO_BUCKET=` through and handed the S3 client an empty bucket name.
    // The failure then surfaced on the first upload, far from its cause.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...PROD_BASE, MINIO_BUCKET: '' };
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow();
    expect(spy.mock.calls.flat().join(' ')).toMatch(/MINIO_BUCKET/);
    spy.mockRestore();
  });

  it('an empty MINIO_BUCKET is refused in development too', async () => {
    // Development has a default, so a MISSING value is fine here. An empty one
    // is not the same thing: it is someone having written the variable and left
    // it blank, and it must not silently resolve to the default.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { NODE_ENV: 'development', ...REQUIRED, MINIO_BUCKET: '' };
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
    expect(spy.mock.calls.flat().join(' ')).toMatch(/MINIO_BUCKET/);
    spy.mockRestore();
  });

  it('production without MINIO_VIDEO_BUCKET is refused', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { ...PROD_BASE };
    delete (env as Record<string, string | undefined>).MINIO_VIDEO_BUCKET;
    process.env = env;
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow();
    expect(spy.mock.calls.flat().join(' ')).toMatch(/MINIO_VIDEO_BUCKET/);
    spy.mockRestore();
  });

  it('production without MINIO_ENDPOINT is refused', async () => {
    // Not a nicety. The default is `localhost`, which inside the API container
    // is the API, so every upload went to this process instead of the store and
    // failed at use with a connection error rather than at boot with a reason.
    // The credentials are already prodRequired, so a production deployment has
    // asserted that object storage exists; leaving the endpoint at its
    // development default beside them is a mistake, not a choice.
    const env = { ...PROD_BASE };
    delete (env as Record<string, string | undefined>).MINIO_ENDPOINT;
    process.env = env;
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow();
  });

  /** Security-critical fields and the dev default each one carries. */
  const CRITICAL: Array<{ name: string; devDefault: string; realValue: string }> = [
    {
      name: 'SESSION_SECRET',
      devDefault: 'dev-cookie-secret-change-in-production',
      realValue: 'a-real-session-secret-at-least-32-chars',
    },
    {
      name: 'INTERNAL_API_SECRET',
      devDefault: 'dev-internal-secret-change-in-production',
      realValue: 'a-real-internal-secret-at-least-32-chars',
    },
    { name: 'MINIO_ACCESS_KEY', devDefault: 'minioadmin', realValue: 'real-access-key' },
    { name: 'MINIO_SECRET_KEY', devDefault: 'minioadmin', realValue: 'real-secret-key' },
    // Our own signing / encryption keys. Each previously fell back to a string
    // committed in this repository, and a token forged with that fallback was
    // accepted by the real verifier.
    {
      name: 'ASSET_SIGNING_SECRET',
      devDefault: 'dev-asset-signing-secret-change-me-32',
      realValue: 'a-real-asset-signing-secret-32-chars',
    },
    {
      name: 'INBOUND_EMAIL_SECRET',
      devDefault: 'dev-inbound-email-secret-change-me-32',
      realValue: 'a-real-inbound-email-secret-32-chars',
    },
    {
      name: 'FORM_AUTOFILL_SECRET',
      devDefault: 'dev-form-autofill-secret-change-me-32',
      realValue: 'a-real-form-autofill-secret-32-chars',
    },
    {
      name: 'PREFERENCE_CENTRE_SECRET',
      devDefault: 'dev-preference-centre-secret-change-32',
      realValue: 'a-real-preference-centre-secret-32ch',
    },
    // Found while classifying the rest of the sensitive keys: these verify
    // requests coming IN to us, so they belong here too.
    {
      name: 'FBL_WEBHOOK_SECRET',
      devDefault: 'dev-fbl-webhook-secret-change-me-32ch',
      realValue: 'a-real-fbl-webhook-secret-32-chars-x',
    },
    {
      name: 'META_WEBHOOK_VERIFY_TOKEN',
      devDefault: 'dev-meta-verify-token-change-me',
      realValue: 'a-real-meta-verify-token',
    },
    {
      name: 'WHATSAPP_VERIFY_TOKEN',
      devDefault: 'dev-whatsapp-verify-token-change',
      realValue: 'a-real-whatsapp-verify-tok',
    },
    {
      name: 'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
      devDefault: 'dev-facebook-verify-token-change',
      realValue: 'a-real-facebook-verify-tok',
    },
    // Read in packages/shared, not here, which is why the original sweep — it
    // walked `process.env` keys inside apps/api — never saw it. It signs every
    // token we hand a recipient: the open pixel, wrapped links, the
    // List-Unsubscribe link, the preference centre, view-in-browser.
    {
      name: 'TRACKING_SECRET',
      devDefault: DEV_TRACKING_SECRET,
      realValue: 'a-real-tracking-secret-32-chars-min',
    },
    // Wraps the per-row DEK that encrypts every DKIM private key at rest.
    // Without it the API can neither write a new key nor read a stored one,
    // so booting production without it is a deploy-time error, not a
    // first-send surprise.
    {
      name: 'DKIM_MASTER_KEY',
      devDefault: DEV_DKIM_MASTER_KEY,
      realValue: 'f'.repeat(64),
    },
  ];

  for (const field of CRITICAL) {
    describe(field.name, () => {
      it('production + unset → boot fails, no fallback to the dev default', async () => {
        const env: Record<string, string> = { ...PROD_BASE };
        delete env[field.name];
        process.env = env;

        // In production the loader calls process.exit(1). Stub it so the run
        // survives; the code then falls through to the throw we assert on.
        const exit = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as unknown as typeof process.exit);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
        expect(exit).toHaveBeenCalledWith(1);

        exit.mockRestore();
        error.mockRestore();
      });

      it('production + set → parse succeeds with the supplied value', async () => {
        process.env = { ...PROD_BASE };
        const mod = await import('./env.js');
        expect((mod.env as unknown as Record<string, unknown>)[field.name]).toBe(field.realValue);
      });

      it('development + unset → parse succeeds with the dev default', async () => {
        process.env = { NODE_ENV: 'development', ...REQUIRED };
        const mod = await import('./env.js');
        expect((mod.env as unknown as Record<string, unknown>)[field.name]).toBe(field.devDefault);
      });
    });
  }

  it('a production boot never yields any committed dev default', async () => {
    process.env = { ...PROD_BASE };
    const mod = await import('./env.js');
    const values = Object.values(mod.env as unknown as Record<string, unknown>);

    for (const banned of [
      'dev-cookie-secret-change-in-production',
      'dev-internal-secret-change-in-production',
      'minioadmin',
      'dev-asset-signing-secret-change-me-32',
      'dev-inbound-email-secret-change-me-32',
      'dev-form-autofill-secret-change-me-32',
      'dev-preference-centre-secret-change-32',
      // the pre-fix hardcoded fallbacks, which must never reappear
      'asset-signing-secret-change-me',
      'changeme-32-byte-secret-key-here',
      'preference-centre-secret-change-me',
      'dev-fbl-webhook-secret-change-me-32ch',
      'dev-meta-verify-token-change-me',
      'dev-whatsapp-verify-token-change',
      'dev-facebook-verify-token-change',
      DEV_TRACKING_SECRET,
      DEV_DKIM_MASTER_KEY,
      // the value it carried before it was brought under prodRequired
      'dev-tracking-secret-changeme',
      // the four system-sender fallbacks, on four domains, two of them ours
      // and two of them not
      'no-reply@example.com',
      'noreply@forgemsg.com',
      'no-reply@forgemsg.io',
      'reports@forgemsg.com',
    ]) {
      expect(values).not.toContain(banned);
    }
  });
});

/**
 * The post-parse production checks, which used to live in a second module
 * (`lib/env.ts`) that was imported for its side effect on index.ts line 3.
 * When the two modules merged, these were the part most likely to be dropped
 * silently — nothing else references them.
 */
describe('productionIssues — checks carried over from the old lib/env.ts', () => {
  const VALID: Parameters<typeof productionIssues>[0] = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-jwt-secret-64-bytes-random-value',
    DATABASE_URL: 'postgresql://u:p@db.internal:5432/forgemsg',
    API_PUBLIC_URL: 'https://api.example.com',
    APP_URL: 'https://app.example.com',
  } as Parameters<typeof productionIssues>[0];

  it('a fully-configured production env has no issues', () => {
    expect(productionIssues(VALID)).toEqual([]);
  });

  /**
   * The schema alone cannot catch this one.
   *
   * DKIM_MASTER_KEY is prodRequired, so production with the variable ABSENT
   * already fails to boot — pinned in the prodRequired table above. But a
   * deployment that copied .env.example, or a container that inherited the dev
   * compose file, arrives with a value that is present, well-formed, 64 hex
   * characters, and committed to this repository. Every DKIM private key in
   * that database is then decryptable by anyone holding a checkout, which is
   * the same as not encrypting them, while every health check reports the
   * feature as on.
   */
  it('refuses to boot production on the committed dev DKIM master key', () => {
    expect(productionIssues({ ...VALID, DKIM_MASTER_KEY: DEV_DKIM_MASTER_KEY })).toEqual([
      expect.stringContaining('DKIM_MASTER_KEY is still the development default'),
    ]);
  });

  it('accepts a real DKIM master key', () => {
    expect(productionIssues({ ...VALID, DKIM_MASTER_KEY: 'a1'.repeat(32) })).toEqual([]);
  });

  it('does not fire outside production — dev runs on the default by design', () => {
    expect(
      productionIssues({
        ...VALID,
        NODE_ENV: 'development',
        DKIM_MASTER_KEY: DEV_DKIM_MASTER_KEY,
      }),
    ).toEqual([]);
  });

  it('flags a JWT_SECRET that is still the dev placeholder', () => {
    expect(productionIssues({ ...VALID, JWT_SECRET: 'dev-secret-abc' })).toEqual([
      expect.stringContaining('JWT_SECRET still looks like the dev placeholder'),
    ]);
    // The second half of the condition: anything containing "change".
    expect(productionIssues({ ...VALID, JWT_SECRET: 'please-change-me-now' })).toEqual([
      expect.stringContaining('JWT_SECRET still looks like the dev placeholder'),
    ]);
  });

  it('flags a DATABASE_URL pointing at localhost or 127.0.0.1', () => {
    for (const url of ['postgresql://u:p@localhost:5432/f', 'postgresql://u:p@127.0.0.1:5432/f']) {
      expect(productionIssues({ ...VALID, DATABASE_URL: url })).toEqual([
        expect.stringContaining('DATABASE_URL points at localhost in production'),
      ]);
    }
  });

  it('flags a missing API_PUBLIC_URL', () => {
    expect(productionIssues({ ...VALID, API_PUBLIC_URL: undefined })).toEqual([
      expect.stringContaining('API_PUBLIC_URL must be set in production'),
    ]);
  });

  it('flags a missing APP_URL', () => {
    expect(productionIssues({ ...VALID, APP_URL: undefined })).toEqual([
      expect.stringContaining('APP_URL must be set in production'),
    ]);
  });

  it('reports every problem at once rather than only the first', () => {
    const issues = productionIssues({
      ...VALID,
      JWT_SECRET: 'dev-x',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/f',
      API_PUBLIC_URL: undefined,
      APP_URL: undefined,
    });
    expect(issues).toHaveLength(4);
  });

  it('is inert outside production', () => {
    expect(
      productionIssues({
        ...VALID,
        NODE_ENV: 'development',
        JWT_SECRET: 'dev-x',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/f',
        API_PUBLIC_URL: undefined,
        APP_URL: undefined,
      }),
    ).toEqual([]);
  });
});

describe('merged schema — datastore fields lost their defaults on purpose', () => {
  // lib/env.ts required these with no default and ran first, so a boot without
  // them already failed. Re-adding the localhost defaults during the merge
  // would have been a regression wearing a refactor's clothes.
  for (const field of ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const) {
    it(`${field} is required — a real (non-test) boot without it fails`, async () => {
      // VITEST=false disables the lax test branch, so the schema is what a
      // deployed process would see.
      process.env = { NODE_ENV: 'development', VITEST: 'false' };
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);

      error.mockRestore();
    });
  }

  it('the test branch still supplies datastore values so unit tests can boot', async () => {
    process.env = { NODE_ENV: 'test', VITEST: 'true' };
    const mod = await import('./env.js');
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.JWT_SECRET).toBeTruthy();
  });
});

/**
 * The two secrets left deliberately optional, and the guarantees that replace
 * "required in production" for them.
 */
describe('optional-by-design secrets', () => {
  it('HIPAA_FIELD_KEY stays optional — requiring it would stop every non-healthcare deploy booting', async () => {
    process.env = {
      NODE_ENV: 'production',
      ...REQUIRED,
      SESSION_SECRET: 'a-real-session-secret-at-least-32-chars',
      INTERNAL_API_SECRET: 'a-real-internal-secret-at-least-32-chars',
      DMARC_INBOUND_SECRET: 'a-real-dmarc-secret-16+',
      MINIO_ACCESS_KEY: 'real-access-key',
      MINIO_SECRET_KEY: 'real-secret-key',
      MINIO_ENDPOINT: 'minio.internal',
      MINIO_BUCKET: 'prod-bucket',
      MINIO_VIDEO_BUCKET: 'prod-video-bucket',
      ASSET_SIGNING_SECRET: 'a-real-asset-signing-secret-32-chars',
      INBOUND_EMAIL_SECRET: 'a-real-inbound-email-secret-32-chars',
      FORM_AUTOFILL_SECRET: 'a-real-form-autofill-secret-32-chars',
      PREFERENCE_CENTRE_SECRET: 'a-real-preference-centre-secret-32ch',
      FBL_WEBHOOK_SECRET: 'a-real-fbl-webhook-secret-32-chars-x',
      META_WEBHOOK_VERIFY_TOKEN: 'a-real-meta-verify-token',
      WHATSAPP_VERIFY_TOKEN: 'a-real-whatsapp-verify-tok',
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'a-real-facebook-verify-tok',
      TRACKING_SECRET: 'a-real-tracking-secret-32-chars-min',
      // Required in production since DKIM keys are encrypted at rest. Listed
      // here so this case still exercises what it is about — HIPAA_FIELD_KEY
      // being optional — rather than failing on an unrelated missing variable.
      DKIM_MASTER_KEY: 'f'.repeat(64),
      API_PUBLIC_URL: 'https://api.example.com',
      APP_URL: 'https://app.example.com',
    };
    const mod = await import('./env.js');
    expect(mod.env.HIPAA_FIELD_KEY).toBeUndefined();
  });

  it('HIPAA_FIELD_KEY must be 64 hex chars when it is set', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, HIPAA_FIELD_KEY: 'too-short' };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
    error.mockRestore();
  });

  it('PARTNER_PROVISION_SECRET stays optional', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED };
    const mod = await import('./env.js');
    expect(mod.env.PARTNER_PROVISION_SECRET).toBeUndefined();
  });
});

/**
 * The system sender.
 *
 * Five names used to describe one thing — SYSTEM_EMAIL_FROM, SYSTEM_FROM_EMAIL,
 * DOI_FROM_EMAIL, DOI_FROM_DOMAIN, REPORTS_FROM_EMAIL — each read straight off
 * process.env at its call site with its own committed fallback, across four
 * domains. Two failure modes had to close together:
 *
 *   missing  — the fallback fires, and mail leaves from a domain in this repo
 *   empty    — `??` does not treat '' as absent, so the fallback does NOT fire
 *              and the From is empty all the way to MAIL FROM:<>
 *
 * The empty case is the one that had no owner: docker-compose.prod.yml passed
 * ${DOI_FROM_EMAIL:-no-reply@example.com}, and `:-` substitutes on empty too,
 * so nothing downstream could tell "unconfigured" from "configured as
 * example.com". Both now stop the boot.
 */
describe('SYSTEM_EMAIL_FROM — one sender, validated at boot', () => {
  /** REQUIRED minus one field, so each absence is tested on its own. Removing
   * both at once would let either requirement alone carry the assertion. */
  const without = (field: string) => {
    const rest: Record<string, string> = { ...REQUIRED };
    delete rest[field];
    return { NODE_ENV: 'development', ...rest } as NodeJS.ProcessEnv;
  };
  const base = () => ({ NODE_ENV: 'development', ...REQUIRED }) as NodeJS.ProcessEnv;

  it('refuses to boot when SYSTEM_EMAIL_FROM is missing', async () => {
    process.env = without('SYSTEM_EMAIL_FROM');
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('refuses to boot when SYSTEM_EMAIL_FROM_NAME is missing', async () => {
    process.env = without('SYSTEM_EMAIL_FROM_NAME');
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('refuses to boot when SYSTEM_EMAIL_FROM is set but empty', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...base(), SYSTEM_EMAIL_FROM: '' };

    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
    expect(
      spy.mock.calls.flat().join(' '),
      'the failure has to name the variable — an operator reads this line, not the stack',
    ).toMatch(/SYSTEM_EMAIL_FROM/);
    spy.mockRestore();
  });

  it('refuses to boot when SYSTEM_EMAIL_FROM is not an address', async () => {
    process.env = { ...base(), SYSTEM_EMAIL_FROM: 'no-reply' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('refuses to boot when SYSTEM_EMAIL_FROM_NAME is empty', async () => {
    process.env = { ...base(), SYSTEM_EMAIL_FROM_NAME: '' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('boots with a valid sender and exposes it', async () => {
    process.env = {
      ...base(),
      SYSTEM_EMAIL_FROM: 'no-reply@ops.example',
      SYSTEM_EMAIL_FROM_NAME: 'Ops',
    };
    const mod = await import('./env.js');
    expect(mod.env.SYSTEM_EMAIL_FROM).toBe('no-reply@ops.example');
    expect(mod.env.SYSTEM_EMAIL_FROM_NAME).toBe('Ops');
  });

  describe('REPORTS_FROM_EMAIL — the one sanctioned second address', () => {
    it('is accepted on the same domain', async () => {
      process.env = {
        ...base(),
        SYSTEM_EMAIL_FROM: 'no-reply@ops.example',
        REPORTS_FROM_EMAIL: 'reports@ops.example',
      };
      const mod = await import('./env.js');
      expect(mod.env.REPORTS_FROM_EMAIL).toBe('reports@ops.example');
    });

    it('refuses the boot on a different domain', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env = {
        ...base(),
        SYSTEM_EMAIL_FROM: 'no-reply@ops.example',
        REPORTS_FROM_EMAIL: 'reports@elsewhere.example',
      };

      await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
      expect(spy.mock.calls.flat().join(' ')).toMatch(/same domain/);
      spy.mockRestore();
    });

    it('compares domains case-insensitively rather than refusing a valid deploy', async () => {
      process.env = {
        ...base(),
        SYSTEM_EMAIL_FROM: 'no-reply@Ops.Example',
        REPORTS_FROM_EMAIL: 'reports@ops.example',
      };
      const mod = await import('./env.js');
      expect(mod.env.REPORTS_FROM_EMAIL).toBe('reports@ops.example');
    });

    it('treats empty as "not set" — the required pair must not share that leniency', async () => {
      process.env = { ...base(), REPORTS_FROM_EMAIL: '' };
      const mod = await import('./env.js');
      expect(mod.env.REPORTS_FROM_EMAIL).toBeUndefined();
    });
  });
});
