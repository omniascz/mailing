import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The deploy half of the sender contract.
 *
 * config/env.ts refuses to boot on a missing or empty SYSTEM_EMAIL_FROM. That
 * check was unreachable in production for its predecessor: compose passed
 * `${DOI_FROM_EMAIL:-no-reply@example.com}`, and `:-` substitutes on unset AND
 * on empty, so the API never saw an unconfigured sender — it saw a configured
 * one pointing at a domain we do not own. A schema check the deployment can
 * satisfy with a default of its own is not a check.
 *
 * Unlike the source scan next to this file, this one is a barrier for the file
 * it reads: any default form on these names fails it.
 *
 * Everything below is plain substring matching on purpose. `${`, `:-` and `?`
 * are all regex metacharacters, and an over-escaped pattern that matches
 * nothing passes silently — which is the failure mode these tests exist to
 * prevent, not to demonstrate.
 */

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const COMPOSE = join(REPO_ROOT, 'docker-compose.prod.yml');

const FAMILY = [
  'SYSTEM_EMAIL_FROM',
  'SYSTEM_EMAIL_FROM_NAME',
  'REPORTS_FROM_EMAIL',
  // Retired names. A revert would bring them back, so they stay listed.
  'SYSTEM_FROM_EMAIL',
  'DOI_FROM_EMAIL',
  'DOI_FROM_DOMAIN',
] as const;

const OPEN = '${';

describe('docker-compose.prod.yml — no shell default may mask an unset sender', () => {
  const compose = readFileSync(COMPOSE, 'utf8');

  // Comment lines are stripped: this file documents the retired
  // ${DOI_FROM_EMAIL:-no-reply@example.com} form in a comment on purpose, and a
  // comment cannot set an environment variable. Everything else is checked.
  const effective = compose
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith(String.fromCharCode(35)))
    .join(String.fromCharCode(10));

  it('reads the compose file it claims to check', () => {
    expect(compose).toContain('SYSTEM_EMAIL_FROM');
  });

  it('gives no system-sender variable a :- or - default', () => {
    // ${VAR:-x} substitutes when unset OR empty; ${VAR-x} only when unset.
    // Both leave the API unable to tell "not configured" from "configured".
    const defaults = FAMILY.flatMap((name) =>
      [OPEN + name + ':-', OPEN + name + '-'].filter((form) => effective.includes(form)),
    );
    expect(
      defaults,
      'a default here means the API never sees the variable as unset, so its ' +
        'boot-time validation cannot fire in the deployment that needs it most',
    ).toEqual([]);
  });

  it('passes the required pair in the fail-fast form used by every other required value', () => {
    expect(effective).toContain('SYSTEM_EMAIL_FROM: ${SYSTEM_EMAIL_FROM:?');
    expect(compose).toContain('SYSTEM_EMAIL_FROM_NAME: ${SYSTEM_EMAIL_FROM_NAME:?');
  });

  it('passes the optional override bare, so unset stays unset', () => {
    expect(effective).toContain('REPORTS_FROM_EMAIL: ${REPORTS_FROM_EMAIL}');
  });
});
