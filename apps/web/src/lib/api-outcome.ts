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
      title: 'Server je nedostupný',
      text: 'Nepodařilo se spojit se serverem aplikace. Zkuste to prosím za chvíli znovu.',
      retry: true,
    };
  }
  const status = Number(tail);
  if (status === 429) {
    return {
      title: 'Příliš mnoho požadavků',
      text: 'Server teď odmítl další požadavky, protože jich přišlo příliš mnoho za krátkou dobu. Počkejte chvíli a zkuste to znovu.',
      retry: true,
    };
  }
  if (status === 401) {
    return {
      title: 'Přihlášení vypršelo',
      text: 'Vaše přihlášení už neplatí. Přihlaste se prosím znovu.',
      retry: false,
      href: '/login',
      linkLabel: 'Přihlásit se',
    };
  }
  if (status === 403) {
    return {
      title: 'Bez oprávnění',
      text: 'K těmto údajům nemáte oprávnění. Pokud je potřebujete, požádejte správce organizace.',
      retry: false,
    };
  }
  if (status >= 500) {
    return {
      title: 'Chyba na serveru',
      text: `Server při načítání selhal (HTTP ${status}). Zkuste to prosím znovu; pokud to potrvá, napište na support@mailforge.cz.`,
      retry: true,
    };
  }
  return {
    title: 'Načítání selhalo',
    text: `Server požadavek odmítl (HTTP ${status}). Zkuste to prosím znovu.`,
    retry: true,
  };
}
