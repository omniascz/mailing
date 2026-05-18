import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis before importing the module under test
vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { scrapeProduct } from './product-scraper.js';
import { redis } from '../../lib/redis.js';

const FAKE_API_KEY = 'test-api-key';

function makeHtmlResponse(html: string) {
  return {
    ok: true,
    text: () => Promise.resolve(html),
  } as unknown as Response;
}

function makeClaudeResponse(json: object) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(json) }],
      }),
  } as unknown as Response;
}

describe('scrapeProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('returns cached result without calling fetch', async () => {
    const cached = JSON.stringify({
      title: 'Cached product',
      description: 'desc',
      price: '9.99',
      currency: 'CZK',
      imageUrl: null,
      url: 'https://example.com/product',
    });
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cached);

    const result = await scrapeProduct('https://example.com/product', FAKE_API_KEY);
    expect(result.title).toBe('Cached product');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches page HTML then calls Claude API', async () => {
    const productHtml = '<html><body><h1>Awesome Widget</h1><p>Great product</p><span>199 Kč</span></body></html>';
    const claudeData = {
      title: 'Awesome Widget',
      description: 'Great product',
      price: '199',
      currency: 'CZK',
      imageUrl: null,
    };

    mockFetch
      .mockResolvedValueOnce(makeHtmlResponse(productHtml)) // page fetch
      .mockResolvedValueOnce(makeClaudeResponse(claudeData)); // Claude API

    const result = await scrapeProduct('https://example.com/widget', FAKE_API_KEY);

    expect(result.title).toBe('Awesome Widget');
    expect(result.price).toBe('199');
    expect(result.currency).toBe('CZK');
    expect(result.imageUrl).toBeNull();
    expect(result.url).toBe('https://example.com/widget');
  });

  it('caches the scraped result in Redis', async () => {
    const productHtml = '<html><body><h1>Widget</h1></body></html>';
    const claudeData = {
      title: 'Widget',
      description: '',
      price: null,
      currency: null,
      imageUrl: null,
    };

    mockFetch
      .mockResolvedValueOnce(makeHtmlResponse(productHtml))
      .mockResolvedValueOnce(makeClaudeResponse(claudeData));

    await scrapeProduct('https://example.com/widget', FAKE_API_KEY);

    expect(redis.setex).toHaveBeenCalledOnce();
    const call = (redis.setex as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(call[1]).toBe(60 * 60 * 6);
    expect(JSON.parse(call[2] as string).title).toBe('Widget');
  });

  it('throws when page fetch returns non-200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(scrapeProduct('https://example.com/gone', FAKE_API_KEY)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws when Claude returns unparseable JSON', async () => {
    const productHtml = '<html><body><h1>Widget</h1></body></html>';
    mockFetch
      .mockResolvedValueOnce(makeHtmlResponse(productHtml))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'not json at all' }],
          }),
      } as unknown as Response);

    await expect(scrapeProduct('https://example.com/widget', FAKE_API_KEY)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('throws when Claude response has no title', async () => {
    const productHtml = '<html><body></body></html>';
    mockFetch
      .mockResolvedValueOnce(makeHtmlResponse(productHtml))
      .mockResolvedValueOnce(
        makeClaudeResponse({ title: '', description: '', price: null, currency: null, imageUrl: null }),
      );

    await expect(scrapeProduct('https://example.com/empty', FAKE_API_KEY)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
