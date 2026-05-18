import fs from 'node:fs';
import path from 'node:path';

const files = [
  'apps/api/src/services/ai-agents/customer-support.ts',
  'apps/api/src/services/ai-agents/prospecting.ts',
  'apps/api/src/services/ai-agents/deal-health.ts',
  'apps/api/src/services/ai-agents/social.ts',
  'apps/api/src/services/ai-agents/seo-strategist.ts',
  'apps/api/src/services/phone/transcription.ts',
  'apps/api/src/services/ai-support/note-to-message.ts',
  'apps/api/src/services/ai-support/tone-adjust.ts',
  'apps/api/src/services/ai-support/summarize.ts',
  'apps/api/src/services/ai-recommendations/index.ts',
  'apps/api/src/services/ai-agents/runner.ts',
  'apps/api/src/services/ai-agents/campaign-builder.ts',
  'apps/api/src/services/product-recommendations/index.ts',
  'apps/api/src/services/pre-send/index.ts',
  'apps/api/src/services/editor/accessibility-checker.ts',
  'apps/api/src/services/editor/html-to-blocks.ts',
  'apps/api/src/services/editor/product-scraper.ts',
];

let n = 0;
for (const f of files) {
  const full = path.resolve(f);
  if (!fs.existsSync(full)) continue;
  let src = fs.readFileSync(full, 'utf-8');
  const before = src;
  src = src.replace(/\bresult\.content\b/g, 'result.text');
  src = src.replace(/\bresult\.tokensUsed\s*\?\?\s*0/g, '(result.inputTokens + result.outputTokens)');
  src = src.replace(/\bresult\.tokensUsed\b/g, '(result.inputTokens + result.outputTokens)');
  if (src !== before) {
    fs.writeFileSync(full, src, 'utf-8');
    n++;
  }
}
console.log('files updated:', n);
