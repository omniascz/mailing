import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { htmlToBlocks } from './html-to-blocks.js';
import { redis } from '../../lib/redis.js';

function makeClaudeResponse(json: object) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(json) }],
      }),
  } as unknown as Response;
}

const VALID_SCHEMA = {
  subject: 'Test email',
  preheader: 'A preheader',
  globalStyles: { backgroundColor: '#ffffff', fontFamily: 'Arial', linkColor: '#000', textColor: '#333', contentWidth: 600, contentBackgroundColor: '#fff' },
  blocks: [
    { id: 'b1', type: 'text', content: '<p>Hello</p>', fontSize: '16px', fontFamily: 'Arial', color: '#000', lineHeight: '1.5', textAlign: 'left' },
  ],
};

describe('htmlToBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('calls Claude API and returns a valid schema', async () => {
    mockFetch.mockResolvedValueOnce(makeClaudeResponse(VALID_SCHEMA));

    const result = await htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key');
    expect(result.blocks).toHaveLength(1);
    expect(result.subject).toBe('Test email');
    expect(result.preheader).toBe('A preheader');
  });

  it('returns cached result without calling fetch', async () => {
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(VALID_SCHEMA));

    const result = await htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.blocks).toHaveLength(1);
  });

  it('strips markdown code fences from Claude response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: '```json\n' + JSON.stringify(VALID_SCHEMA) + '\n```' }],
        }),
    } as unknown as Response);

    const result = await htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key');
    expect(result.blocks).toHaveLength(1);
  });

  it('throws when Claude returns invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'not valid json' }],
        }),
    } as unknown as Response);

    await expect(htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key')).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('throws when response lacks blocks array', async () => {
    mockFetch.mockResolvedValueOnce(makeClaudeResponse({ subject: 'ok', noBlocks: true }));

    await expect(htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key')).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('throws when Claude API returns non-200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('error') } as unknown as Response);

    await expect(htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key')).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('caches result after successful conversion', async () => {
    mockFetch.mockResolvedValueOnce(makeClaudeResponse(VALID_SCHEMA));

    await htmlToBlocks('<html><body><p>Hello</p></body></html>', 'test-key');
    expect(redis.setex).toHaveBeenCalledOnce();
    const call = (redis.setex as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const ttl = call[1];
    expect(ttl).toBe(60 * 60);
  });
});
