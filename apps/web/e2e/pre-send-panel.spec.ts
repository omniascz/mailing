import { test, expect, type Page, type BrowserContext, type Request } from '@playwright/test';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

/**
 * Send and Schedule go through the pre-send check, in the browser, against
 * the real API and its gate (#245).
 *
 * Before: the buttons POSTed straight away, without the acknowledgement the
 * gate needs, and a refusal showed as a toast of the first 100 characters of
 * raw JSON — the customer saw neither what failed nor what to do.
 *
 * The data is written straight into the database the API runs on, because the
 * seed has none of it and the product has no way to create it without DNS: an
 * authenticated sending domain, production mode, and — for the no-go cases —
 * 100 delivery outcomes, 15 of them bounces. The browser, the web app, the
 * API, the gate and the audit log are all the real ones; nothing is mocked.
 *
 * WHAT THIS CANNOT SEE
 * - The workers: nothing runs the splitter here, so "sent" means the API took
 *   the campaign into `queueing`, which is what the gate decides.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
const tag = randomUUID().slice(0, 8);
const domain = `e2e-presend-${tag}.test`;

const CONTENT = {
  subject: 'Novinky',
  blocks: [
    {
      id: 'e1',
      type: 'text',
      content: '<p>Dobrý den, máme novinky.</p>',
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#111827',
      lineHeight: '1.5',
      textAlign: 'left',
    },
  ],
  globalStyles: {
    backgroundColor: '#fff',
    contentBackgroundColor: '#fff',
    fontFamily: 'Arial',
    linkColor: '#00f',
    textColor: '#000',
    contentWidth: 600,
  },
  plainText: 'Dobrý den, máme novinky.',
};

test.describe('pre-send check in the web (real API + gate)', () => {
  // Independent tests, each setting the history it needs: a failing one does
  // not skip the rest, so every point reports for itself.
  test.skip(
    process.env.SKIP_LOGIN_TEST === '1' || !DATABASE_URL,
    'Needs the seeded database the API runs on (DATABASE_URL) and a running API',
  );

  let sql: ReturnType<typeof postgres>;
  let orgId: string;
  let originalMode: string;
  let listId: string;
  let context: BrowserContext;
  let page: Page;
  const campaigns: string[] = [];

  async function campaign(label: string): Promise<string> {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name, subject, from_name, from_email, list_id, content, type, status)
      VALUES (${orgId}, ${`e2e presend ${label} ${tag}`}, 'Novinky z obchodu', 'Obchod',
              ${`noreply@${domain}`}, ${listId}, ${sql.json(CONTENT)}, 'email', 'draft')
      RETURNING id
    `;
    campaigns.push(c!.id);
    return c!.id;
  }

  const status = async (id: string) =>
    (await sql<{ status: string }[]>`SELECT status FROM campaigns WHERE id = ${id}`)[0]!.status;

  /** 100 delivery outcomes, 15 of them bounces: a no-go on the bounce rate. */
  async function badHistory() {
    await goodHistory();
    await sql`
      INSERT INTO email_events (org_id, event_type, bounce_type, metadata)
      SELECT ${orgId}, CASE WHEN g <= 15 THEN 'bounce' ELSE 'deliver' END::email_event_type,
             (CASE WHEN g <= 15 THEN 'hard' END)::bounce_type, ${sql.json({ e2e: tag })}
      FROM generate_series(1, 100) g
    `;
  }
  /** No history of this file's making: the seed has none either. */
  async function goodHistory() {
    await sql`DELETE FROM email_events WHERE org_id = ${orgId} AND metadata->>'e2e' = ${tag}`;
  }

  /**
   * The bounce-rate lines the panel must show, computed from the database the
   * gate reads — not assumed: other suites may have left outcomes of their
   * own on the seed organisation.
   */
  async function expectedBounceLines(): Promise<string[]> {
    const [r] = await sql<{ delivered: number; bounced: number }[]>`
      SELECT count(*) FILTER (WHERE event_type = 'deliver')::int AS delivered,
             count(*) FILTER (WHERE event_type = 'bounce')::int AS bounced
      FROM email_events WHERE org_id = ${orgId} AND created_at >= now() - interval '7 days'
    `;
    const attempted = r!.delivered + r!.bounced;
    const pct = (r!.bounced / attempted) * 100;
    const shown = Number.isInteger(pct)
      ? String(pct)
      : String(Math.round(pct * 100) / 100).replace('.', ',');
    return [
      `Naměřeno: ${shown} % nedoručitelných zpráv`,
      'Hranice: 5 %',
      `Vzorek: ${attempted} (minimum 100)`,
    ];
  }

  /**
   * Click a button that opens the panel, until it has. The page is server-
   * rendered: a click that lands before React has hydrated it does nothing,
   * which a cold `next start` makes likely.
   */
  async function openPanelWith(name: string, exact = false) {
    await expect(async () => {
      await page.getByRole('button', { name, exact }).click();
      await expect(page.getByTestId('pre-send-panel')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }

  /**
   * Wait until the API's per-IP budget has room. In this setup the browser and
   * the web server's own server-side fetches all reach the API from 127.0.0.1,
   * so they share one 100-per-minute bucket; a page rendered after that is
   * spent gets 429 for its data and shows "not found". Measured: the counter
   * stood at 103 after six of these tests, and the seventh page was a 404.
   * The probe costs one request; the headers say how many are left and when
   * the window resets.
   */
  async function apiBudget(needed = 40) {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const res = await fetch(`${API}/api/v1/campaigns`);
      const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? 100);
      if (remaining >= needed) return;
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? 5);
      await new Promise((r) => setTimeout(r, Math.min(Math.max(reset, 1), 61) * 1_000));
    }
  }

  test.beforeEach(async () => {
    test.setTimeout(150_000);
    await apiBudget();
  });

  /** Every POST the page makes to a campaign action, with its body. */
  function recordPosts(): Array<{ url: string; body: unknown }> {
    const seen: Array<{ url: string; body: unknown }> = [];
    page.on('request', (r: Request) => {
      if (r.method() === 'POST' && /\/api\/v1\/campaigns\/[^/]+\/(send|schedule)$/.test(r.url())) {
        const raw = r.postData();
        seen.push({ url: r.url(), body: raw ? JSON.parse(raw) : null });
      }
    });
    return seen;
  }

  test.beforeAll(async ({ browser }) => {
    // Setup plus one login on a cold server: more than the 30 s a test gets.
    test.setTimeout(120_000);
    sql = postgres(DATABASE_URL!, { max: 2, prepare: false });
    const [u] = await sql<{ org_id: string; sending_mode: string }[]>`
      SELECT u.org_id, o.sending_mode FROM users u JOIN organizations o ON o.id = u.org_id
      WHERE u.email = 'demo@acme.test'
    `;
    orgId = u!.org_id;
    originalMode = u!.sending_mode;
    // A sender set up the way a customer sets one up: production, an
    // authenticated domain, a list with someone on it.
    await sql`UPDATE organizations SET sending_mode = 'production' WHERE id = ${orgId}`;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${orgId}, ${domain}, 'fm1', true, true, true, true)
    `;
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${`e2e presend ${tag}`}) RETURNING id
    `;
    listId = l!.id;
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      VALUES (${orgId}, ${`e2e-presend-${tag}@test.local`}, 'active') RETURNING id
    `;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${c!.id}, ${listId})`;

    // One login for the whole file: the login route allows ten per window.
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('demo@acme.test');
    await page.getByLabel(/password/i).fill('Demo1234!');
    await page
      .getByRole('button', { name: /sign in|login|přihl/i })
      .first()
      .click();
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/, { timeout: 15_000 });
  });

  test.afterAll(async () => {
    if (!sql) return;
    // Leave the shared budget refilled for the suites that run after this one.
    test.setTimeout(150_000);
    await apiBudget(90);
    await context?.close();
    if (campaigns.length) {
      await sql`DELETE FROM audit_logs WHERE resource = 'campaign' AND resource_id = ANY(${campaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaigns})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${orgId} AND metadata->>'e2e' = ${tag}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${orgId} AND metadata->>'e2e' = ${tag}`;
    await sql`DELETE FROM users WHERE org_id = ${orgId} AND email = ${`e2e-editor-${tag}@test.local`}`;
    await sql`DELETE FROM contacts WHERE org_id = ${orgId} AND email = ${`e2e-presend-${tag}@test.local`}`;
    await sql`DELETE FROM lists WHERE id = ${listId}`;
    await sql`DELETE FROM sending_domains WHERE org_id = ${orgId} AND domain = ${domain}`;
    await sql`UPDATE organizations SET sending_mode = ${originalMode} WHERE id = ${orgId}`;
    await sql.end();
  });

  test('a healthy campaign: the panel says go, and Send sends — without the acknowledgement', async () => {
    await goodHistory();
    const id = await campaign('healthy');
    const posts = recordPosts();
    await page.goto(`/campaigns/${id}`);
    await openPanelWith('Send now');

    const verdict = page.getByTestId('pre-send-verdict');
    await expect(verdict).toHaveAttribute('data-verdict', 'go');
    await expect(verdict).toHaveText('Kampaň je připravená k odeslání.');
    await expect(page.getByTestId('pre-send-acknowledge')).toHaveCount(0);

    const response = page.waitForResponse((r) => r.url().endsWith(`/campaigns/${id}/send`));
    await page.getByTestId('pre-send-confirm').click();
    expect((await response).status()).toBe(200);
    console.log(`[z126] healthy: posts=${JSON.stringify(posts)} status=${await status(id)}`);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body ?? {}).not.toHaveProperty('acknowledgeDeliverabilityRisk');
    await expect.poll(() => status(id)).toBe('queueing');
  });

  test('the server refuses after the panel said go: the 422 is shown whole, criteria with numbers', async () => {
    await goodHistory();
    const id = await campaign('raced');
    await page.goto(`/campaigns/${id}`);
    await openPanelWith('Send now');
    await expect(page.getByTestId('pre-send-verdict')).toHaveAttribute('data-verdict', 'go');

    // While the panel is open, the history turns bad: 100 outcomes, 15 bounced.
    await badHistory();

    const response = page.waitForResponse((r) => r.url().endsWith(`/campaigns/${id}/send`));
    await page.getByTestId('pre-send-confirm').click();
    expect((await response).status()).toBe(422);

    const failure = page.getByTestId('send-failure');
    await expect(failure).toBeVisible();
    const text = await failure.innerText();
    console.log(`[z126] 422 shown: ${JSON.stringify(text)}`);
    expect(text).toContain('Server kampaň odmítl (422)');
    expect(text).toContain('Míra nedoručitelnosti (7 dní)');
    for (const line of await expectedBounceLines()) expect(text).toContain(line);
    expect(await status(id)).toBe('draft');
  });

  test('no-go: the button is disabled, blocking criteria listed with numbers, nothing is sent unticked', async () => {
    await badHistory();
    const id = await campaign('nogo');
    const posts = recordPosts();
    await page.goto(`/campaigns/${id}`);
    await openPanelWith('Send now');

    await expect(page.getByTestId('pre-send-verdict')).toHaveAttribute('data-verdict', 'no-go');
    await expect(page.getByTestId('pre-send-confirm')).toBeDisabled();
    const blocking = page.getByTestId('pre-send-blocking');
    const text = await blocking.innerText();
    console.log(`[z126] no-go blocking: ${JSON.stringify(text)}`);
    expect(text).toContain('Míra nedoručitelnosti (7 dní)');
    for (const line of await expectedBounceLines()) expect(text).toContain(line);
    expect(text).toContain('Co s tím:');
    await expect(blocking.getByRole('link', { name: 'Otevřít seznamy' })).toHaveAttribute(
      'href',
      '/lists',
    );

    // A forced click on the disabled button sends nothing.
    await page.getByTestId('pre-send-confirm').click({ force: true });
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
    expect(await status(id)).toBe('draft');
  });

  test('ticked: the request carries acknowledgeDeliverabilityRisk: true and the campaign is sent', async () => {
    await badHistory();
    const id = await campaign('ack');
    const posts = recordPosts();
    await page.goto(`/campaigns/${id}`);
    await openPanelWith('Send now');
    await expect(page.getByTestId('pre-send-verdict')).toHaveAttribute('data-verdict', 'no-go');

    await page.getByTestId('pre-send-acknowledge').check();
    await expect(page.getByTestId('pre-send-confirm')).toBeEnabled();
    const response = page.waitForResponse((r) => r.url().endsWith(`/campaigns/${id}/send`));
    await page.getByTestId('pre-send-confirm').click();
    expect((await response).status()).toBe(200);

    const audit = await sql<{ action: string; via: string }[]>`
      SELECT action, metadata->>'via' AS via FROM audit_logs
      WHERE resource = 'campaign' AND resource_id = ${id} ORDER BY created_at
    `;
    console.log(
      `[z126] ack: posts=${JSON.stringify(posts)} status=${await status(id)} audit=${JSON.stringify(audit)}`,
    );
    expect(posts).toEqual([
      { url: `${API}/api/v1/campaigns/${id}/send`, body: { acknowledgeDeliverabilityRisk: true } },
    ]);
    await expect.poll(() => status(id)).toBe('queueing');
    expect(audit.at(-1)).toEqual({ action: 'campaign.deliverability_override', via: 'send' });

    // The detail page shows the gate's last decision.
    await page.reload();
    const record = page.getByTestId('deliverability-record');
    await expect(record).toContainText('Odesláno přes potvrzení rizika');
    await expect(record).toContainText((await expectedBounceLines())[0]!);
  });

  test('scheduling with the acknowledgement sends the same scheduledAt the server binds it to', async () => {
    await badHistory();
    const id = await campaign('schedule');
    const posts = recordPosts();
    await page.goto(`/campaigns/${id}`);
    await expect(async () => {
      await page.getByRole('button', { name: 'Schedule for later' }).click();
      await expect(page.getByLabel('Send at')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel('Send at').fill('2999-01-01T09:00');
    await openPanelWith('Schedule', true);

    await expect(page.getByTestId('pre-send-verdict')).toHaveAttribute('data-verdict', 'no-go');
    await expect(page.getByTestId('pre-send-panel')).toContainText('Naplánováno na:');
    await expect(page.getByTestId('pre-send-confirm')).toBeDisabled();
    expect(posts).toEqual([]);

    await page.getByTestId('pre-send-acknowledge').check();
    const response = page.waitForResponse((r) => r.url().endsWith(`/campaigns/${id}/schedule`));
    await page.getByTestId('pre-send-confirm').click();
    expect((await response).status()).toBe(200);

    const [row] = await sql<{ status: string; scheduled_at: Date }[]>`
      SELECT status, scheduled_at FROM campaigns WHERE id = ${id}
    `;
    const [audit] = await sql<{ action: string; via: string; scheduled_at: string }[]>`
      SELECT action, metadata->>'via' AS via, metadata->>'scheduledAt' AS scheduled_at FROM audit_logs
      WHERE resource = 'campaign' AND resource_id = ${id} ORDER BY created_at DESC LIMIT 1
    `;
    console.log(
      `[z126] schedule: posts=${JSON.stringify(posts)} row=${JSON.stringify(row)} audit=${JSON.stringify(audit)}`,
    );
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as { scheduledAt: string; acknowledgeDeliverabilityRisk: boolean };
    expect(body.acknowledgeDeliverabilityRisk).toBe(true);
    expect(row!.status).toBe('scheduled');
    expect(row!.scheduled_at.toISOString()).toBe(body.scheduledAt);
    expect(audit).toEqual({
      action: 'campaign.deliverability_override',
      via: 'schedule',
      scheduled_at: body.scheduledAt,
    });
  });

  test('the campaign page finds its gate record among 500 newer ones of the organisation', async () => {
    await goodHistory();
    const id = await campaign('busy');
    // The campaign's own record, an hour old…
    await sql`
      INSERT INTO audit_logs (org_id, action, resource, resource_id, metadata, created_at)
      VALUES (${orgId}, 'campaign.deliverability_blocked', 'campaign', ${id},
              ${sql.json({ via: 'scheduled-dispatch', verdict: 'no-go', blocking: [], e2e: tag })},
              now() - interval '1 hour')
    `;
    // …and 250 newer ones of each of two actions for other campaigns: the old
    // card read each action's 200 newest entries of the whole organisation.
    await sql`
      INSERT INTO audit_logs (org_id, action, resource, resource_id, metadata)
      SELECT ${orgId}, a, 'campaign', gen_random_uuid()::text, ${sql.json({ e2e: tag })}
      FROM unnest(${['campaign.deliverability_blocked', 'campaign.deliverability_override']}::text[]) a,
           generate_series(1, 250)
    `;
    await page.goto(`/campaigns/${id}`);
    const record = page.getByTestId('deliverability-record');
    await expect(record).toBeVisible();
    const text = await record.innerText();
    console.log(`[z127] busy org card: ${JSON.stringify(text)}`);
    expect(text).toContain('Odeslání zablokováno');
    expect(text).toContain('plánovač v naplánovaný čas');
    expect(text).toContain('vrátila do konceptu');
  });

  test('an editor — who may send, and is not an owner — gets the panel and can send', async ({
    browser,
  }) => {
    await goodHistory();
    const email = `e2e-editor-${tag}@test.local`;
    await sql`
      INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
      SELECT ${orgId}, ${email}, 'E2E editor', password_hash, 'editor', true
      FROM users WHERE email = 'demo@acme.test'
      ON CONFLICT DO NOTHING
    `;
    const id = await campaign('editor');
    const editorContext = await browser.newContext();
    const editor = await editorContext.newPage();
    try {
      await editor.goto('/login');
      await editor.getByLabel(/email/i).fill(email);
      await editor.getByLabel(/password/i).fill('Demo1234!');
      await editor
        .getByRole('button', { name: /sign in|login|přihl/i })
        .first()
        .click();
      await expect(editor).toHaveURL(/^https?:\/\/[^/]+\/?$/, { timeout: 15_000 });

      await editor.goto(`/campaigns/${id}`);
      await expect(async () => {
        await editor.getByRole('button', { name: 'Send now' }).click();
        await expect(editor.getByTestId('pre-send-panel')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await expect(editor.getByTestId('pre-send-verdict')).toHaveAttribute('data-verdict', 'go');
      const response = editor.waitForResponse((r) => r.url().endsWith(`/campaigns/${id}/send`));
      await editor.getByTestId('pre-send-confirm').click();
      const status = (await response).status();
      const [row] = await sql<{ status: string }[]>`SELECT status FROM campaigns WHERE id = ${id}`;
      console.log(`[z127] editor: send=${status} status=${row!.status}`);
      expect(status).toBe(200);
      expect(row!.status).toBe('queueing');
    } finally {
      await editorContext.close();
    }
  });
});
