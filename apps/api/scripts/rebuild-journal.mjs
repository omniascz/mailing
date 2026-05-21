#!/usr/bin/env node
/**
 * Rebuild apps/api/drizzle/meta/_journal.json from the SQL files in the
 * directory. The journal had drifted to 26 entries while 63 .sql files
 * existed; pnpm db:migrate would silently skip the 37 unregistered ones.
 *
 * Run: node apps/api/scripts/rebuild-journal.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(__dirname, '..', 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

// Read existing journal so we keep the original `when` timestamps for
// migrations that are already tracked. New migrations get the file mtime.
const existing = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8'));
const existingByTag = new Map(existing.entries.map((e) => [e.tag, e]));

const sqlFiles = readdirSync(DRIZZLE_DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const entries = sqlFiles.map((file, idx) => {
  const tag = file.replace(/\.sql$/, '');
  const prior = existingByTag.get(tag);
  // Reuse the prior `when` if we know it (preserves history). For new
  // entries, use file mtime as a monotonic proxy.
  const when = prior?.when ?? statSync(join(DRIZZLE_DIR, file)).mtimeMs;
  return {
    idx,
    version: '7',
    when: Math.floor(when),
    tag,
    breakpoints: true,
  };
});

const next = {
  version: '7',
  dialect: 'postgresql',
  entries,
};

writeFileSync(JOURNAL_PATH, JSON.stringify(next, null, 2) + '\n');

console.log(`✓ Journal rebuilt: ${entries.length} entries (was ${existing.entries.length})`);
console.log(`  Last entry: ${entries[entries.length - 1].tag}`);
