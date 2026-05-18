import fs from 'node:fs';

const f = 'apps/api/src/services/analytics/analytics.test.ts';
let src = fs.readFileSync(f, 'utf-8');

// Multi-line: .mockResolvedValue({ rows: [...] })
src = src.replace(
  /\.mockResolvedValue(Once)?\(\s*\{\s*rows:\s*(\[[\s\S]*?\])\s*,?\s*\}\s*\)/g,
  '.mockResolvedValue$1($2)',
);

fs.writeFileSync(f, src, 'utf-8');
console.log('done');
