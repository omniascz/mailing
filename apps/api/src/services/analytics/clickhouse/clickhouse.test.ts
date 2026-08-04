import { describe, it, expect } from 'vitest';
import { parseJSONEachRow, toJSONEachRow, chEscape } from './client.js';
import { mapRowToClickHouse, chDateTime } from './replicator.js';

describe('ClickHouse client serialization', () => {
  it('round-trips JSONEachRow', () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ];
    const body = toJSONEachRow(rows);
    expect(body.split('\n')).toHaveLength(2);
    expect(parseJSONEachRow(body)).toEqual(rows);
  });

  it('parseJSONEachRow ignores blank lines', () => {
    expect(parseJSONEachRow('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('chEscape escapes quotes + backslashes', () => {
    expect(chEscape("o'brien")).toBe("o\\'brien");
    expect(chEscape('a\\b')).toBe('a\\\\b');
  });
});

describe('PG → ClickHouse row mapping', () => {
  it('maps a full row, coalescing nulls + booleans', () => {
    const ch = mapRowToClickHouse({
      id: 'e1',
      orgId: 'o1',
      campaignId: 'c1',
      contactId: null,
      stream: 'broadcast',
      eventType: 'open',
      bounceType: null,
      messageId: 'm1',
      linkUrl: null,
      deviceType: 'mobile',
      emailClient: null,
      abVariantId: null,
      isBot: true,
      createdAt: new Date('2026-01-02T03:04:05.678Z'),
    });
    expect(ch).toMatchObject({
      id: 'e1',
      org_id: 'o1',
      campaign_id: 'c1',
      contact_id: '', // null → ''
      event_type: 'open',
      bounce_type: '',
      is_bot: 1, // boolean → 0/1
    });
    expect(ch.created_at).toBe('2026-01-02 03:04:05.678');
  });

  it('chDateTime formats for DateTime64(3)', () => {
    expect(chDateTime(new Date('2026-06-22T12:00:00.000Z'))).toBe('2026-06-22 12:00:00.000');
  });
});
