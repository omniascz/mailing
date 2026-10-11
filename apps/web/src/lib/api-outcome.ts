/**
 * What a failed API call means for the page that made it — kept apart from
 * apiFetch (which needs next/headers) so it can be tested on its own.
 *
 * apiFetch used to turn every failure into the caller's fallback: a 429, a 500
 * and an API that was down all looked exactly like "there is no such
 * campaign", and the detail pages answered with notFound(). The customer saw
 * 404 for a busy or broken server.
 *
 * Now only a missing resource (404) — or a status the caller names itself, e.g.
 * 403 for data a role may not see — returns the fallback. Everything else is
 * thrown as an ApiError, and the error boundary (app/(dashboard)/error.tsx)
 * says what happened and offers to try again.
 */

/**
 * Next.js passes a server error's `digest` to the error boundary even in a
 * production build, where it replaces the message. The digest therefore
 * carries what the boundary needs to say: this prefix and the status, or
 * `UNREACHABLE` when no response came back at all.
 */
export const API_ERROR_DIGEST_PREFIX = 'FORGEMSG_API_';

export class ApiError extends Error {
  readonly digest: string;
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.digest = `${API_ERROR_DIGEST_PREFIX}${status === 0 ? 'UNREACHABLE' : status}`;
  }
}

/** The statuses that mean "not there" unless the caller says otherwise. */
export const DEFAULT_ABSENT_STATUSES: readonly number[] = [404];

/**
 * Whether a failed response should come back to the caller as its fallback.
 * Only a status the caller treats as absence does — never 429, 5xx or 401.
 */
export function returnsFallback(
  status: number,
  hasFallback: boolean,
  absentOn: readonly number[] = DEFAULT_ABSENT_STATUSES,
): boolean {
  return hasFallback && absentOn.includes(status);
}

/** Read an error body whole: `{ code, message }` from the API, or the raw text. */
export function apiErrorFrom(status: number, text: string): ApiError {
  try {
    const body = JSON.parse(text) as { code?: string; message?: string };
    return new ApiError(status, body.code ?? 'API_ERROR', body.message ?? text);
  } catch {
    return new ApiError(status, 'API_ERROR', text || `HTTP ${status}`);
  }
}

export interface ErrorState {
  title: string;
  text: string;
  /** Whether trying again can help; a missing permission will not go away. */
  retry: boolean;
  /** A page to go to instead, when there is a better next step than retrying. */
  href?: string;
  linkLabel?: string;
}

/** What the error boundary tells the customer, from the digest it received. */
export function errorStateFor(digest: string | undefined): ErrorState | null {
  if (!digest?.startsWith(API_ERROR_DIGEST_PREFIX)) return null;
  const tail = digest.slice(API_ERROR_DIGEST_PREFIX.length);
  if (tail === 'UNREACHABLE') {
    return {
      title: 'Server unreachable',
      text: 'Could not connect to the application server. Please try again in a moment.',
      retry: true,
    };
  }
  const status = Number(tail);
  if (status === 429) {
    return {
      title: 'Too many requests',
      text: 'The server is refusing further requests because too many arrived in a short time. Wait a moment and try again.',
      retry: true,
    };
  }
  if (status === 401) {
    return {
      title: 'Session expired',
      text: 'Your sign-in is no longer valid. Please sign in again.',
      retry: false,
      href: '/login',
      linkLabel: 'Sign in',
    };
  }
  if (status === 403) {
    return {
      title: 'No permission',
      text: 'You do not have permission to see this. If you need it, ask an administrator of your organisation.',
      retry: false,
    };
  }
  if (status >= 500) {
    return {
      title: 'Server error',
      text: `The server failed while loading (HTTP ${status}). Please try again; if it keeps happening, email support@mailforge.cz.`,
      retry: true,
    };
  }
  return {
    title: 'Loading failed',
    text: `The server refused the request (HTTP ${status}). Please try again.`,
    retry: true,
  };
}
