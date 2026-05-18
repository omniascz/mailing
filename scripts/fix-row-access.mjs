/**
 * Drizzle + postgres.js returns rows directly, not `{ rows: [...] }`. This
 * script rewrites `.rows as Array<...>` accesses and `.rows` destructuring
 * to treat the result as the array itself.
 */
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'apps/api/src/services/analytics/index.ts',
  'apps/api/src/routes/v1/ai.ts',
  'apps/api/src/services/analytics/anomaly-detector.ts',
  'apps/api/src/routes/v1/contact-imports.ts',
  'apps/api/src/services/blog/ctas.ts',
  'apps/api/src/services/workflows/triggers.ts',
  'apps/api/src/services/data-ops/pipeline.ts',
  'apps/api/src/services/data-ops/index.ts',
  'apps/api/src/services/commerce/quotes.ts',
  'apps/api/src/services/whatsapp/whatsapp-phase7.test.ts',
  'apps/api/src/services/commerce/invoicing.ts',
  'apps/api/src/services/whatsapp/rich-messaging.ts',
  'apps/api/src/services/whatsapp/rich-messaging-test-exports.ts',
  'apps/api/src/services/deliverability/health-score.ts',
  'apps/api/src/services/deliverability/graymail.ts',
  'apps/api/src/services/import/processor.ts',
];

let total = 0;
for (const f of files) {
  const full = path.resolve(f);
  if (!fs.existsSync(full)) continue;
  let src = fs.readFileSync(full, 'utf-8');
  const before = src;

  // 1. `result.rows as Array<T>` → `result as Array<T>` (and similar variants)
  src = src.replace(
    /\b(\w+)\.rows\s+as\s+(Array<[^>]*>)/g,
    '$1 as unknown as $2',
  );
  // 2. `result.rows[0]` → `result[0]`
  src = src.replace(/\b(\w+)\.rows\[(\d+|[a-zA-Z_]\w*)\]/g, '$1[$2]');
  // 3. `result.rows.length` / `.map` / `.find` etc. (any method access)
  src = src.replace(/\b(\w+)\.rows\.(length|map|find|filter|forEach|some|every|reduce|slice|concat)\b/g, '$1.$2');
  // 4. `for (const x of result.rows)` → `for (const x of result)`
  src = src.replace(/for\s*\(\s*(const|let|var)\s+(\w+)\s+of\s+(\w+)\.rows\s*\)/g, 'for ($1 $2 of $3)');

  if (src !== before) {
    fs.writeFileSync(full, src, 'utf-8');
    total++;
  }
}
console.log('files updated:', total);
