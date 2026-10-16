/**
 * A direct API send of SMS, WhatsApp, web or mobile push, Viber or RCS answers
 * 403 CHANNEL_NOT_IN_LAUNCH and does nothing (Z168).
 *
 * Michal, 14. 10. 22:10, bod 5: direct API sends of SMS / WhatsApp / push
 * (/whatsapp/send, /push/send, /push/mobile/send, /messaging/send and the like)
 * are off at the API — outside the launch perimeter, and they bypass the
 * consent gates. Viber and RCS are the same class (a direct send to a number),
 * and so are the direct transactional SMS routes. Flows and campaigns keep
 * sending through their gates; email changes nowhere.
 *
 * What is real: the app (buildApp, every plugin), the caller — this file's own
 * organisation, its owner signed in by POST /auth/login, a secret key and a
 * public key minted by POST /api-keys — and every route on the way. What is a
 * mock: the providers, at the fetch boundary only — Twilio, Meta Graph,
 * Infobip (Viber), Google OAuth + FCM, and the web push endpoint. A hit there
 * is a message that would have left the machine.
 *
 *   V   every route carrying the hook × {secret key, session, no credentials}:
 *       status, code, jobs on the channel queues, rows in sms_send_log /
 *       push_send_log / rcs_messages, provider hits;
 *   M   POST /messaging/send × {email, sms, whatsapp, push, in_app};
 *   B   POST /transactional/batch, e-mail only and with an SMS-shaped item;
 *   K   controls that must not move: POST /emails, a flow's marketing SMS and
 *       a ticketing.order_paid transactional SMS (the job a flow's send_sms
 *       queues, posted to the real internal route), SMS consent, push
 *       subscription and device registration, the Twilio inbound webhook.
 *
 * The route list is not written here: it is read from the running app
 * (printRoutes with hooks). A write route on a channel path that neither
 * carries the hook nor is named below as not sending to a person fails the
 * first test — a new direct-send route cannot ship without the hook.
 *
 * Inserted, not made by a path: the organisation, its owner user (password
 * hash copied from the seed user), its verified sending domain, the contact,
 * its provisioned number (phone_numbers) and the two flows with their runs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createECDH, createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  apiKeys,
  auditLogs,
  contacts,
  emailEvents,
  mobileDevices,
  organizations,
  phoneNumbers,
  planSendCounters,
  pushSendLog,
  pushSubscriptions,
  rcsMessages,
  sendingDomains,
  smsConsents,
  smsInbound,
  smsRoutes,
  smsSendLog,
  suppressions,
  users,
  vapidKeys,
  workflowRuns,
  workflows,
} from '../db/schema/index.js';
import {
  mobilePushQueue,
  mtaOtherQueue,
  pushQueue,
  rcsQueue,
  smsQueue,
  viberQueue,
  whatsappQueue,
} from '../lib/queues.js';

/** The inbound webhook verifies Twilio's signature against these, read at import. */
const { AUTH_TOKEN, PUBLIC_BASE } = vi.hoisted(() => {
  const token = 'itest-z168-twilio-auth-token';
  const base = 'https://api.z168.invalid';
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.API_PUBLIC_URL = base;
  return { AUTH_TOKEN: token, PUBLIC_BASE: base };
});

const tag = randomUUID().slice(0, 8);
const TAG = `z168-${tag}`;
const n = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
const PHONE = `+4207${n}`;
const OUR_NUMBER = `+42059${n.slice(0, 7)}`;
const DOMAIN = `${TAG}.test`;
const FROM = `team@${DOMAIN}`;
const WEB_HOST = `push-${TAG}.example.invalid`;
/** Unauthenticated calls count against an address; this file's own. */
const ADDRESS = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
const ALL_STATES = ['waiting', 'delayed', 'prioritized', 'active', 'completed', 'failed', 'paused'];

let app: FastifyInstance;
let orgId = '';
let userId = '';
let contactId = '';
let cookie = '';
let secretKey = '';
let publicKey = '';
const runs = { marketing: '', transactional: '' };
const report: Record<string, unknown> = { tag };

