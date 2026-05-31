#!/usr/bin/env node
/**
 * Convert LAUNCH_READINESS_PLAN.html to PDF using puppeteer.
 *
 * Run from repo root:
 *   node scripts/html-to-pdf.mjs
 *
 * Puppeteer is hoisted under apps/api as an optional dependency, so we
 * resolve it through createRequire anchored to apps/api/package.json.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const require = createRequire(path.join(repoRoot, 'apps/api/package.json'));
const puppeteer = require('puppeteer');

const htmlPath = path.join(repoRoot, 'LAUNCH_READINESS_PLAN.html');
const pdfPath = path.join(repoRoot, 'LAUNCH_READINESS_PLAN.pdf');

// Puppeteer's bundled Chrome download is skipped by default in this repo.
// Resolve a system-installed Chromium-family browser instead. Honour
// PUPPETEER_EXECUTABLE_PATH so the user can override.
const candidatePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const fs = await import('node:fs');
const executablePath = candidatePaths.find((p) => p && fs.existsSync(p));
if (!executablePath) {
  console.error('[pdf] No Chrome/Edge found. Set PUPPETEER_EXECUTABLE_PATH.');
  process.exit(2);
}
console.log(`[pdf] Using browser: ${executablePath}`);

console.log('[pdf] Launching browser…');
const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  const fileUrl = pathToFileURL(htmlPath).href;
  console.log(`[pdf] Loading ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  console.log(`[pdf] Generating ${pdfPath}`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log('[pdf] Done.');
} finally {
  await browser.close();
}
