import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Object-storage configuration comes from the schema, not from process.env.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * MINIO_BUCKET was in config/env.ts all along, and five call sites read it
 * straight from process.env anyway, each with its own fallback — and the
 * fallbacks disagreed:
 *
 *   'forgemsg'             analytics.ts (campaign screenshots), media/storage.ts
 *   'forgemsg-recordings'  archive/email-events.ts, phone/recording.ts,
 *                          phone/voicemail.ts
 *
 * With the variable unset — every developer machine that skipped .env — media
 * went to one bucket and the event archive to another, and nothing said so.
 *
 * ─── Why only the bucket names ───────────────────────────────────────────────
 *
 * MINIO_ENDPOINT, MINIO_PORT, MINIO_USE_SSL, MINIO_ACCESS_KEY and
 * MINIO_SECRET_KEY are read from process.env too, in lib/object-store.ts, and
 * that one is deliberate: the module builds its client lazily and exports
 * `resetObjectStore()` so a test can change the credentials and get a new
 * client. Two integration tests use exactly that to prove a rejected
 * credential fails loudly (object-store-signing, archive-roundtrip). Reading
 * them from the schema freezes them at import and those tests stop testing
 * anything — measured, they went green-by-accident: "promise resolved instead
 * of rejecting". Moving credentials into the schema needs an injection seam
 * first, and that is a different change.
 *
 * ─── WHAT THIS SCAN CANNOT SEE ───────────────────────────────────────────────
 *
 *   - A read built at runtime: `process.env['MINIO_' + which]`, or a helper
 *     that takes the variable name as a string. This matches source text.
 *   - Anything outside apps/api/src — apps/workers and packages/* are not
 *     scanned. Nothing there reads MINIO_* today, but this would not notice if
 *     it started.
 *   - Whether the value is right. It checks where the name comes from, not
 *     that the bucket exists, is writable, or matches what compose passes.
 *   - config/env.ts itself, and test files, which set these variables on
 *     purpose.
 *   - MINIO_* variables that are not bucket names. The matcher only looks for
 *     `*BUCKET`, so lib/object-store.ts stays legal by construction.
 *   - A second variable for the same bucket (say a new MINIO_MEDIA_BUCKET)
 *     going through the schema. That would be one source of truth per name and
 *     still two buckets; only a human notices that.
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALLOWED = join(SRC, 'config', 'env.ts');

/**
 * The matcher. Bucket NAMES only — see the header for why credentials and the
 * endpoint are left alone.
 */
function readsMinioFromEnv(src: string): boolean {
  return /process\.env\.MINIO_[A-Z_]*BUCKET/.test(src);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      sourceFiles(p, out);
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (name.endsWith('.test.ts')) continue;
    if (p === ALLOWED) continue;
    out.push(p);
  }
  return out;
}

describe('SELF-TEST: the matcher fires on what it claims to', () => {
  it('catches the direct read, with or without a fallback', () => {
    expect(readsMinioFromEnv('const b = process.env.MINIO_BUCKET;')).toBe(true);
    expect(readsMinioFromEnv("const b = process.env.MINIO_BUCKET ?? 'forgemsg';")).toBe(true);
    expect(readsMinioFromEnv("const b = () => process.env.MINIO_VIDEO_BUCKET ?? 'x';")).toBe(true);
  });

  it('does NOT fire on the shape we want', () => {
    expect(readsMinioFromEnv('const b = env.MINIO_BUCKET;')).toBe(false);
    expect(readsMinioFromEnv("MINIO_BUCKET: prodRequired(z.string().min(1), 'forgemsg'),")).toBe(
      false,
    );
    expect(readsMinioFromEnv('process.env.DATABASE_URL')).toBe(false);
    // Credentials and the endpoint are out of scope on purpose, so the matcher
    // must not fire on them — otherwise the exemption would be invisible.
    expect(readsMinioFromEnv("process.env.MINIO_ACCESS_KEY ?? 'minioadmin'")).toBe(false);
    expect(readsMinioFromEnv("process.env.MINIO_ENDPOINT ?? 'localhost'")).toBe(false);
    expect(readsMinioFromEnv('// process.env.MINIO')).toBe(false);
    expect(readsMinioFromEnv('')).toBe(false);
  });

  it('SELF-TEST: it is reading real files, and enough of them', () => {
    // A wrong path would make the assertion below vacuously true.
    const files = sourceFiles(SRC);
    expect(files.length, 'the source tree was not found').toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(join('lib', 'object-store.ts')))).toBe(true);
    // …and it is scanned, not skipped: it still reads credentials from
    // process.env, and the matcher is what decides that is allowed.
    expect(readsMinioFromEnv(readFileSync(join(SRC, 'lib', 'object-store.ts'), 'utf8'))).toBe(
      false,
    );
    expect(
      files.some((f) => f.endsWith(join('config', 'env.ts'))),
      'env.ts must be excluded',
    ).toBe(false);
    expect(readFileSync(files[0]!, 'utf8').length).toBeGreaterThan(10);
  });
});

describe('one source of truth for object storage', () => {
  it('no source file outside config/env.ts reads MINIO_* from process.env', () => {
    const offenders = sourceFiles(SRC)
      .filter((p) => readsMinioFromEnv(readFileSync(p, 'utf8')))
      .map((p) => p.slice(SRC.length + 1).replace(/\\/g, '/'));

    expect(
      offenders,
      `these files read MINIO_* directly. Import { env } from config/env.js instead — ` +
        `a local fallback is how media and the email-event archive ended up in two ` +
        `different buckets.`,
    ).toEqual([]);
  });

  it('every bucket consumer therefore names the same variable', async () => {
    // Behavioural half: the schema is what they all read, so setting the
    // variable moves all of them together. Asserted on the schema's own output
    // rather than by importing five services that each open a client.
    process.env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'a-development-jwt-secret-value',
      SYSTEM_EMAIL_FROM: 'no-reply@example.test',
      SYSTEM_EMAIL_FROM_NAME: 'Example',
      MINIO_BUCKET: 'one-bucket-for-all',
    };
    const { env } = await import('./env.js');
    expect(env.MINIO_BUCKET).toBe('one-bucket-for-all');
  });
});
