import { test, expect } from '@playwright/test';

/**
 * Critical-path smoke. Catches "the build is completely broken"
 * regressions before they hit users. Assumes the seed has been
 * applied — see `pnpm seed`.
 *
 * Skip locally when you don't have the dev stack up by setting
 * SKIP_E2E=1 in the env.
 */
test.describe('Golden path', () => {
  test('landing page renders for unauthenticated visitor', async ({ page }) => {
    await page.goto('/');
    // Middleware redirects unauth users on / → /landing.
    await expect(page).toHaveURL(/\/landing/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The landing page carries the same CTA in the nav and twice in <main>.
    // The assertion is "a signup CTA is reachable", not "there is exactly one",
    // so take the first match rather than tripping Playwright's strict mode.
    await expect(page.getByRole('link', { name: /vyzkoušet zdarma/i }).first()).toBeVisible();
  });

  test('pricing page lists all five plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /jeden plán/i })).toBeVisible();
    for (const plan of ['Free', 'Starter', 'Pro', 'Business', 'Enterprise']) {
      await expect(page.getByRole('heading', { name: plan, exact: true })).toBeVisible();
    }
  });

  test('login form rejects empty submit', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|welcome|přihl/i })).toBeVisible();
    // Submit empty — UI should keep us on /login (browser-level required
    // attribute blocks the submit, or app-level validation shows errors).
    const submit = page.getByRole('button', { name: /sign in|login|přihl/i }).first();
    await submit.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with seeded demo credentials reaches dashboard', async ({ page }) => {
    test.skip(
      process.env.SKIP_LOGIN_TEST === '1',
      'Set SKIP_LOGIN_TEST=1 when running without a seeded DB',
    );

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('demo@acme.test');
    await page.getByLabel(/password/i).fill('Demo1234!');
    await page
      .getByRole('button', { name: /sign in|login|přihl/i })
      .first()
      .click();

    // After successful login the middleware drops us back to / which
    // renders the dashboard for authed users.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/, { timeout: 10_000 });

    // The dashboard sidebar has a "Campaigns" link visible. Anchored on the
    // href, not the label: the sidebar also carries "RSS campaigns"
    // (/rss-campaigns), so any substring match on the word resolves to two
    // elements and trips strict mode. The href is the identity of the link we
    // actually mean, and it survives the label being translated.
    await expect(page.locator('a[href="/campaigns"]')).toBeVisible();
  });

  test('forgot-password form posts without error (seeded user)', async ({ page }) => {
    test.skip(process.env.SKIP_LOGIN_TEST === '1', 'Requires a running API to validate the POST');

    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('demo@acme.test');
    await page
      .getByRole('button', { name: /reset|send/i })
      .first()
      .click();
    // Always-200 endpoint — UI should show the "check your email" state.
    await expect(page.getByText(/check your email|zkontrolujte/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
