import fs from 'node:fs';

const raw = fs.readFileSync('scripts/unused.txt', 'utf-8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const parsed = lines
  .map((l) => {
    const m = l.match(/^(.+?)\((\d+),(\d+)\): error TS6133: '([^']+)' is declared/);
    return m ? { file: m[1], line: +m[2], col: +m[3], name: m[4] } : null;
  })
  .filter(Boolean);

const byFile = new Map();
for (const e of parsed) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

const apiRoot = 'apps/api';

let removedImports = 0;
let prefixed = 0;
let skipped = 0;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [relFile, entries] of byFile) {
  const full = `${apiRoot}/${relFile}`;
  if (!fs.existsSync(full)) {
    skipped += entries.length;
    continue;
  }
  let src = fs.readFileSync(full, 'utf-8');
  const srcLines = src.split('\n');

  const sorted = [...entries].sort((a, b) => b.line - a.line || b.col - a.col);
  for (const e of sorted) {
    const i = e.line - 1;
    const text = srcLines[i];
    if (text === undefined) {
      skipped++;
      continue;
    }

    const isImportTop = /^\s*import\b/.test(text);

    if (isImportTop) {
      const escName = escapeRegex(e.name);
      const bareRe = new RegExp(`\\b${escName}\\b`);
      if (bareRe.test(text)) {
        let updated = text;
        // Default import: `import Name from 'x'` → remove line
        if (new RegExp(`import\\s+${escName}\\s+from\\s+`).test(text)) {
          srcLines[i] = '';
          removedImports++;
          continue;
        }
        // Named imports: `import { A, Name, B } from 'x'` or `import type { ... }`
        updated = updated.replace(new RegExp(`\\{\\s*${escName}\\s*\\}`), '{}');
        updated = updated.replace(new RegExp(`\\b${escName}\\s*,\\s*`), '');
        updated = updated.replace(new RegExp(`,\\s*${escName}\\b`), '');
        // If empty import list, drop the whole line
        if (/import(\s+type)?\s*\{\s*\}\s*from/.test(updated)) {
          srcLines[i] = '';
        } else {
          srcLines[i] = updated;
        }
        removedImports++;
        continue;
      }
    }

    // Non-import: prefix with underscore
    const col = e.col - 1;
    const rest = text.slice(col);
    if (rest.startsWith(e.name) && !rest.startsWith('_' + e.name)) {
      srcLines[i] = text.slice(0, col) + '_' + rest;
      prefixed++;
    } else {
      skipped++;
    }
  }

  const newSrc = srcLines.join('\n');
  if (newSrc !== src) {
    fs.writeFileSync(full, newSrc, 'utf-8');
  }
}

console.log('removed imports:', removedImports);
console.log('prefixed vars:', prefixed);
console.log('skipped:', skipped);
