import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth middleware — redirects unauthenticated users away from the dashboard
 * and authenticated users away from the auth pages. Cookie name `fm_session`
 * matches the API plugin (apps/api/src/plugins/auth.ts).
 *
 * The presence check is intentionally cheap: we trust API responses to
 * surface 401s if the cookie is stale, but we save a round-trip when the
 * user clearly has no cookie at all.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get('fm_session');

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/reset-password');

  // Public marketing pages — visible without a session.
  const isMarketing = pathname === '/landing' || pathname === '/pricing';

  // Unauth users visiting the dashboard root land on the marketing page
  // instead of the login screen (the login screen is one click away from
  // the landing CTA).
  if (!session && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/landing';
    return NextResponse.redirect(url);
  }

  // Auth users have no business on the marketing pages — bounce them to
  // their dashboard. Saves a confusing "what is this page?" moment.
  if (session && isMarketing) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (!session && !isAuthPage && !isMarketing) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (session && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on everything except Next internals, static assets, and
  // the editor preview route which serves an iframeable shell.
  matcher: ['/((?!_next/|api/|favicon|.*\\..*).*)'],
};
