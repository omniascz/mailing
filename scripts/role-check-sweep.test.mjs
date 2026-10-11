// Self-test of scripts/role-check-sweep.mjs. Run: node --test scripts/
//
// A check that cannot see what it is meant to see passes forever. These pin
// it to things the Z129 survey found by hand, and to the one way the check is
// most likely to go blind: a route losing its role check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { sweep } from './role-check-sweep.mjs';

const REPO = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const CAMPAIGNS = path.join(REPO, 'apps/api/src/routes/v1/campaigns.ts');

test('finds three routes the Z129 survey found by reading', () => {
  const keys = new Set(sweep().map((f) => f.key));
  for (const route of [
    'POST /api/v1/abuse/check-trap', // abuse-detection.ts — preHandler: [app.authenticate]
    'DELETE /api/v1/ads/accounts/:accountId', // ads/accounts.ts — `const auth = {...}` alias
    'POST /api/v1/ai/ab-optimizer/:campaignId/recompute', // ai.ts — file-level addHook(requireAuth)
  ]) {
    assert.ok(keys.has(route), `${route} should be reported`);
  }
});

test('does not report a route whose role check is in a scoped hook or its preHandler', () => {
  const keys = new Set(sweep().map((f) => f.key));
  assert.ok(!keys.has('POST /api/v1/campaigns/:id/send'), 'send has requireRole since #249');
  assert.ok(!keys.has('POST /api/v1/api-keys'), 'minting a key needs admin since Z130');
  assert.ok(
    ![...keys].some((k) => k.startsWith('POST /api/v1/frequency-rules')),
    'plugin-wide requireRole hook',
  );
});

test('reports /campaigns/:id/send once its role check is removed', () => {
  const src = fs.readFileSync(CAMPAIGNS, 'utf8');
  const stripped = src.replace(
    /preHandler: mayDispatch,\s*schema: \{ tags: \['Campaigns'\], summary: 'Send campaign immediately' \}/,
    "schema: { tags: ['Campaigns'], summary: 'Send campaign immediately' }",
  );
  assert.notEqual(
    stripped,
    src,
    'the send route still carries mayDispatch where the test expects it',
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'role-sweep-'));
  const copy = path.join(dir, 'campaigns.ts');
  fs.writeFileSync(copy, stripped);
  try {
    const keys = sweep([copy]).map((f) => f.key);
    assert.ok(
      keys.includes('POST /api/v1/campaigns/:id/send'),
      'the stripped send route must be reported',
    );
    assert.ok(!sweep([CAMPAIGNS]).some((f) => f.key === 'POST /api/v1/campaigns/:id/send'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
