/**
 * A flow's marketing SMS follows the number's consent as the customer gives
 * and takes it by keyword — START, then STOP (Z167).
 *
 * Michal, 14. 10. 22:10, point 4: a flow's marketing SMS needs consent on the
 * number (sms_consents), as an SMS campaign does. On master the route never
 * read sms_consents for a flow (the job carries workflowRunId, not workflowId),
 * so a number that texted STOP still got the flow's marketing SMS.
 *
 * The keywords arrive by the real Twilio inbound webhook, signed with the auth
 * token (POST /api/v1/sms/webhooks/twilio/inbound → processInboundSms →
 * recordConsent / revokeConsent); the workers suite cannot sign — its API has
 * no token — so this path lives here. The SMS goes by the real POST
 * /api/v1/internal/workflow/send-sms with the job a flow's send_sms queues
 * (workflowRunId and nodeId of a run of a real stored flow). The org's route
 * names a provider that does not exist: "Unknown SMS provider" means past every
 * gate, and no SMS leaves the machine.
 *
 *   marketing      send_sms without priority on an api_event outside the list;
 *   transactional  send_sms with priority 'transactional' on
 *                  ticketing.order_paid — unchanged: no consent read at all.
 *
 * Inserted, not made by a path: the organisation, its provisioned number
 * (phone_numbers — provisioning buys a number from the provider), the contact,
 * the SMS route, the two flows and their runs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { contacts, organizations, workflowRuns, workflows } from '../db/schema/index.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { smsConsents, smsInbound, smsRoutes } from '../db/schema/sms.js';

/**
 * The webhook verifies Twilio's signature, so the token and the public base
 * must be in place before config/env.ts parses process.env at import time.
 */
const { AUTH_TOKEN, PUBLIC_BASE } = vi.hoisted(() => {
  const token = 'itest-z167-twilio-auth-token';
  const base = 'https://api.z167.invalid';
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.API_PUBLIC_URL = base;
  return { AUTH_TOKEN: token, PUBLIC_BASE: base };
});

const tag = randomUUID().slice(0, 8);
const n = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
const OUR_NUMBER = `+42059${n.slice(0, 7)}`;
const PHONE = `+4207${n}`;
const sinkProvider = `z167-stop-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const PATH = '/api/v1/sms/webhooks/twilio/inbound';

let app: FastifyInstance;
let orgId: string;
let contactId: string;
const run = { marketing: '', transactional: '' };
const report: Record<string, unknown> = { tag };

async function keyword(body: string) {
  const params: Record<string, string> = {
    MessageSid: `SM${tag}${body}`,
    From: PHONE,
    To: OUR_NUMBER,
    Body: body,
  };
  const canonical = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], `${PUBLIC_BASE}${PATH}`);
  const res = await app.inject({
    method: 'POST',
    url: PATH,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': createHmac('sha1', AUTH_TOKEN).update(canonical).digest('base64'),
    },
    payload: new URLSearchParams(params).toString(),
  });
  return `${res.statusCode} ${res.body}`;
}

/** The job a flow's send_sms queues (actions.ts executeSendSms), posted to the route. */
async function flowSms(kind: 'marketing' | 'transactional'): Promise<string> {
  const { env } = await import('../config/env.js');
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/workflow/send-sms',
    headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
    payload: {
      orgId,
      contactId,
      workflowRunId: run[kind],
      nodeId: 'send',
      phone: PHONE,
      message: kind === 'marketing' ? 'Akce' : 'Vstupenka',
    },
  });
  if (res.body.includes(SMS_REACHED)) return 'reached';
  const code = /"code":"([A-Z_]+)"/.exec(res.body)?.[1];
  return code ?? `${res.statusCode} ${res.body.slice(0, 120)}`;
}

async function consentRow() {
  const [row] = await db
    .select({
      source: smsConsents.consentSource,
      revokedAt: smsConsents.revokedAt,
      keyword: smsConsents.revokedViaKeyword,
    })
    .from(smsConsents)
    .where(and(eq(smsConsents.orgId, orgId), eq(smsConsents.phone, PHONE)));
  return row ?? null;
}

async function flowWith(eventName: string, config: Record<string, unknown>) {
  const [wf] = await db
    .insert(workflows)
    .values({
      orgId,
      name: `z167 ${eventName} ${tag}`,
      status: 'active',
      triggerType: 'api_event',
      triggerConfig: { eventName },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        { id: 'send', type: 'send_sms', config },
      ] as never,
      edges: [{ id: 'e0', source: 'trigger', target: 'send' }] as never,
    })
    .returning({ id: workflows.id });
  const [r] = await db
    .insert(workflowRuns)
    .values({ workflowId: wf!.id, orgId, contactId, status: 'running', currentNodeId: 'send' })
    .returning({ id: workflowRuns.id });
  return r!.id;
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: `z167 stop ${tag}`, slug: `z167-stop-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
  await db
    .insert(phoneNumbers)
    .values({ orgId, number: OUR_NUMBER, provider: 'twilio', status: 'active' });
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `z167-stop-${tag}@test.local`, phone: PHONE, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
  await db.insert(smsRoutes).values({
    orgId,
    countryCode: '*',
    provider: sinkProvider,
    priority: 0,
    active: true,
    config: {},
  });
  run.marketing = await flowWith(`z167-stop-${tag}`, { message: 'Akce' });
  run.transactional = await flowWith('ticketing.order_paid', {
    message: 'Vstupenka',
    priority: 'transactional',
  });

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  console.log(`Z167_STOP_JSON ${JSON.stringify(report)}`);
  if (orgId) {
    await db.delete(smsInbound).where(eq(smsInbound.orgId, orgId));
    await db.delete(smsConsents).where(eq(smsConsents.orgId, orgId));
    await db.delete(smsRoutes).where(eq(smsRoutes.orgId, orgId));
    await db.delete(workflowRuns).where(eq(workflowRuns.orgId, orgId));
    await db.delete(workflows).where(eq(workflows.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 120_000);

describe("a flow's marketing SMS follows the number's keyword consent (Z167)", () => {
  it('no consent row: the marketing SMS is blocked, the transactional one goes', async () => {
    const cell = {
      consent: await consentRow(),
      marketing: await flowSms('marketing'),
      transactional: await flowSms('transactional'),
    };
    report.none = cell;
    expect(cell.consent).toBeNull();
    expect(cell.marketing).toBe('SMS_COMPLIANCE_BLOCKED');
    expect(cell.transactional).toBe('reached');
  });

  it('START by SMS records consent: the marketing SMS goes', async () => {
    const answer = await keyword('START');
    const cell = {
      answer,
      consent: await consentRow(),
      marketing: await flowSms('marketing'),
      transactional: await flowSms('transactional'),
    };
    report.start = cell;
    expect(answer).toContain('You have been subscribed.');
    expect(cell.consent).toMatchObject({ source: 'sms_keyword', revokedAt: null });
    expect(cell.marketing).toBe('reached');
    expect(cell.transactional).toBe('reached');
  });

  it('STOP by SMS revokes it: the marketing SMS is blocked again, the transactional one goes', async () => {
    const answer = await keyword('STOP');
    const cell = {
      answer,
      consent: await consentRow(),
      marketing: await flowSms('marketing'),
      transactional: await flowSms('transactional'),
    };
    report.stop = cell;
    expect(answer).toContain('You have been unsubscribed.');
    expect(cell.consent?.keyword).toBe('STOP');
    expect(cell.consent?.revokedAt).toBeTruthy();
    expect(cell.marketing).toBe('SMS_COMPLIANCE_BLOCKED');
    expect(cell.transactional).toBe('reached');
  });
});
