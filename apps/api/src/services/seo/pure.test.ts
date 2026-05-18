import { describe, it, expect } from 'vitest';
import {
  extractTag,
  extractMeta,
  extractInternalLinks,
  extractImages,
  countWords,
  fleschKincaid,
  readabilityLabel,
  detectIssues,
  scoreFromIssues,
  renderSitemap,
  renderRobotsTxt,
  canonicalize,
  type AuditSignals,
} from './pure.js';

describe('extractTag', () => {
  it('returns the first tag inner text', () => {
    expect(extractTag('<title>Hello world</title>', 'title')).toBe('Hello world');
  });

  it('ignores attributes', () => {
    expect(extractTag('<h1 class="x">Heading</h1>', 'h1')).toBe('Heading');
  });

  it('returns null when missing', () => {
    expect(extractTag('<body></body>', 'title')).toBeNull();
  });
});

describe('extractMeta', () => {
  it('parses name + content in either order', () => {
    expect(
      extractMeta('<meta name="description" content="Page desc" />', 'description'),
    ).toBe('Page desc');
    expect(
      extractMeta('<meta content="Page desc" name="description" />', 'description'),
    ).toBe('Page desc');
  });
});

describe('extractInternalLinks', () => {
  it('keeps same-host links and resolves relative paths', () => {
    const links = extractInternalLinks(
      `<a href="/about">About</a><a href="https://example.cz/faq">FAQ</a><a href="https://other.cz">Out</a>`,
      'https://example.cz/home',
    );
    expect(links).toContain('https://example.cz/about');
    expect(links).toContain('https://example.cz/faq');
    expect(links).not.toContain('https://other.cz/');
  });
});

describe('extractImages', () => {
  it('returns src + alt', () => {
    const imgs = extractImages('<img src="/a.jpg" alt="A" /><img src="/b.jpg">');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toEqual({ src: '/a.jpg', alt: 'A' });
    expect(imgs[1]!.alt).toBeNull();
  });
});

describe('countWords', () => {
  it('strips tags before counting', () => {
    expect(countWords('<p>Hello <b>world</b> in <em>tags</em></p>')).toBe(4);
  });
});

describe('fleschKincaid / readabilityLabel', () => {
  it('labels an easy text', () => {
    const easy = '<p>The cat sat on the mat. The dog ran fast.</p>';
    expect(readabilityLabel(fleschKincaid(easy))).toBe('easy');
  });

  it('handles empty text gracefully', () => {
    expect(fleschKincaid('<p></p>')).toBe(0);
  });
});

describe('detectIssues', () => {
  const base: AuditSignals = {
    title: 'A perfectly acceptable SEO title for testing',
    metaDesc: 'A meta description that is between 70 and 160 characters to satisfy the best-practice threshold without overshooting. '.slice(0, 120),
    h1: 'Heading one',
    h1Count: 1,
    wordCount: 500,
    readabilityScore: 70,
    images: [{ src: '/x.jpg', alt: 'alt text' }],
    internalLinks: ['https://ex.com/about'],
  };

  it('no issues on a good page', () => {
    expect(detectIssues(base)).toEqual([]);
  });

  it('flags missing title + meta + h1 as errors', () => {
    const issues = detectIssues({ ...base, title: null, metaDesc: null, h1: null, h1Count: 0 });
    const types = issues.map((i) => i.type);
    expect(types).toContain('missing_title');
    expect(types).toContain('missing_meta_desc');
    expect(types).toContain('missing_h1');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(3);
  });

  it('flags thin content + missing alts', () => {
    const issues = detectIssues({
      ...base,
      wordCount: 100,
      images: [{ src: '/x.jpg', alt: null }],
    });
    const types = issues.map((i) => i.type);
    expect(types).toContain('thin_content');
    expect(types).toContain('missing_alt');
  });

  it('flags multiple H1', () => {
    const issues = detectIssues({ ...base, h1Count: 3 });
    expect(issues.some((i) => i.type === 'multiple_h1')).toBe(true);
  });
});

describe('scoreFromIssues', () => {
  it('starts at 100 and subtracts per severity', () => {
    expect(scoreFromIssues([])).toBe(100);
    expect(
      scoreFromIssues([{ type: 'x', severity: 'error', message: '' }]),
    ).toBe(85);
    expect(
      scoreFromIssues([
        { type: 'x', severity: 'error', message: '' },
        { type: 'y', severity: 'warning', message: '' },
        { type: 'z', severity: 'info', message: '' },
      ]),
    ).toBe(79);
  });

  it('clamps to zero', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: `e${i}`,
      severity: 'error' as const,
      message: '',
    }));
    expect(scoreFromIssues(many)).toBe(0);
  });
});

describe('renderSitemap', () => {
  it('emits valid urlset XML', () => {
    const xml = renderSitemap([
      { loc: 'https://example.cz/', changefreq: 'daily', priority: 1.0 },
      {
        loc: 'https://example.cz/blog',
        lastmod: new Date('2026-04-24'),
        priority: 0.8,
      },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('<loc>https://example.cz/</loc>');
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<lastmod>2026-04-24</lastmod>');
  });

  it('escapes XML special characters', () => {
    const xml = renderSitemap([{ loc: 'https://example.cz/?q=a&b=c' }]);
    expect(xml).toContain('&amp;');
  });

  it('clamps priority to [0..1]', () => {
    const xml = renderSitemap([{ loc: 'https://x.cz/', priority: 5 }]);
    expect(xml).toContain('<priority>1.0</priority>');
  });
});

describe('renderRobotsTxt', () => {
  it('renders default allow-all + sitemap pointer', () => {
    const txt = renderRobotsTxt({ sitemapUrl: 'https://example.cz/sitemap.xml' });
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Sitemap: https://example.cz/sitemap.xml');
  });

  it('renders allow + disallow entries', () => {
    const txt = renderRobotsTxt({
      sitemapUrl: 'https://example.cz/sitemap.xml',
      disallow: ['/admin', '/internal'],
      allow: ['/admin/public'],
    });
    expect(txt).toContain('Allow: /admin/public');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /internal');
  });
});

describe('canonicalize', () => {
  it('drops UTM + tracking params', () => {
    expect(
      canonicalize('https://example.cz/p?utm_source=fb&utm_medium=cpc&ref=x&id=42'),
    ).toBe('https://example.cz/p?id=42');
  });

  it('drops fragment', () => {
    expect(canonicalize('https://example.cz/faq#q3')).toBe('https://example.cz/faq');
  });

  it('lowercases host', () => {
    expect(canonicalize('https://EXAMPLE.CZ/About')).toBe('https://example.cz/About');
  });

  it('keeps trailing slash only on root', () => {
    expect(canonicalize('https://example.cz/')).toBe('https://example.cz/');
    expect(canonicalize('https://example.cz/p/')).toBe('https://example.cz/p');
  });

  it('returns null for malformed URLs', () => {
    expect(canonicalize('not a url')).toBeNull();
  });
});
