/**
 * Log in as the seed user without spending the API's login budget.
 *
 * ─── The problem ─────────────────────────────────────────────────────────────
 *
 * `POST /api/v1/auth/login` carries `config: { rateLimit: { max: 10,
 * timeWindow: '15 minutes' } }` (api/routes/v1/auth.ts:75), keyed by
 * `x-api-key ?? request.ip` (api/plugins/rate-limit.ts:10). The store is
 * @fastify/rate-limit's default, which lives in the API process's memory — so
 * the counter survives every test run and only a restart clears it.
 *
 * Three files in this suite log in. The API that serves them is one long-lived
 * process started once (in CI by the "Start API in background" step). Measured
 * against a freshly restarted API, four runs back to back:
 *
 *   run 1   64 passed |  2 failed        no 429
 *   run 2   64 passed |  2 failed        no 429
 *   run 3   56 passed |  8 skipped       2 files dead on
 *                                        "POST /api/v1/auth/login → 429"
 *   run 4   51 passed | 13 skipped       all three dead
 *
 * (the 2 failures throughout are webhook-deliver, unrelated and pre-existing.)
 *
 * So the suite is not repeatable, and "run it again to be sure" — the thing we
 * ask for as proof — is exactly what breaks it. The workaround was to restart
 * the API between runs, which means the proof depended on remembering to do
 * that.
 *
 * ─── Why a header and not a change to the limit ──────────────────────────────
 *
 * The limiter keys on `x-api-key` BEFORE falling back to the IP, so a request
 * carrying a header nobody has issued gets a bucket of its own. Verified
 * against a running API whose 127.0.0.1 bucket was already exhausted:
 *
 *   no header               → 429
 *   x-api-key: rl-probe-A   → 200 (and a real token in the body)
 *   x-api-key: rl-probe-B   → 200
 *   X-Forwarded-For: …      → 429   (trustProxy is production-only, so XFF
 *                                    cannot move the bucket here)
 *
 * An unknown key is harmless: plugins/auth.ts:65 looks it up, gets nothing, and
 * falls through to the Bearer/cookie path. The route, the password check and
 * the session that comes back are the real ones — the header changes which
 * counter the request lands in and nothing else.
 *
 * This is the same trick route-smoke already uses for the 100/min global
 * limiter, where every injected request gets its own `remoteAddress`
 * ("Rather than change production config for a test, each request is injected
 * from its own remoteAddress"). Same reasoning, translated to a suite that
 * talks to a real server over TCP.
 *
 * The alternatives were worse. Raising or disabling the limit under a test
 * environment flag puts a branch in production auth code for a test's
 * convenience, and leaves the limit itself never exercised. Logging in once
 * per suite and sharing the token would cut three logins to one — the counter
 * would still climb, just three times more slowly, and it would take the real
 * login out of two of the three files.
 *
 * ─── What this does NOT do ───────────────────────────────────────────────────
 *
 * The header goes on the login request only. Sending it on every call would
 * put each request through the API-key branch of plugins/auth.ts instead of
 * the session branch, which is not the path these tests are about.
 */
import { randomUUID } from 'node:crypto';

/**
 * One bucket per module instance. vitest isolates each test file into its own
 * environment, so this is effectively "per file, per run" — no two files share
 * a counter, and a rerun never inherits the previous run's.
 */
const RATE_LIMIT_BUCKET = `integration-${randomUUID()}`;

export const SEED_LOGIN = {
  email: 'demo@acme.test',
  password: 'Demo1234!',
} as const;

/**
 * Returns the JWT for the seed user.
 *
 * `label` only shows up in the error message, so a failure names the suite that
 * could not get in rather than just the status code.
 */
export async function loginAsSeedUser(apiBase: string, label: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Not a credential — see the header comment. It only picks the
      // rate-limit bucket, and an unknown value falls through to the session
      // path.
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    body: JSON.stringify(SEED_LOGIN),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[${label}] POST /api/v1/auth/login -> ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = JSON.parse(text) as { token?: string };
  if (!body.token) {
    throw new Error(`[${label}] login returned ${res.status} but no token: ${text.slice(0, 200)}`);
  }
  return body.token;
}
