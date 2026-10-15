/**
 * The one contact-status read the WhatsApp, web push and mobile push workers
 * share (Z155): found → its status; not returned (missing or deleted) → null;
 * an HTTP error throws, so BullMQ retries and nothing is sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { contactStatus, marketingSkip } from './contact-status.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const ID = '00000000-0000-4000-8000-000000000002';

function answer(res: Response) {
  const f = vi.fn(async () => res);
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contactStatus', () => {
  it('returns the status of the contact the route returned', async () => {
    const f = answer(Response.json({ data: [{ id: ID, status: 'unsubscribed' }] }));
    expect(await contactStatus(ORG, ID)).toBe('unsubscribed');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/internal\/contacts\/batch$/);
    expect(JSON.parse(String(init.body))).toEqual({ orgId: ORG, contactIds: [ID] });
  });

  it('returns null when the route does not return the contact (missing or deleted)', async () => {
    answer(Response.json({ data: [] }));
    expect(await contactStatus(ORG, ID)).toBeNull();
  });

  it('throws on an HTTP error instead of guessing', async () => {
    answer(new Response('nope', { status: 503 }));
    await expect(contactStatus(ORG, ID)).rejects.toThrow('/internal/contacts/batch → 503');
  });
});

describe('marketingSkip', () => {
  it.each([
    ['active', null],
    ['non_subscribed', null],
    ['pending', 'skipped_pending'],
    ['unsubscribed', 'skipped_refused'],
    ['bounced', 'skipped_refused'],
    ['complained', 'skipped_refused'],
    ['archived', 'skipped_refused'],
  ])('%s → %s', async (status, skip) => {
    answer(Response.json({ data: [{ id: ID, status }] }));
    expect(await marketingSkip(ORG, ID)).toBe(skip);
  });

  it('not found → skipped_no_contact', async () => {
    answer(Response.json({ data: [] }));
    expect(await marketingSkip(ORG, ID)).toBe('skipped_no_contact');
  });

  it('HTTP error → throws', async () => {
    answer(new Response('nope', { status: 500 }));
    await expect(marketingSkip(ORG, ID)).rejects.toThrow();
  });
});