// ── the provider boundary ────────────────────────────────────────────────────
const hits = { twilio: 0, meta: 0, infobip: 0, fcm: 0, web: 0 };
const realFetch = globalThis.fetch;
function stubProviders() {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const host = new URL(url).hostname;
    if (host === 'api.twilio.com') {
      hits.twilio++;
      return Response.json({ sid: `SM${tag}${hits.twilio}`, status: 'queued' }, { status: 201 });
    }
    if (host === 'graph.facebook.com') {
      hits.meta++;
      return Response.json({
        messaging_product: 'whatsapp',
        messages: [{ id: `wamid.${tag}.${hits.meta}` }],
      });
    }
    if (host === 'api.infobip.com') {
      hits.infobip++;
      return Response.json({
        messages: [{ messageId: `ib-${tag}-${hits.infobip}`, status: { groupName: 'PENDING' } }],
      });
    }
    if (host === 'oauth2.googleapis.com')
      return Response.json({ access_token: 't', expires_in: 3600 });
    if (host === 'fcm.googleapis.com') {
      hits.fcm++;
      return Response.json({ name: `projects/${TAG}/messages/${hits.fcm}` });
    }
    if (host === WEB_HOST) {
      hits.web++;
      return new Response(null, { status: 201 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

// ── what a request left behind ───────────────────────────────────────────────
const CHANNEL_QUEUES = {
  sms: smsQueue,
  'whatsapp-send': whatsappQueue,
  'push-send': pushQueue,
  'mobile-push-send': mobilePushQueue,
  'rcs-send': rcsQueue,
  'viber-send': viberQueue,
};

async function count(table: typeof smsSendLog | typeof pushSendLog | typeof rcsMessages) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.orgId, orgId));
  return r!.n;
}

async function footprint() {
  const jobs: Record<string, number> = {};
  for (const [name, q] of Object.entries(CHANNEL_QUEUES)) {
    const all = await q.getJobs(ALL_STATES as never, 0, 10_000);
    jobs[name] = all.filter((j) => j?.data?.orgId === orgId).length;
  }
  const [sends] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.eventType, 'send')));
  return {
    jobs,
    rows: {
      sms_send_log: await count(smsSendLog),
      push_send_log: await count(pushSendLog),
      rcs_messages: await count(rcsMessages),
    },
    emailSends: sends!.n,
    hits: { ...hits },
  };
}
type Footprint = Awaited<ReturnType<typeof footprint>>;

/** after − before, keeping only what moved. */
function delta(before: Footprint, after: Footprint): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (b: Record<string, unknown>, a: Record<string, unknown>, prefix: string) => {
    for (const k of Object.keys(a)) {
      const av = a[k];
      const bv = b[k];
      if (typeof av === 'number') {
        if (av !== bv) out[`${prefix}${k}`] = av - (bv as number);
      } else walk(bv as Record<string, unknown>, av as Record<string, unknown>, `${prefix}${k}.`);
    }
  };
  walk(before as never, after as never, '');
  return out;
}

type Auth = 'key' | 'session' | 'public' | 'none';
async function call(method: string, url: string, auth: Auth, payload?: unknown) {
  const headers: Record<string, string> =
    auth === 'key'
      ? { 'x-api-key': secretKey }
      : auth === 'public'
        ? { 'x-api-key': publicKey }
        : auth === 'session'
          ? { cookie }
          : {};
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers,
    remoteAddress: ADDRESS,
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  let code: string | undefined;
  try {
    code = (res.json() as { code?: string }).code;
  } catch {
    code = undefined;
  }
  return { status: res.statusCode, code, body: res.body };
}

/** One cell: the call, then everything it left behind. */
async function cell(method: string, url: string, auth: Auth, payload?: unknown) {
  const before = await footprint();
  const res = await call(method, url, auth, payload);
  // The adapters answer synchronously; give a fire-and-forget write its turn.
  await new Promise((r) => setTimeout(r, 300));
  const moved = delta(before, await footprint());
  return { status: res.status, code: res.code ?? null, moved, body: res.body.slice(0, 160) };
}

