/**
 * Server-side API fetch helper.
 *
 * Reads NEXT_PUBLIC_API_URL (or API_URL on the server) and forwards the
 * incoming request's cookies so JWT/session auth flows through — which is also
 * what the API's limiter counts the request against: the signed-in session,
 * not the web server's address.
 *
 * Failures are not all the same thing (see api-outcome.ts): a missing resource
 * (404, or a status the caller lists in `absentOn`) returns the `fallback`;
 * anything else — 429, 5xx, 401, an API that does not answer — throws an
 * ApiError, which the error boundary shows with what happened and a retry.
 */

import { cookies } from 'next/headers';
import { ApiError, apiErrorFrom, returnsFallback } from './api-outcome';

export { ApiError } from './api-outcome';

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiResponse<T> {
  data: T;
  error?: { code: string; message: string };
}

/**
 * Server-only fetch. Forwards cookies so the API sees the user session.
 * Pass `tags` to opt into Next's per-tag revalidation; otherwise the
 * caller's route segment cache settings apply.
 *
 * `fallback` is what a missing resource returns — a 404 unless `absentOn`
 * names other statuses the caller treats as "not there" (403 for data a role
 * may not see, say). It is never returned for a refused, failed or
 * unreachable request.
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { tags?: string[]; fallback?: T; absentOn?: number[] } = {},
): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const { tags, fallback, absentOn, headers, ...rest } = opts;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...headers,
      },
      next: tags ? { tags } : undefined,
    });
  } catch (err) {
    throw new ApiError(
      0,
      'API_UNREACHABLE',
      `API unreachable: ${url} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (!res.ok) {
    if (returnsFallback(res.status, fallback !== undefined, absentOn)) return fallback as T;
    throw apiErrorFrom(res.status, await res.text().catch(() => ''));
  }

  const body = (await res.json()) as ApiResponse<T>;
  return body.data;
}
