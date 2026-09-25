/**
 * A push click is recorded for the notification that was actually sent.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `POST /api/v1/push/track/click` had no guard of any kind and did:
 *
 *     .update(pushSendLog).set({ clickedAt: new Date() })
 *     .where(eq(pushSendLog.id, messageId))     // messageId straight from the body
 *
 * so one curl marked any tenant's notification as clicked. That is not a
 * cosmetic column: `clicked_at` is what channel scoring counts as push
 * engagement (services/channel-scoring/index.ts:381) and what the engagement
 * score counts as a click (services/engagement-score/index.ts:283), so a forged
 * request arrives in somebody else's account as "push works for this contact"
 * and steers which channel we pick for them next.
 *
 * ─── Why a signed token and not a session ────────────────────────────────────
 *
 * The caller is a service worker, which has no session and never will. The repo
 * already answers this exact question for poll votes and unsubscribes — a token
 * signed with the tracking secret, verified with `verifyTrackingToken`, no login
 * (routes/v1/polls.ts:6 says it in so many words: one mechanism decides whether
 * a link is authentic). A push click carries the same kind of claim, so it gets
 * the same treatment rather than a second mechanism.
 *
 * ─── Nothing already sent could track a click anyway ─────────────────────────
 *
 * The notification payload carried contactId, orgId and campaignId, but never
 * the `push_send_log` id — that was minted after the payload was built. So no
 * notification ever delivered could tell the route which row it was, and putting
 * the token in the payload cannot break anything that worked.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over rows, field by field, not over status codes: the defect was an UPDATE, so
 * org B's log row is read back and compared with what it was. And because a
 * refusal alone would also be satisfied by an endpoint that had simply stopped
 * working, the case that must pass drives the real send path — the adapter
 * builds a real notification payload, the token is taken out of it, and the
 * click is posted with no credentials at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTrackingToken, verifyTrackingToken } from '@forgemsg/shared';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';
import { pushSendLog, pushSubscriptions } from '../db/schema/push.js';
import { WebPushAdapter } from '../channels/push/web-push-adapter.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let contactA: string;
/** Org B's notification — the row a forged click must not touch. */
let bMessageId: string;

const CLICK_URL = '/api/v1/push/track/click';

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.106.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `push-${tag}@example.test`,
      password: 'PushTenant1234!',
      name: 'Push Tenant',
      orgName: `Push Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const id = (res.json() as { user?: { orgId?: string } }).user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

const logRow = (id: string) => db.select().from(pushSendLog).where(eq(pushSendLog.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  const [cA] = await db
    .insert(contacts)
    .values({
      orgId: orgA,
      email: `push-subject-${randomUUID().slice(0, 8)}@tenant.test`,
      firstName: 'Push',
      lastName: 'Subject',
    })
    .returning({ id: contacts.id });
  contactA = cA!.id;

  // Org A's contact has a live subscription, so the adapter has somewhere to
  // send. The endpoint is never contacted — delivery is stubbed below.
  await db.insert(pushSubscriptions).values({
    orgId: orgA,
    contactId: contactA,
    endpoint: `https://push.example.invalid/${randomUUID()}`,
    p256dh:
      'BExampleP256dhKeyForTestsOnly0000000000000000000000000000000000000000000000000000000000',
    auth: 'ExampleAuthSecret00000',
    active: true,
  });

  // Org B's notification, sent and not yet clicked.
  const [bRow] = await db
    .insert(pushSendLog)
    .values({
      orgId: orgB,
      title: 'Org B only',
      body: 'Belongs to the other tenant',
      status: 'sent',
      sentAt: new Date('2026-02-03T04:05:06Z'),
    })
    .returning({ id: pushSendLog.id });
  bMessageId = bRow!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('a push click cannot be reported for another org’s notification', () => {
  it('refuses an unsigned click and leaves org B’s row exactly as it was', async () => {
    const before = (await logRow(bMessageId))[0];
    expect(before, 'fixture missing: org B has no send-log row').toBeDefined();
    expect(before!.clickedAt, 'fixture is already clicked').toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: CLICK_URL,
      payload: { messageId: bMessageId, contactId: contactA },
    });

    // The row first, because the row is the defect. A status assertion ahead of
    // it would report "expected 204 to be 400" and say nothing about what was
    // written.
    expect(
      (await logRow(bMessageId))[0],
      "org B's notification was marked as clicked by an unauthenticated request — the route took " +
        'messageId from the body and updated push_send_log by id with no org filter',
    ).toEqual(before);

    // Secondary: the refusal has to be an answer, not a crash.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(400);
  }, 120_000);

  it('refuses a validly signed token that names another org’s message', async () => {
    const before = (await logRow(bMessageId))[0];

    // A real signature, minted for org A, pointing at org B's row. This is the
    // case an org filter has to catch and a signature alone cannot.
    const forged = createTrackingToken({
      type: 'pushclick',
      orgId: orgA,
      messageId: bMessageId,
      contactId: contactA,
      ts: Math.floor(Date.now() / 1000),
    });

    // The body names the row too, exactly as a service worker would, so this is
    // also the case the old route answered by updating it.
    const res = await app.inject({
      method: 'POST',
      url: CLICK_URL,
      payload: { token: forged, messageId: bMessageId },
    });
    expect(res.statusCode).toBe(204);

    expect(
      (await logRow(bMessageId))[0],
      "a token signed for org A moved org B's clicked_at — the update is not scoped by the org " +
        'inside the signature',
    ).toEqual(before);
  }, 120_000);

  it('records a real click from a real notification, with no credentials at all', async () => {
    // The whole path, not a hand-made token: the adapter builds the payload it
    // would encrypt for the browser, and the token is read out of it.
    const adapter = new WebPushAdapter({
      vapidPublicKey:
        'BTestVapidPublicKey0000000000000000000000000000000000000000000000000000000000000000000',
      vapidPrivateKey: 'TestVapidPrivateKey000000000000000000000000',
      vapidSubject: 'mailto:push@example.invalid',
    });

    let deliveredPayload = '';
    // @ts-expect-error — replacing a private method is the point: the endpoint in
    // the fixture is not a real push service, and what is under test is the
    // payload we would have sent, not the encryption of it.
    adapter.deliverToEndpoint = async (
      _endpoint: string,
      _p256dh: string,
      _auth: string,
      payload: string,
    ) => {
      deliveredPayload = payload;
    };

    const result = await adapter.send(
      {
        id: randomUUID(),
        orgId: orgA,
        channel: 'push',
        content: { kind: 'push', title: 'Real one', body: 'Tap me', url: '/promo' },
      } as unknown as Parameters<WebPushAdapter['send']>[0],
      { contactId: contactA } as unknown as Parameters<WebPushAdapter['send']>[1],
    );

    const data = (JSON.parse(deliveredPayload) as { data?: { clickToken?: string } }).data;
    expect(data?.clickToken, 'the notification carries no click token').toBeTruthy();

    const decoded = verifyTrackingToken(data!.clickToken!);
    expect(decoded?.type).toBe('pushclick');
    expect(decoded && 'messageId' in decoded ? decoded.messageId : null).toBe(result.messageId);

    // A service worker has no session — this request sends nothing else.
    const res = await app.inject({
      method: 'POST',
      url: CLICK_URL,
      payload: { token: data!.clickToken, messageId: result.messageId },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(204);

    const [row] = await logRow(result.messageId);
    expect(row, 'the send did not write a log row').toBeDefined();
    expect(row!.orgId).toBe(orgA);
    expect(row!.clickedAt, 'a legitimate click was not recorded').toBeInstanceOf(Date);
    expect(row!.title).toBe('Real one');
  }, 120_000);
});