// ── the route surface, read from the app ─────────────────────────────────────
interface RouteRow {
  method: string;
  path: string;
  onRequest: string[];
}

/** Every route with its onRequest hooks, rebuilt from printRoutes' prefix tree. */
function registeredRoutes(): RouteRow[] {
  const rows: RouteRow[] = [];
  const stack: string[] = [];
  let current: RouteRow[] = [];
  for (const raw of app.printRoutes({ commonPrefix: false, includeHooks: true }).split('\n')) {
    if (!raw.trim()) continue;
    const m = /^([│\s├└─]*)(\S.*)$/.exec(raw);
    if (!m) continue;
    const hook = /^•\s+\((\w+)\)\s+(.*)$/.exec(m[2]!);
    if (hook) {
      if (hook[1] === 'onRequest') {
        const names = JSON.parse(hook[2]!) as string[];
        for (const r of current) r.onRequest = names;
      }
      continue;
    }
    const depth = Math.floor(m[1]!.length / 4);
    const parsed = /^(.*?)(?:\s+\((.+?)\))?$/.exec(m[2]!)!;
    stack.length = depth;
    stack[depth] = parsed[1]!.trim();
    const full = stack.slice(0, depth + 1).join('');
    current = [];
    if (!parsed[2]) continue;
    for (const verb of parsed[2].split(',').map((v) => v.trim())) {
      const row = { method: verb, path: full, onRequest: [] as string[] };
      rows.push(row);
      current.push(row);
    }
  }
  return rows;
}

const HOOK = 'channelNotInLaunch()';

/**
 * Write routes on a channel's path, or that send something, or that answer
 * somebody: each must carry the hook or be named here as not a direct send to
 * a person outside the organisation (Z168 sonda 1).
 */
const CHANNEL_ROUTE =
  /^\/api\/v1\/(sms|whatsapp|push|viber|rcs|telegram|messaging)(\/|$)|\/send(\/|$)|\/reply$|^\/api\/v1\/(voice\/calls\/initiate|phone\/dial)$/;

const NOT_A_DIRECT_SEND: Record<string, string> = {
  'POST /api/v1/messaging/send':
    'refuses sms, whatsapp and push in the handler, on the channel alone; email and in_app go on',
  'POST /api/v1/campaigns/:id/send':
    'a campaign: channel campaigns go through the audience and contact-state gates',
  'POST /api/v1/broadcasts/:id/send': 'Resend-compatible broadcast: an e-mail campaign',
  'POST /api/v1/commerce/invoices/:invoiceId/send': "sets the invoice's status; sends nothing",
  'POST /api/v1/commerce/quotes/:quoteId/send': "sets the quote's status; sends nothing",
  'PATCH /api/v1/rcs/messages/:id/status': 'a delivery status',
  'POST /api/v1/push/devices': 'registers a device',
  'POST /api/v1/push/subscriptions': 'registers a browser subscription',
  'POST /api/v1/push/track/click': 'records a click',
  'POST /api/v1/push/vapid-keys': 'generates the org VAPID pair',
  'POST /api/v1/sms/compliance/check': 'answers whether a send would be allowed',
  'POST /api/v1/sms/consents': 'records consent',
  'POST /api/v1/sms/inbound': 'matches a keyword and returns the reply text; sends nothing',
  'POST /api/v1/sms/keywords': 'configuration',
  'POST /api/v1/sms/routes': 'configuration',
  'PUT /api/v1/sms/routes/:id': 'configuration',
  'POST /api/v1/sms/webhooks/bulkgate/dlr': 'provider webhook (inbound)',
  'POST /api/v1/sms/webhooks/bulkgate/dlr/:routeId': 'provider webhook (inbound)',
  'POST /api/v1/sms/webhooks/twilio/inbound': 'provider webhook (inbound)',
  'POST /api/v1/sms/webhooks/twilio/status': 'provider webhook (inbound)',
  'POST /api/v1/sms/webhooks/whatsapp/inbound': 'provider webhook (inbound)',
  'POST /api/v1/viber/templates': 'a template',
  'PUT /api/v1/viber/templates/:id': 'a template',
  'POST /api/v1/whatsapp/consents': 'records consent',
  'POST /api/v1/whatsapp/phone-numbers': 'configuration',
  'POST /api/v1/whatsapp/templates': 'a template',
  'PUT /api/v1/whatsapp/templates/:id': 'a template',
  'POST /api/v1/whatsapp/templates/:id/submit': 'submits a template to Meta for approval',
  'POST /api/v1/whatsapp/flows': 'creates a Flow definition at Meta; no message',
  'POST /api/v1/whatsapp/webhooks/meta': 'provider webhook (inbound)',
  'POST /api/v1/helpdesk/inbox/:ticketId/reply':
    "records an agent's reply on a ticket; sends nothing",
  'POST /api/v1/inbox/threads/:threadId/reply':
    'a reply in an Instagram / Messenger conversation the person opened — not decided here (Z168 MIMO)',
  'POST /api/v1/voice/calls/initiate': 'a call, not a message — not decided here (Z168 MIMO)',
  'POST /api/v1/phone/dial': "an agent's call — not decided here (Z168 MIMO)",
};

