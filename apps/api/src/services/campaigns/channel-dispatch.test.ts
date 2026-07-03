import { describe, it, expect } from 'vitest';
import {
  smsBody,
  whatsappContent,
  pushContent,
  addBulkChunked,
  type BulkJob,
} from './channel-dispatch.js';
import type { Campaign } from '../../db/schema/index.js';

const mk = (content: Record<string, unknown>, extra: Partial<Campaign> = {}) =>
  ({ content, subject: null, ...extra }) as unknown as Campaign;

describe('channel content extraction', () => {
  it('reads SMS body from body/text/message/plainText, trims, null when empty', () => {
    expect(smsBody(mk({ body: ' Hi ' }))).toBe('Hi');
    expect(smsBody(mk({ text: 'T' }))).toBe('T');
    expect(smsBody(mk({ message: 'M' }))).toBe('M');
    expect(smsBody(mk({ plainText: 'P' }))).toBe('P');
    expect(smsBody(mk({}))).toBeNull();
    expect(smsBody(mk({ body: '   ' }))).toBeNull();
  });

  it('reads WhatsApp template/body with language default', () => {
    expect(whatsappContent(mk({ templateName: 'promo', language: 'cs' }))).toEqual({
      templateId: 'promo',
      language: 'cs',
      body: undefined,
    });
    expect(whatsappContent(mk({ body: 'hey' })).language).toBe('en');
    expect(whatsappContent(mk({ templateId: 't' })).templateId).toBe('t');
  });

  it('reads push title/body/url, falling back to subject for title', () => {
    expect(pushContent(mk({ title: 'T', body: 'B', url: 'https://x' }))).toEqual({
      title: 'T',
      body: 'B',
      url: 'https://x',
    });
    expect(pushContent(mk({ body: 'B' }, { subject: 'SubjTitle' })).title).toBe('SubjTitle');
    expect(pushContent(mk({ actionUrl: 'https://a' })).url).toBe('https://a');
  });
});

describe('addBulkChunked', () => {
  it('splits jobs into chunks and calls addBulk per chunk', async () => {
    const calls: number[] = [];
    const fakeQueue = {
      addBulk: async (jobs: BulkJob[]) => {
        calls.push(jobs.length);
      },
    };
    const jobs: BulkJob[] = Array.from({ length: 2500 }, (_, i) => ({
      name: `j${i}`,
      data: {},
      opts: { priority: 3 },
    }));
    await addBulkChunked(fakeQueue, jobs, 1000);
    expect(calls).toEqual([1000, 1000, 500]);
  });

  it('no-ops on empty job list', async () => {
    let called = false;
    await addBulkChunked({ addBulk: async () => { called = true; } }, [], 1000);
    expect(called).toBe(false);
  });
});
