/**
 * The interface is built in English and translated in one go at the end
 * (product decision, Z129). #246, #247 and #248 had put Czech into these
 * screens — the pre-send panel, the gate's audit card, the DNS re-verify
 * button and the error states — and Z129 turned it back.
 *
 * The strings themselves are asserted where they render (pre-send-panel.test,
 * api.test, fix-links.test, the E2E specs). This guards the files as a whole,
 * so a Czech sentence added to one of them later fails here, not in review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  'app/(dashboard)/campaigns/[id]/pre-send-report.ts',
  'app/(dashboard)/campaigns/[id]/pre-send-panel.tsx',
  'app/(dashboard)/campaigns/[id]/deliverability-record.tsx',
  'app/(dashboard)/domains/[id]/recheck-dns-button.tsx',
  'app/(dashboard)/error.tsx',
  'app/error.tsx',
  'lib/api-outcome.ts',
];

/** Letters Czech has and English does not. */
const CZECH = /[ěščřžýáíéúůňťďĚŠČŘŽÝÁÍÉÚŮŇŤĎ]/;

describe('these screens speak English', () => {
  it.each(FILES)('%s has no Czech in it', (rel) => {
    const lines = readFileSync(join(__dirname, '..', rel), 'utf8').split('\n');
    const czech = lines.map((l, i) => `${i + 1}: ${l.trim()}`).filter((l) => CZECH.test(l));
    expect(czech).toEqual([]);
  });
});