/** A valid body for each disabled route: valid enough that master sends it. */
function bodyFor(key: string): { url: string; payload: Record<string, unknown> } | null {
  const recipient = { contactId, phone: PHONE };
  const wa = { phoneNumberId: `${TAG}-phone`, accessToken: `${TAG}-token` };
  const to = PHONE.replace(/^\+/, '');
  switch (key) {
    case 'POST /api/v1/push/mobile/send':
      return {
        url: '/api/v1/push/mobile/send',
        payload: { contactId, title: 'Z168', body: 'Push' },
      };
    case 'POST /api/v1/push/send':
      return { url: '/api/v1/push/send', payload: { contactId, title: 'Z168', body: 'Push' } };
    case 'POST /api/v1/whatsapp/send/media':
      return {
        url: '/api/v1/whatsapp/send/media',
        payload: {
          recipient,
          media: { type: 'image', link: 'https://example.invalid/a.png' },
          ...wa,
        },
      };
    case 'POST /api/v1/whatsapp/send/button':
      return {
        url: '/api/v1/whatsapp/send/button',
        payload: {
          recipient,
          message: { body: 'Vyberte', buttons: [{ id: 'a', title: 'Ano' }] },
          ...wa,
        },
      };
    case 'POST /api/v1/whatsapp/send/list':
      return {
        url: '/api/v1/whatsapp/send/list',
        payload: {
          recipient,
          message: {
            body: 'Nabídka',
            buttonLabel: 'Menu',
            sections: [{ title: 'S', rows: [{ id: 'r1', title: 'R1' }] }],
          },
          ...wa,
        },
      };
    case 'POST /api/v1/whatsapp/send/location':
      return {
        url: '/api/v1/whatsapp/send/location',
        payload: {
          recipient,
          location: { latitude: 50.08, longitude: 14.42, name: 'Praha' },
          ...wa,
        },
      };
    case 'POST /api/v1/whatsapp/send/catalog':
      return {
        url: '/api/v1/whatsapp/send/catalog',
        payload: {
          phoneNumberId: wa.phoneNumberId,
          to,
          bodyText: 'Katalog',
          catalogId: 'cat1',
          productRetailerId: 'sku1',
        },
      };
    case 'POST /api/v1/whatsapp/flows/:flowId/send':
      return {
        url: `/api/v1/whatsapp/flows/${TAG}-flow/send`,
        payload: { phoneNumberId: wa.phoneNumberId, to, headerText: 'H', bodyText: 'B' },
      };
    case 'POST /api/v1/viber/send':
      return { url: '/api/v1/viber/send', payload: { contactId, body: 'Viber', type: 'text' } };
    case 'POST /api/v1/rcs/messages':
      return {
        url: '/api/v1/rcs/messages',
        payload: { phone: PHONE, contactId, messageType: 'text', payload: { text: 'RCS' } },
      };
    case 'POST /api/v1/transactional/sms':
      return { url: '/api/v1/transactional/sms', payload: { to: PHONE, text: 'Kód 1234' } };
    default:
      return null;
  }
}

