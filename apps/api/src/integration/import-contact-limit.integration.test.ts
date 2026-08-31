/**
 * A bulk import is subject to the same contact limit as adding one contact.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * POST /api/v1/contacts has always called checkContactCapacity(orgId, 1). The
 * import route called nothing at all, so the plan limit came off entirely if
 * you uploaded a file instead of posting — the enforcement existed, it was just
 * on the slower of the two doors. A Free org could load a hundred thousand
 * from a CSV and nothing would say a word.
 *
 * ─── What this asserts ───────────────────────────────────────────────────────
 *
 * The real four-step flow — upload, mapping, execute — with a file whose row
 * count is past the org's cap, and the refusal at `execute`. Then the same
 * flow with a small file, so the assertion cannot pass by refusing everything.
 *
 * ─── What it cannot see ──────────────────────────────────────────────────────
 *
 *   - The rows are never written; the check is before runImport, which is
 *     fire-and-forget. This proves the door is shut, not what happens behind
 *     it.
 *   - It uses totalRows, so it inherits that measure's over-estimate: a file of
 *     rows that all match existing contacts would update rather than add, and
 *     is still counted as new here. That is the route's documented trade-off,
 *     not something this file could paper over.
 *   - Only the Free plan. checkContactCapacity refuses on `free` and returns
 *     without checking on every paid tier, so this covers the enforcement that
 *     exists, not the enforcement the pricing page describes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './setup/harness.js';
import { CONTACT_PLANS } from '../services/billing/plans.js';

let app: FastifyInstance;
let cookie: string;

/** Cap comes from the plan config, not from a number written down here. */
const CAP = CONTACT_PLANS.free.contacts;

/**
 * A fresh org, not the seed one.
 *
 * Two reasons. The seed org is read-only for the suite (#82), and it is on
 * `pro` — and checkContactCapacity only refuses on `free`, so testing there
 * would assert nothing. Registration creates an org at the schema default of
 * `free` and returns a usable session cookie straight away, so this needs no
 * verification step and no direct writes.
 *
 * `remoteAddress` is unique because POST /auth/register is limited to 5/hour
 * per IP and that counter is now shared through Redis.
 */
beforeAll(async () => {
  app = await createTestApp();
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.100.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `import-limit-${tag}@example.test`,
      password: 'ImportLimit1234!',
      name: 'Import Limit',
      orgName: `Import Limit ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`[integration] register failed: ${res.statusCode} ${res.body}`);
  }
  const raw = res.headers['set-cookie'];
  const setCookie = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /fm_session=([^;]+)/.exec(setCookie);
  if (!match?.[1]) throw new Error(`[integration] register set no session cookie: ${setCookie}`);
  cookie = `fm_session=${match[1]}`;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/** A CSV with `rows` unique addresses. */
function csv(rows: number, tag: string): string {
  const lines = ['email,first_name'];
  for (let i = 0; i < rows; i++) lines.push(`${tag}-${i}@import-limit.test,Ada`);
  return lines.join('\n');
}

/** Upload → mapping, returning the job id. Stops short of execute. */
async function stageImport(rows: number, tag: string): Promise<string> {
  const boundary = '----formboundary' + tag;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${tag}.csv"\r\n` +
    'Content-Type: text/csv\r\n\r\n' +
    csv(rows, tag) +
    `\r\n--${boundary}--\r\n`;

  const upload = await app.inject({
    method: 'POST',
    url: '/api/v1/contacts/import/upload',
    headers: {
      cookie,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
  expect(upload.statusCode, `upload failed: ${upload.body}`).toBe(200);

  const job = (upload.json() as { data: { id: string; totalRows: number } }).data;
  expect(job.totalRows, 'the parser did not see the rows this test wrote').toBe(rows);

  const mapping = await app.inject({
    method: 'POST',
    url: `/api/v1/contacts/import/${job.id}/mapping`,
    headers: { cookie },
    payload: { mapping: { email: 'email', first_name: 'first_name' } },
  });
  expect(mapping.statusCode, `mapping failed: ${mapping.body}`).toBe(200);

  return job.id;
}

function execute(jobId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/contacts/import/${jobId}/execute`,
    headers: { cookie },
  });
}

describe('bulk import respects the plan contact limit', () => {
  it('refuses a file with more rows than the plan allows', async () => {
    const jobId = await stageImport(CAP + 50, `over-${Date.now()}`);
    const res = await execute(jobId);

    expect(
      res.statusCode,
      `execute accepted ${CAP + 50} rows on a plan capped at ${CAP}: the import path ` +
        'does not check capacity, so the limit comes off whenever a file is used ' +
        `instead of POST /api/v1/contacts. Body: ${res.body}`,
    ).toBe(403);
    expect(res.body).toMatch(/contact/i);
  }, 60_000);

  it('still accepts a file that fits, so the check is not refusing everything', async () => {
    const jobId = await stageImport(3, `under-${Date.now()}`);
    const res = await execute(jobId);
    expect(res.statusCode, `execute refused a 3-row file: ${res.body}`).toBe(200);
  }, 60_000);
});
