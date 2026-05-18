import fs from 'node:fs';

const raw = fs.readFileSync('scripts/bad-imports.txt', 'utf-8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const parsed = lines
  .map((l) => {
    const m = l.match(
      /^(.+?)\((\d+),(\d+)\): error TS2724: '[^']+' has no exported member named '_([^']+)'/,
    );
    return m ? { file: m[1], line: +m[2], col: +m[3], name: m[4] } : null;
  })
  .filter(Boolean);

const byFile = new Map();
for (const e of parsed) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

const apiRoot = 'apps/api';
let fixed = 0;

for (const [relFile, entries] of byFile) {
  const full = `${apiRoot}/${relFile}`;
  if (!fs.existsSync(full)) continue;
  let src = fs.readFileSync(full, 'utf-8');
  const srcLines = src.split('\n');
  const sorted = [...entries].sort((a, b) => b.line - a.line);

  for (const e of sorted) {
    const i = e.line - 1;
    let text = srcLines[i];
    if (text === undefined) continue;
    const badName = '_' + e.name;
    // Since the underscore name doesn't exist in the source module, the
    // import was genuinely unused — remove it from the list entirely.
    const stripPatterns = [
      new RegExp(`\\s*${badName}\\s*,\\s*`),
      new RegExp(`\\s*,\\s*${badName}\\s*`),
      new RegExp(`\\s*${badName}\\s*$`),
      new RegExp(`^\\s*${badName}\\s*`),
    ];
    for (const p of stripPatterns) {
      if (p.test(text)) {
        text = text.replace(p, (m) => (m.includes(',') ? ',' : ''));
        break;
      }
    }
    // Trailing ',' cleanup: "{ a, ,}" → "{ a }"
    text = text.replace(/,\s*,/g, ',').replace(/,\s*\}/g, ' }').replace(/\{\s*,/g, '{');
    // If the line was literally just the bad import name on its own, remove it
    if (new RegExp(`^\\s*${badName}\\s*,?\\s*$`).test(srcLines[i])) {
      srcLines[i] = '';
    } else {
      srcLines[i] = text;
    }
    fixed++;
  }

  fs.writeFileSync(full, srcLines.join('\n'), 'utf-8');
}

console.log('fixed:', fixed);