const DISABLED_EXPECTED = [
  'POST /api/v1/push/mobile/send',
  'POST /api/v1/push/send',
  'POST /api/v1/rcs/messages',
  'POST /api/v1/transactional/sms',
  'POST /api/v1/viber/send',
  'POST /api/v1/whatsapp/flows/:flowId/send',
  'POST /api/v1/whatsapp/send/button',
  'POST /api/v1/whatsapp/send/catalog',
  'POST /api/v1/whatsapp/send/list',
  'POST /api/v1/whatsapp/send/location',
  'POST /api/v1/whatsapp/send/media',
];

// ── the seed organisation, as this file found it ─────────────────────────────
async function seedSnapshot() {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, 'acme-demo'));
  const id = org!.id;
  const tables = {
    contacts,
    users,
    api_keys: apiKeys,
    email_events: emailEvents,
    suppressions,
    sms_consents: smsConsents,
    sms_routes: smsRoutes,
    sms_send_log: smsSendLog,
    push_send_log: pushSendLog,
    push_subscriptions: pushSubscriptions,
    mobile_devices: mobileDevices,
    vapid_keys: vapidKeys,
    rcs_messages: rcsMessages,
  } as const;
  const out: Record<string, number> = {};
  for (const [name, t] of Object.entries(tables)) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t as typeof contacts)
      .where(eq((t as typeof contacts).orgId, id));
    out[name] = r!.n;
  }
  const [h] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, id), isNotNull(suppressions.emailHash)));
  out.suppression_hash_rows = h!.n;
  const [c] = await db
    .select({ n: sql<number>`coalesce(sum(${planSendCounters.sends}), 0)::int` })
    .from(planSendCounters)
    .where(eq(planSendCounters.orgId, id));
  out.counter_sends = c!.n;
  return out;
}
let seedBefore: Record<string, number> = {};

async function flowRun(eventName: string, config: Record<string, unknown>) {
  const [wf] = await db
    .insert(workflows)
    .values({
      orgId,
      name: `${TAG} ${eventName}`,
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

/** The job a flow's send_sms queues (actions.ts executeSendSms), on the real route. */
async function flowSms(kind: 'marketing' | 'transactional') {
  const { env } = await import('../config/env.js');
  const before = await footprint();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/internal/workflow/send-sms',
    headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
    payload: {
      orgId,
      contactId,
      workflowRunId: runs[kind],
      nodeId: 'send',
      phone: PHONE,
      message: kind === 'marketing' ? 'Akce' : 'Vstupenka',
    },
  });
  return { status: res.statusCode, moved: delta(before, await footprint()) };
}

async function twilioInbound(body: string) {
  const path = '/api/v1/sms/webhooks/twilio/inbound';
  const params: Record<string, string> = {
    MessageSid: `SM${tag}in`,
    From: PHONE,
    To: OUR_NUMBER,
    Body: body,
  };
  const canonical = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], `${PUBLIC_BASE}${path}`);
  const res = await app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': createHmac('sha1', AUTH_TOKEN).update(canonical).digest('base64'),
    },
    payload: new URLSearchParams(params).toString(),
  });
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(smsInbound)
    .where(eq(smsInbound.orgId, orgId));
  return { status: res.statusCode, smsInbound: r!.n };
}

