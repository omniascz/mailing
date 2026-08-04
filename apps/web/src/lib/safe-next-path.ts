/**
 * Validates the `next` query parameter used to bounce a user back to where
 * they were headed before the login screen interrupted them.
 *
 * `next` comes straight off the URL, so it is attacker-controlled: without
 * validation `/login?next=https://evil.example` turns the login page into an
 * open redirect, which is a credible phishing primitive (the victim sees a
 * legitimate login domain, then lands on the attacker's clone).
 *
 * Only same-origin absolute *paths* are accepted - a single leading `/`
 * followed by something that cannot be re-parsed as another origin. Anything
 * else falls back to the app root.
 */

/** Where users land when `next` is absent or rejected. */
export const DEFAULT_AFTER_LOGIN = '/';

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_LOGIN;

  // Must be a path, not a full URL.
  if (!next.startsWith('/')) return DEFAULT_AFTER_LOGIN;

  // `//evil.example` and `/\evil.example` are protocol-relative URLs: browsers
  // resolve both to a different origin even though they start with a slash.
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_AFTER_LOGIN;

  // A backslash anywhere is rejected outright - browsers normalise `\` to `/`
  // inconsistently, so it is a known bypass vector rather than a legitimate
  // character in one of our routes.
  if (next.includes('\\')) return DEFAULT_AFTER_LOGIN;

  // A colon before the first `/`, `?` or `#` means a scheme snuck in
  // (`javascript:`, `data:`, ...). Colons later in the string are fine - they
  // are legal in query strings and fragments.
  const firstDelimiter = next.search(/[/?#]/);
  const head = firstDelimiter === -1 ? next : next.slice(0, firstDelimiter);
  if (head.includes(':')) return DEFAULT_AFTER_LOGIN;

  // Control characters (including the newline/tab tricks used to smuggle a
  // scheme past naive checks) are never valid in a path we generated.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return DEFAULT_AFTER_LOGIN;

  // Final belt-and-braces: resolve against a throwaway origin and confirm the
  // result did not escape it.
  try {
    const probe = new URL(next, 'https://forgemsg.invalid');
    if (probe.origin !== 'https://forgemsg.invalid') return DEFAULT_AFTER_LOGIN;
    return `${probe.pathname}${probe.search}${probe.hash}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
