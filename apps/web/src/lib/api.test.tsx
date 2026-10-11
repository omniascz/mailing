/**
 * apiFetch tells a missing resource from a refused, failed or unreachable
 * request — and the error boundary says which one it was.
 *
 * Before: every failure returned the caller's fallback, so a 429, a 500 and a
 * dead API all looked like "no such campaign" and the detail pages answered
 * notFound() — the customer saw 404.
 *
 * WHAT THIS CANNOT SEE: a real API and a real Next render. Those are
 * apps/web/e2e/api-errors.spec.ts (429 and a real 404 through the browser).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [{ name: 'fm_session', value: 'tok' }] }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

const { apiFetch } = await import('./api');
import type { ApiError } from './api-outcome';
const { errorStateFor } = await import('./api-outcome');
const DashboardError = (await import('../app/(dashboard)/error')).default;

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

async function failure(p: Promise<unknown>) {
  try {
    const value = await p;
    return { returned: value };
  } catch (e) {
    const err = e as ApiError;
    return { status: err.status, digest: err.digest, code: err.code };
  }
}

describe('what apiFetch does with each answer', () => {
  it('200: the data', async () => {
    reply(200, { data: { id: 'c1' } });
    expect(await apiFetch('/api/v1/campaigns/c1', { fallback: null })).toEqual({ id: 'c1' });
  });

  it('404: the fallback — the resource is not there', async () => {
    reply(404, { code: 'NOT_FOUND', message: 'Campaign not found' });
    expect(await failure(apiFetch('/api/v1/campaigns/x', { fallback: null }))).toEqual({
      returned: null,
    });
  });

  it('429: thrown, not the fallback', async () => {
    reply(429, { code: 'RATE_LIMIT', message: 'Too many requests' });
    const out = await failure(apiFetch('/api/v1/campaigns/x', { fallback: null }));
    console.log(`[z128] 429 → ${JSON.stringify(out)}`);
    expect(out).toEqual({ status: 429, digest: 'FORGEMSG_API_429', code: 'RATE_LIMIT' });
  });

  it('500: thrown, not the fallback', async () => {
    reply(500, { code: 'INTERNAL', message: 'boom' });
    const out = await failure(apiFetch('/api/v1/campaigns/x', { fallback: null }));
    console.log(`[z128] 500 → ${JSON.stringify(out)}`);
    expect(out).toEqual({ status: 500, digest: 'FORGEMSG_API_500', code: 'INTERNAL' });
  });

  it('API unreachable: thrown, not the fallback', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const out = await failure(apiFetch('/api/v1/campaigns/x', { fallback: null }));
    console.log(`[z128] unreachable → ${JSON.stringify(out)}`);
    expect(out).toEqual({ status: 0, digest: 'FORGEMSG_API_UNREACHABLE', code: 'API_UNREACHABLE' });
  });

  it('403: the fallback only where the caller says 403 means "not for you"', async () => {
    reply(403, { code: 'FORBIDDEN', message: 'nope' });
    expect(
      await failure(apiFetch('/api/v1/audit-logs', { fallback: [], absentOn: [403, 404] })),
    ).toEqual({ returned: [] });
    reply(403, { code: 'FORBIDDEN', message: 'nope' });
    expect(await failure(apiFetch('/api/v1/superadmin/stats', { fallback: null }))).toMatchObject({
      status: 403,
    });
  });

  it('forwards the signed-in session, which is what the API counts the request against', async () => {
    reply(200, { data: 1 });
    await apiFetch('/api/v1/x');
    expect(fetchMock.mock.calls[0]![1].headers.cookie).toBe('fm_session=tok');
  });
});

describe('what the error boundary says', () => {
  it('names each kind of failure, and never says "not found"', () => {
    for (const [digest, title] of [
      ['FORGEMSG_API_429', 'Too many requests'],
      ['FORGEMSG_API_500', 'Server error'],
      ['FORGEMSG_API_503', 'Server error'],
      ['FORGEMSG_API_UNREACHABLE', 'Server unreachable'],
      ['FORGEMSG_API_401', 'Session expired'],
      ['FORGEMSG_API_403', 'No permission'],
      ['FORGEMSG_API_400', 'Loading failed'],
    ] as const) {
      expect(errorStateFor(digest)?.title, digest).toBe(title);
    }
    expect(errorStateFor('1234567')).toBeNull();
  });

  it('renders the 429 state with a retry', () => {
    const err = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: 'FORGEMSG_API_429',
    });
    const html = renderToStaticMarkup(<DashboardError error={err} reset={() => {}} />);
    expect(html).toContain('Too many requests');
    expect(html).toContain('Try again');
    expect(html).not.toMatch(/nenašli|404/);
  });

  it('says it in English, word for word (Z129)', () => {
    expect(errorStateFor('FORGEMSG_API_429')?.text).toBe(
      'The server is refusing further requests because too many arrived in a short time. Wait a moment and try again.',
    );
    expect(errorStateFor('FORGEMSG_API_UNREACHABLE')?.text).toBe(
      'Could not connect to the application server. Please try again in a moment.',
    );
    expect(errorStateFor('FORGEMSG_API_403')).toMatchObject({
      title: 'No permission',
      text: 'You do not have permission to see this. If you need it, ask an administrator of your organisation.',
      retry: false,
    });
    expect(errorStateFor('FORGEMSG_API_502')?.text).toBe(
      'The server failed while loading (HTTP 502). Please try again; if it keeps happening, email support@mailforge.cz.',
    );
  });
});