beforeAll(async () => {
  seedBefore = await seedSnapshot();
  const { createTestApp, login, SEED } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [org] = await db
    .insert(organizations)
    .values({ name: `${TAG}`, slug: TAG, plan: 'pro' })
    .returning({ id: organizations.id });
  orgId = org!.id;
  const [seedUser] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  const email = `${TAG}-owner@test.local`;
  const [u] = await db
    .insert(users)
    .values({
      orgId,
      email,
      name: `${TAG} owner`,
      passwordHash: seedUser!.hash,
      role: 'owner',
      emailVerified: true,
    })
    .returning({ id: users.id });
  userId = u!.id;
  const session = await login(app, email);
  cookie = session.cookie;

  const mint = async (body: Record<string, unknown>) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: { cookie },
      payload: body as never,
    });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { data: { rawKey: string } }).data.rawKey;
  };
  secretKey = await mint({ name: `${TAG} secret` });
  publicKey = await mint({ name: `${TAG} public`, isPublic: true });

  await db.insert(sendingDomains).values({
    orgId,
    domain: DOMAIN,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: true,
  });
  const [c] = await db
    .insert(contacts)
    .values({
      orgId,
      email: `${TAG}-c@test.local`,
      phone: PHONE,
      firstName: 'Petra',
      status: 'active',
    })
    .returning({ id: contacts.id });
  contactId = c!.id;
  await db
    .insert(phoneNumbers)
    .values({ orgId, number: OUR_NUMBER, provider: 'twilio', status: 'active' });
  runs.marketing = await flowRun(`${TAG}-promo`, { message: 'Akce' });
  runs.transactional = await flowRun('ticketing.order_paid', {
    message: 'Vstupenka',
    priority: 'transactional',
  });

  // The providers, configured the way an org configures them — and mocked.
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
    project_id: TAG,
    client_email: `${TAG}@example.iam.gserviceaccount.com`,
    private_key: rsa.privateKey.export({ format: 'pem', type: 'pkcs8' }),
  });
  process.env.WHATSAPP_PHONE_NUMBER_ID = `${TAG}-phone`;
  process.env.WHATSAPP_ACCESS_TOKEN = `${TAG}-token`;
  stubProviders();

  // K: the set-up routes are themselves controls — master and branch alike.
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const setup = {
    smsRoute: await call('POST', '/api/v1/sms/routes', 'session', {
      countryCode: '*',
      provider: 'twilio',
      priority: 1,
      config: { accountSid: `AC${tag}`, authToken: 'z168', fromNumber: '+15005550006' },
    }),
    smsConsent: await call('POST', '/api/v1/sms/consents', 'key', {
      phone: PHONE,
      contactId,
      consentSource: 'web_form',
      consentContext: TAG,
    }),
    vapid: await call('POST', '/api/v1/push/vapid-keys', 'session', {}),
    pushSubscription: await call('POST', '/api/v1/push/subscriptions', 'key', {
      endpoint: `https://${WEB_HOST}/${contactId}`,
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
      contactId,
    }),
    pushDevice: await call('POST', '/api/v1/push/devices', 'public', {
      contactId,
      platform: 'android',
      token: `tok-${TAG}`,
    }),
  };
  report.setup = Object.fromEntries(
    Object.entries(setup).map(([k, v]) => [k, `${v.status}${v.code ? ` ${v.code}` : ''}`]),
  );
}, 180_000);