describe('negative control — the tracking that already worked still works', () => {
  it('takes the same click twice without damaging the row', async () => {
    const [own] = await db
      .insert(pushSendLog)
      .values({
        orgId: orgA,
        contactId: contactA,
        title: 'Twice',
        body: 'Clicked twice',
        status: 'sent',
        sentAt: new Date(),
      })
      .returning({ id: pushSendLog.id });

    const token = createTrackingToken({
      type: 'pushclick',
      orgId: orgA,
      messageId: own!.id,
      contactId: contactA,
      ts: Math.floor(Date.now() / 1000),
    });

    const first = await app.inject({ method: 'POST', url: CLICK_URL, payload: { token } });
    expect(first.statusCode).toBe(204);
    const afterFirst = (await logRow(own!.id))[0]!;
    expect(afterFirst.clickedAt).toBeInstanceOf(Date);

    const second = await app.inject({ method: 'POST', url: CLICK_URL, payload: { token } });
    expect(second.statusCode).toBe(204);

    const rows = await db.select().from(pushSendLog).where(eq(pushSendLog.id, own!.id));
    expect(rows.length, 'the second click duplicated the row').toBe(1);
    const afterSecond = rows[0]!;
    expect(afterSecond.clickedAt).toBeInstanceOf(Date);
    expect(afterSecond.status).toBe(afterFirst.status);
    expect(afterSecond.title).toBe('Twice');
    expect(afterSecond.body).toBe('Clicked twice');
  }, 120_000);

  it('a token naming a message that no longer exists is accepted and changes nothing', async () => {
    const gone = randomUUID();
    const token = createTrackingToken({
      type: 'pushclick',
      orgId: orgA,
      messageId: gone,
      contactId: contactA,
      ts: Math.floor(Date.now() / 1000),
    });

    // 204, deliberately: a token we signed is authentic even when the row is
    // gone, and answering differently would make this a way to ask which ids
    // exist.
    const res = await app.inject({ method: 'POST', url: CLICK_URL, payload: { token } });
    expect(res.statusCode).toBe(204);
    expect((await logRow(gone)).length).toBe(0);
  }, 120_000);

  it('email tracking tokens are untouched — they still verify as their own types', async () => {
    const click = createTrackingToken({
      type: 'click',
      orgId: orgA,
      campaignId: randomUUID(),
      contactId: contactA,
      url: 'https://example.invalid/landing',
      ts: Math.floor(Date.now() / 1000),
    });
    const unsub = createTrackingToken({
      type: 'unsub',
      orgId: orgA,
      contactId: contactA,
      ts: Math.floor(Date.now() / 1000),
    });

    expect(verifyTrackingToken(click)?.type).toBe('click');
    expect(verifyTrackingToken(unsub)?.type).toBe('unsub');

    // And a push token is not accepted anywhere an email token is expected —
    // the discriminator is what keeps one from being replayed as the other.
    const push = createTrackingToken({
      type: 'pushclick',
      orgId: orgA,
      messageId: randomUUID(),
      ts: Math.floor(Date.now() / 1000),
    });
    expect(verifyTrackingToken(push)?.type).toBe('pushclick');
  }, 120_000);

  it('the email click route still answers on a real token', async () => {
    const token = createTrackingToken({
      type: 'click',
      orgId: orgA,
      campaignId: randomUUID(),
      contactId: contactA,
      url: 'https://example.invalid/landing',
      ts: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({ method: 'GET', url: `/track/c/${token}` });
    // A redirect to the destination is what this route does; what matters here
    // is that it still resolves the token rather than refusing it.
    expect([301, 302, 303, 307, 308]).toContain(res.statusCode);
    expect(res.headers.location).toBe('https://example.invalid/landing');
  }, 120_000);
});
