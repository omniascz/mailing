/**
 * Merge-tag validation, through the real HTTP layer into real Postgres.
 *
 * The unit tests prove validateMergeTags classifies a token correctly. What
 * they cannot prove is that a customer ever sees it — the key set is built
 * from the `contacts` columns and the org's custom_field_definitions rows, and
 * the warning has to survive the route's response shape. Both of those are
 * only real against a database.
 *
 * Covers points 14 of the task: saving a campaign with a typo returns a
 * warning, and the pre-send panel catches the same campaign.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login } from './setup/harness.js';

interface Warning {
  kind: string;
  token: string;
  message: string;
  suggestion?: string;
}
interface CampaignResponse {
  data: { id: string };
  warnings?: Warning[];
}
interface Check {
  id: string;
  severity: string;
  title: string;
  detail?: string;
}

describe('merge-tag validation (authenticated, real DB)', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
    cookie = (await login(app)).cookie;
  });

  async function createCampaign(subject: string, html: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { cookie },
      payload: {
        name: `merge-tag-validation ${subject}`,
        subject,
        fromEmail: 'demo@acme.test',
        content: { html },
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as CampaignResponse;
  }

  it('warns on a misspelt contact field but still saves the campaign', async () => {
    const body = await createCampaign('Ahoj {{contact.frist_name}}!', '<p>Vítejte</p>');

    // Saved — the warning must not cost the customer their draft.
    expect(body.data.id).toBeTruthy();

    const w = body.warnings ?? [];
    expect(w.map((x) => x.token)).toContain('contact.frist_name');
    const tag = w.find((x) => x.token === 'contact.frist_name')!;
    expect(tag.kind).toBe('unknown_tag');
    expect(tag.suggestion).toBe('contact.first_name');
    expect(tag.message).toContain('vyrenderuje jako prázdný text');
  });

  it('warns on a misspelt filter in the body', async () => {
    const body = await createCampaign(
      'Vítejte',
      '<p>Dobrý den {{contact.first_name | vokativ}},</p>',
    );
    const w = body.warnings ?? [];
    const filter = w.find((x) => x.kind === 'unknown_filter');
    expect(filter?.token).toBe('vokativ');
    expect(filter?.suggestion).toBe('vocative');
  });

  it('stays silent on a template that resolves', async () => {
    const body = await createCampaign(
      'Vítejte v {{company_name}}',
      '<p>Dobrý den {{contact.first_name}},</p>' +
        '<p><a href="{{unsubscribe_url}}">Odhlásit</a></p>' +
        '{% if contact.last_name %}<p>{{contact.last_name}}</p>{% endif %}',
    );
    expect(body.warnings).toBeUndefined();
  });

  it('stays silent on namespaces it cannot verify', async () => {
    // product.* / order.* are real in the workflow templates and are filled
    // from ctx.data at run time. Warning here would be a false positive.
    const body = await createCampaign('{{product.name}}', '<p>{{order.total}} {{promo_code}}</p>');
    expect(body.warnings).toBeUndefined();
  });

  it('surfaces the same typo as the 15th pre-send check', async () => {
    const created = await createCampaign('Ahoj {{contact.frist_name}}!', '<p>x</p>');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${created.data.id}/pre-send-checks`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);

    const checks = (res.json() as { data: { checks: Check[] } }).data.checks;
    const check = checks.find((c) => c.id === 'merge-tags');
    expect(check, 'merge-tags check missing from the panel').toBeTruthy();
    expect(check!.severity).toBe('warn');
    expect(check!.detail).toContain('contact.frist_name');
  });

  it('passes the pre-send check when every tag resolves', async () => {
    const created = await createCampaign('Vítejte', '<p>{{contact.first_name}}</p>');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${created.data.id}/pre-send-checks`,
      headers: { cookie },
    });
    const checks = (res.json() as { data: { checks: Check[] } }).data.checks;
    expect(checks.find((c) => c.id === 'merge-tags')?.severity).toBe('pass');
  });
});
