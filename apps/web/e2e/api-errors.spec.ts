import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

/**
 * A page rendered on the server says what went wrong with the API — and a 404
 * is shown only for something that really is not there.
 *
 * Before (Z127): the API's limiter keyed on the address, the web server's
 * server-side fetches all came from one, so every user shared one bucket; and
 * apiFetch turned the resulting 429 into the page's fallback, so the campaign
 * page called notFound(). The customer saw "Tady to nikam nevede" for a busy
 * server.
 *
 * Real browser, real web server, real API — nothing is mocked.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;

async function signedIn(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('demo@acme.test');
  await page.getByLabel(/password/i).fill('Demo1234!');
  await page
    .getByRole('button', { name: /sign in|login|přihl/i })
    .first()
    .click();
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/, { timeout: 15_000 });
  return { context, page };
}

test.describe('API errors on server-rendered pages', () => {
  test.skip(
    process.env.SKIP_LOGIN_TEST === '1' || !DATABASE_URL,
    'Needs the seeded database (DATABASE_URL) and a running API',
  );

  let campaignId: string;
  let campaignName: string;
  test.beforeAll(async () => {
    const sql = postgres(DATABASE_URL!, { max: 1, prepare: false });
    const [c] = await sql<{ id: string; name: string }[]>`
      SELECT c.id, c.name FROM campaigns c JOIN users u ON u.org_id = c.org_id
      WHERE u.email = 'demo@acme.test' ORDER BY c.created_at LIMIT 1
    `;
    await sql.end();
    campaignId = c!.id;
    campaignName = c!.name;
  });

  test('429 for this user: the page says so and offers a retry — it does not say 404', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await signedIn(browser);
    try {
      // Spend this session's budget through the API, with the session's cookie.
      let refused = 0;
      let lastRemaining = '';
      for (let i = 0; i < 110 && refused === 0; i++) {
        const res = await context.request.get(`${API}/api/v1/campaigns?limit=1`);
        lastRemaining = res.headers()['x-ratelimit-remaining'] ?? '';
        if (res.status() === 429) refused++;
      }
      expect(refused, 'the session was never refused').toBe(1);

      const response = await page.goto(`/campaigns/${campaignId}`);
      const state = page.getByTestId('error-state');
      await expect(state).toBeVisible();
      const text = await state.innerText();
      console.log(
        `[z128] 429 page: HTTP ${response?.status()} remaining=${lastRemaining} digest=${await state.getAttribute('data-digest')} text=${JSON.stringify(text)}`,
      );
      expect(await state.getAttribute('data-digest')).toBe('FORGEMSG_API_429');
      expect(text).toContain('Příliš mnoho požadavků');
      expect(text).toContain('Zkusit znovu');
      await expect(page.getByText('Tady to nikam nevede')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('another user rendered by the same web server is not affected by the first one’s 429', async ({
    browser,
  }) => {
    // The previous test spent its own session's budget. A new login is a new
    // session — on master it was the same web-server address, and refused.
    const { context, page } = await signedIn(browser);
    try {
      await page.goto(`/campaigns/${campaignId}`);
      const heading = await page.getByRole('heading', { level: 1 }).innerText();
      console.log(`[z128] second session: h1=${JSON.stringify(heading)}`);
      // The campaign itself — not an error state, and not the not-found page.
      expect(heading).toBe(campaignName);
      await expect(page.getByTestId('error-state')).toHaveCount(0);
      await expect(page.getByText('Tady to nikam nevede')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a campaign that really does not exist is still a 404', async ({ browser }) => {
    const { context, page } = await signedIn(browser);
    try {
      const response = await page.goto(`/campaigns/${randomUUID()}`);
      await expect(page.getByText('Tady to nikam nevede')).toBeVisible();
      await expect(page.getByTestId('error-state')).toHaveCount(0);
      // The page is the not-found page. The HTTP status is 200, as it was before
      // this change: (dashboard)/loading.tsx starts the stream before the page
      // calls notFound(), so the status is already sent (a "soft 404").
      console.log(`[z128] missing campaign: HTTP ${response?.status()}, not-found page shown`);
    } finally {
      await context.close();
    }
  });
});
