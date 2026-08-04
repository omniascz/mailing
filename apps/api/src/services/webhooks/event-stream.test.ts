import { describe, it, expect } from 'vitest';
import { parseStreamEntries } from './event-stream.js';

describe('parseStreamEntries', () => {
  it('parses XRANGE rows into typed events', () => {
    const out = parseStreamEntries([
      [
        '1712-0',
        ['event', 'email.delivered', 'ts', '2026-07-03T00:00:00Z', 'data', '{"messageId":"m1"}'],
      ],
      [
        '1713-0',
        ['event', 'email.opened', 'ts', '2026-07-03T00:01:00Z', 'data', '{"contactId":"c1"}'],
      ],
    ]);
    expect(out).toEqual([
      {
        id: '1712-0',
        event: 'email.delivered',
        ts: '2026-07-03T00:00:00Z',
        data: { messageId: 'm1' },
      },
      {
        id: '1713-0',
        event: 'email.opened',
        ts: '2026-07-03T00:01:00Z',
        data: { contactId: 'c1' },
      },
    ]);
  });

  it('degrades malformed data JSON to {}', () => {
    const out = parseStreamEntries([['1-0', ['event', 'x', 'ts', 't', 'data', 'not-json']]]);
    expect(out[0]!.data).toEqual({});
  });

  it('tolerates missing fields', () => {
    const out = parseStreamEntries([['1-0', []]]);
    expect(out[0]).toEqual({ id: '1-0', event: '', ts: '', data: {} });
  });
});
