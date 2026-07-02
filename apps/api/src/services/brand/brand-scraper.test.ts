import { describe, it, expect } from 'vitest';
import { extractBrandFromHtml } from './brand-scraper.js';

const html = `<!doctype html>
<html>
<head>
  <title>Acme Store — Best Widgets</title>
  <meta property="og:site_name" content="Acme Store" />
  <meta name="theme-color" content="#1a73e8" />
  <meta property="og:image" content="/images/og-cover.png" />
  <link rel="apple-touch-icon" href="/apple-icon.png" />
  <link rel="icon" href="/favicon.ico" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Open+Sans" rel="stylesheet" />
  <style>
    body { font-family: 'Poppins', sans-serif; color: #222222; }
    .brand { color: #e91e63; background: #1a73e8; }
    .cta { background-color: rgb(233, 30, 99); }
    .muted { color: #f7f7f7; }
  </style>
</head>
<body>
  <img class="site-logo" src="/logo.svg" alt="Acme logo" />
  <h1 style="font-family: Georgia, serif;">Welcome</h1>
</body>
</html>`;

describe('extractBrandFromHtml', () => {
  const kit = extractBrandFromHtml(html, 'https://acme.example.com/home');

  it('extracts the site name', () => {
    expect(kit.siteName).toBe('Acme Store');
  });

  it('resolves the logo to an absolute URL, preferring the <img class=logo>', () => {
    expect(kit.logoUrl).toBe('https://acme.example.com/logo.svg');
    expect(kit.faviconUrl).toBe('https://acme.example.com/favicon.ico');
  });

  it('extracts the theme color and puts it first in the palette', () => {
    expect(kit.themeColor).toBe('#1a73e8');
    expect(kit.colors[0]).toBe('#1a73e8');
  });

  it('collects brand colors and filters greys/black/white', () => {
    expect(kit.colors).toContain('#e91e63'); // brand pink (hex + rgb both counted)
    expect(kit.colors).not.toContain('#222222'); // near-black filtered
    expect(kit.colors).not.toContain('#f7f7f7'); // near-white filtered
  });

  it('extracts named fonts (Google Fonts + font-family) and drops generics', () => {
    expect(kit.fonts).toContain('Poppins');
    expect(kit.fonts).toContain('Open Sans');
    expect(kit.fonts).toContain('Georgia');
    expect(kit.fonts).not.toContain('sans-serif');
    expect(kit.fonts).not.toContain('serif');
  });

  it('falls back to og:image when no <img> logo exists', () => {
    const k = extractBrandFromHtml(
      '<meta property="og:image" content="https://x.com/cover.jpg" />',
      'https://x.com',
    );
    expect(k.logoUrl).toBe('https://x.com/cover.jpg');
  });
});