afterAll(async () => {
  console.log(`Z168_JSON ${JSON.stringify(report)}`);
  globalThis.fetch = realFetch;
  delete process.env.FCM_SERVICE_ACCOUNT;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  if (orgId) {
    for (const q of [...Object.values(CHANNEL_QUEUES), mtaOtherQueue]) {
      for (const j of await q.getJobs(ALL_STATES as never, 0, 10_000)) {
        if (j?.data?.orgId === orgId) await j.remove().catch(() => {});
      }
    }
    await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
    await db.delete(smsSendLog).where(eq(smsSendLog.orgId, orgId));
    await db.delete(pushSendLog).where(eq(pushSendLog.orgId, orgId));
    await db.delete(rcsMessages).where(eq(rcsMessages.orgId, orgId));
    await db.delete(smsInbound).where(eq(smsInbound.orgId, orgId));
    await db.delete(smsConsents).where(eq(smsConsents.orgId, orgId));
    await db.delete(smsRoutes).where(eq(smsRoutes.orgId, orgId));
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.orgId, orgId));
    await db.delete(mobileDevices).where(eq(mobileDevices.orgId, orgId));
    await db.delete(vapidKeys).where(eq(vapidKeys.orgId, orgId));
    await db.delete(workflowRuns).where(eq(workflowRuns.orgId, orgId));
    await db.delete(workflows).where(eq(workflows.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, orgId));
    await db.delete(sendingDomains).where(eq(sendingDomains.orgId, orgId));
    await db.delete(planSendCounters).where(eq(planSendCounters.orgId, orgId));
    await db.delete(auditLogs).where(eq(auditLogs.orgId, orgId));
    await db.delete(apiKeys).where(eq(apiKeys.orgId, orgId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 180_000);

describe('direct API sends outside the launch perimeter answer 403 and do nothing (Z168)', () => {
  it('every write route on a channel path carries the hook, or is named as not a direct send', () => {
    const routes = registeredRoutes();
    // The measurement itself is real: the app registered its whole surface.
    expect(routes.length, 'printRoutes returned nothing').toBeGreaterThan(1000);
    for (const probe of ['POST /api/v1/emails', 'POST /api/v1/messaging/send']) {
      expect(
        routes.some((r) => `${r.method} ${r.path}` === probe),
        probe,
      ).toBe(true);
    }
    const channel = routes.filter(
      (r) => ['POST', 'PUT', 'PATCH'].includes(r.method) && CHANNEL_ROUTE.test(r.path),
    );
    const hooked = routes
      .filter((r) => r.onRequest.includes(HOOK))
      .map((r) => `${r.method} ${r.path}`);
    const unaccounted = channel
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !hooked.includes(k) && !(k in NOT_A_DIRECT_SEND));
    // Every name on the list is a route that exists, so the list cannot rot.
    const stale = Object.keys(NOT_A_DIRECT_SEND).filter(
      (k) => !routes.some((r) => `${r.method} ${r.path}` === k),
    );
    report.surface = {
      routes: routes.length,
      channelWriteRoutes: channel.length,
      hooked: [...hooked].sort(),
      notADirectSend: Object.keys(NOT_A_DIRECT_SEND).length,
      unaccounted,
      stale,
    };
    expect(unaccounted, 'a write route on a channel path without the hook').toEqual([]);
    expect(stale).toEqual([]);
    expect([...hooked].sort()).toEqual(DISABLED_EXPECTED);
    // The hook is the route's first: right after the app-wide onRequest hooks
    // (the run every route shares — the one that reads the key or session is
    // among them), before the rate limiter's, which it appends per route.
    const global: string[] = [];
    for (
      let i = 0;
      routes.every((r) => r.onRequest[i] && r.onRequest[i] === routes[0]!.onRequest[i]);
      i++
    ) {
      global.push(routes[0]!.onRequest[i]!);
    }
    const order: Record<string, string[]> = {};
    for (const r of routes.filter((x) => x.onRequest.includes(HOOK))) {
      order[`${r.method} ${r.path}`] = r.onRequest.slice(global.length);
    }
    (report.surface as Record<string, unknown>).globalOnRequest = global;
    (report.surface as Record<string, unknown>).routeOnRequest = order;
    expect(global.length, 'no app-wide onRequest hook found').toBeGreaterThan(0);
    for (const [k, own] of Object.entries(order)) {
      expect(own[0], k).toBe(HOOK);
      expect(own.length, `${k} — the rate limiter's hook follows`).toBeGreaterThan(1);
    }
  });

  it('V — each disabled route × secret key, session, no credentials: 403, nothing queued, written or sent', async () => {
    const out: Record<string, unknown> = {};
    for (const key of DISABLED_EXPECTED) {
      const b = bodyFor(key);
      expect(b, `no body for ${key}`).not.toBeNull();
      for (const auth of ['key', 'session', 'none'] as const) {
        out[`${key} × ${auth}`] = await cell('POST', b!.url, auth, b!.payload);
      }
    }
    report.V = out;
    for (const [label, v] of Object.entries(out) as [string, Awaited<ReturnType<typeof cell>>][]) {
      expect({ status: v.status, code: v.code, moved: v.moved }, label).toEqual({
        status: 403,
        code: 'CHANNEL_NOT_IN_LAUNCH',
        moved: {},
      });
    }
  }, 300_000);

  it('M — /messaging/send: sms, whatsapp and push refused; email and in_app as before', async () => {
    const payloads: Record<string, Record<string, unknown>> = {
      email: { to: `${TAG}-m@example.test`, from: FROM, subject: 'Z168', html: '<p>x</p>' },
      sms: { to: PHONE, text: 'Kód 1234' },
      whatsapp: { to: PHONE, templateName: 'hello_world' },
      push: { contactId, title: 'Z168', body: 'Push' },
      in_app: { contactId, title: 'Z168', body: 'Ahoj' },
    };
    const out: Record<string, Awaited<ReturnType<typeof cell>>> = {};
    for (const auth of ['key', 'session'] as const) {
      for (const [channel, payload] of Object.entries(payloads)) {
        out[`${channel} × ${auth}`] = await cell('POST', '/api/v1/messaging/send', auth, {
          channel,
          payload,
        });
      }
    }
    report.M = out;
    for (const auth of ['key', 'session']) {
      for (const channel of ['sms', 'whatsapp', 'push']) {
        const v = out[`${channel} × ${auth}`]!;
        expect({ status: v.status, code: v.code, moved: v.moved }, `${channel} × ${auth}`).toEqual({
          status: 403,
          code: 'CHANNEL_NOT_IN_LAUNCH',
          moved: {},
        });
      }
      const email = out[`email × ${auth}`]!;
      expect(email.status, email.body).toBe(202);
      expect(email.moved.emailSends, email.body).toBe(1);
      expect(out[`in_app × ${auth}`]!.status).toBe(501);
    }
  }, 120_000);

  it('B — /transactional/batch takes e-mail recipients only; an SMS-shaped item fails the whole batch', async () => {
    const base = { from: FROM, subject: 'Z168', html: '<p>x</p>' };
    const out = {
      emailOnly: await cell('POST', '/api/v1/transactional/batch', 'key', {
        ...base,
        recipients: [{ to: `${TAG}-b1@example.test` }],
      }),
      withSms: await cell('POST', '/api/v1/transactional/batch', 'key', {
        ...base,
        recipients: [{ to: `${TAG}-b2@example.test` }, { to: PHONE, channel: 'sms' }],
      }),
    };
    report.B = out;
    expect(out.emailOnly.status, out.emailOnly.body).toBe(202);
    expect(out.emailOnly.moved.emailSends).toBe(1);
    expect(out.withSms.status).toBe(400);
    expect(out.withSms.code).toBe('VALIDATION_ERROR');
    expect(out.withSms.moved).toEqual({});
  });

  it('K — e-mail, a flow SMS, consent, push registration and the inbound webhook do not move', async () => {
    const emails = await cell('POST', '/api/v1/emails', 'key', {
      from: FROM,
      to: `${TAG}-e@example.test`,
      subject: 'Z168',
      html: '<p>x</p>',
    });
    const out = {
      setup: report.setup,
      emails,
      flowMarketingSms: await flowSms('marketing'),
      flowTransactionalSms: await flowSms('transactional'),
      inbound: await twilioInbound('Ahoj'),
    };
    report.K = out;
    expect(report.setup).toEqual({
      smsRoute: '201',
      smsConsent: '201',
      vapid: '201',
      pushSubscription: '201',
      pushDevice: '201',
    });
    expect(emails.status, emails.body).toBeLessThan(300);
    expect(emails.moved.emailSends).toBe(1);
    // A flow's SMS reaches the provider: the gates it passes are unchanged.
    for (const k of ['flowMarketingSms', 'flowTransactionalSms'] as const) {
      expect(out[k].status, k).toBe(200);
      expect(out[k].moved['hits.twilio'], k).toBe(1);
      expect(out[k].moved['rows.sms_send_log'], k).toBe(1);
    }
    expect(out.inbound).toEqual({ status: 200, smsInbound: 1 });
  });

  it('the seed organisation is as this file found it', async () => {
    const after = await seedSnapshot();
    report.seed = { before: seedBefore, after };
    expect(after).toEqual(seedBefore);
    expect(after.suppressions).toBe(0);
    expect(after.suppression_hash_rows).toBe(0);
  });
});
