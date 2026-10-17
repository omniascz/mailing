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

  // Z166 — Michal, 14. 10. 22:10, point 3: a flow's job skips non_subscribed.
  it.each([
    ['active', null],
    ['non_subscribed', 'skipped_refused'],
    ['pending', 'skipped_pending'],
    ['unsubscribed', 'skipped_refused'],
    ['bounced', 'skipped_refused'],
    ['complained', 'skipped_refused'],
    ['archived', 'skipped_refused'],
  ])('a flow job: %s → %s', async (status, skip) => {
    answer(Response.json({ data: [{ id: ID, status }] }));
    expect(await marketingSkip(ORG, ID, true)).toBe(skip);
  });

  it('a campaign job (fromFlow false) lets non_subscribed through, as before', async () => {
    answer(Response.json({ data: [{ id: ID, status: 'non_subscribed' }] }));
    expect(await marketingSkip(ORG, ID, false)).toBeNull();
  });

  it('not found → skipped_no_contact', async () => {
    answer(Response.json({ data: [] }));
    expect(await marketingSkip(ORG, ID)).toBe('skipped_no_contact');
    answer(Response.json({ data: [] }));
    expect(await marketingSkip(ORG, ID, true)).toBe('skipped_no_contact');
  });

  it('HTTP error → throws', async () => {
    answer(new Response('nope', { status: 500 }));
    await expect(marketingSkip(ORG, ID)).rejects.toThrow();
  });
});

// Z180 — the WhatsApp worker passes the job's number; the API answers whether
// a GDPR erasure left its fingerprint. Without a number the request is as before.
describe('marketingSkip with the number (Z180)', () => {
  const PHONE = '+420777000001';

  it('sends the number in the same request and skips an erased one as skipped_refused', async () => {
    const f = answer(
      Response.json({ data: [{ id: ID, status: 'active' }], phoneSuppressed: true }),
    );
    expect(await marketingSkip(ORG, ID, false, PHONE)).toBe('skipped_refused');
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ orgId: ORG, contactIds: [ID], phone: PHONE });
    answer(Response.json({ data: [{ id: ID, status: 'active' }], phoneSuppressed: true }));
    expect(await marketingSkip(ORG, ID, true, PHONE)).toBe('skipped_refused');
  });

  it('a number with no fingerprint goes as before', async () => {
    answer(Response.json({ data: [{ id: ID, status: 'active' }], phoneSuppressed: false }));
    expect(await marketingSkip(ORG, ID, false, PHONE)).toBeNull();
  });

  it('the contact gates keep their own answers first', async () => {
    answer(Response.json({ data: [], phoneSuppressed: true }));
    expect(await marketingSkip(ORG, ID, false, PHONE)).toBe('skipped_no_contact');
    answer(Response.json({ data: [{ id: ID, status: 'pending' }], phoneSuppressed: true }));
    expect(await marketingSkip(ORG, ID, false, PHONE)).toBe('skipped_pending');
  });

  it('without a number the request carries no phone field', async () => {
    const f = answer(Response.json({ data: [{ id: ID, status: 'active' }] }));
    expect(await marketingSkip(ORG, ID)).toBeNull();
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ orgId: ORG, contactIds: [ID] });
  });
});
