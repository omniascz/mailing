/**
 * Server-side API fetch helper.
 *
 * Reads NEXT_PUBLIC_API_URL (or API_URL on the server) and forwards the
 * incoming request's cookies so JWT/session auth flows through. Falls
 * back to a permissive empty-state response if the API is unreachable so
 * dashboard pages render shells instead of throwing.
 */

import { cookies } from 'next/headers';

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiResponse<T> {
  data: T;
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Server-only fetch. Forwards cookies so the API sees the user session.
 * Pass `tags` to opt into Next's per-tag revalidation; otherwise the
 * caller's route segment cache settings apply.
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { tags?: string[]; fallback?: T } = {},
): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const { tags, fallback, headers, ...rest } = opts;

  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...headers,
      },
      next: tags ? { tags } : undefined,
    });

    if (!res.ok) {
      if (fallback !== undefined) return fallback;
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, 'API_ERROR', `${res.status} ${url} ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as ApiResponse<T>;
    return body.data;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}
