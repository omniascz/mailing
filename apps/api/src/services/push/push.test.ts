/**
 * Web Push adapter + in-app messaging tests (tasks 7.10–7.11).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateVapidKeyPair, WebPushAdapter } from '../../channels/push/web-push-adapter.js';
import { getMatchingMessages, checkFrequency } from '../in-app/index.js';
import type { InAppTargetingRule } from '../../db/schema/in-app.js';

// ─── Mock DB (vi.hoisted so factory has access) ───────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
  return { mockDb: db };
});

vi.mock('../../db/client.js', () => ({ db: mockDb }));

function resetChain(limitValue: unknown[] = []) {
  for (const fn of Object.values(mockDb) as ReturnType<typeof vi.fn>[]) {
    fn.mockReset();
    fn.mockReturnValue(mockDb);
  }
  // Only terminal methods return Promises; all chain methods return mockDb
  mockDb.limit.mockResolvedValue(limitValue);
  mockDb.returning.mockResolvedValue(limitValue);
}

beforeEach(() => resetChain());

// ─── VAPID key generation ─────────────────────────────────────────────────────

describe('generateVapidKeyPair', () => {
  it('generates base64url-encoded keys', async () => {
    const { publicKey, privateKey } = await generateVapidKeyPair();
    expect(typeof publicKey).toBe('string');
    expect(typeof privateKey).toBe('string');
    expect(publicKey.length).toBeGreaterThan(40);
    expect(publicKey).not.toMatch(/[+/=]/);
    expect(privateKey).not.toMatch(/[+/=]/);
  });

  it('generates different keys each call', async () => {
    const kp1 = await generateVapidKeyPair();
    const kp2 = await generateVapidKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  it('public key is 87 chars (uncompressed P-256 = 65 bytes)', async () => {
    const { publicKey } = await generateVapidKeyPair();
    expect(publicKey.length).toBe(87);
  });
});

// ─── WebPushAdapter ───────────────────────────────────────────────────────────

describe('WebPushAdapter', () => {
  let adapter: WebPushAdapter;

  beforeEach(async () => {
    const keys = await generateVapidKeyPair();
    adapter = new WebPushAdapter({
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: keys.privateKey,
      vapidSubject: 'mailto:test@forgemsg.com',
    });
    resetChain();
  });

  it('channel is push and provider is web-push', () => {
    expect(adapter.channel).toBe('push');
    expect(adapter.provider).toBe('web-push');
  });

  it('throws WRONG_CONTENT for non-push message', async () => {
    await expect(
      adapter.send(
        { channel: 'sms', content: { kind: 'sms', body: 'x' }, orgId: 'o1' },
        { contactId: 'c1' },
      ),
    ).rejects.toMatchObject({ code: 'WRONG_CONTENT' });
  });

  it('throws NO_SUBSCRIPTION when contact has no active subscription', async () => {
    mockDb.limit.mockResolvedValue([]);

    await expect(
      adapter.send(
        { channel: 'push', content: { kind: 'push', title: 'Hi', body: 'Test' }, orgId: 'o1' },
        { contactId: 'c1' },
      ),
    ).rejects.toMatchObject({ code: 'NO_SUBSCRIPTION' });
  });

  it('estimateCost returns zero (push is free)', async () => {
    const est = await adapter.estimateCost(
      { channel: 'push', content: { kind: 'push', title: 'T', body: 'B' }, orgId: 'o1' },
      [{ contactId: 'c1' }, { contactId: 'c2' }],
    );
    expect(est.totalCost).toBe(0);
    expect(est.currency).toBe('USD');
    expect(est.recipientCount).toBe(2);
  });

  it('validateTemplate fails with empty title', async () => {
    const bad = await adapter.validateTemplate({
      id: 't1',
      channel: 'push',
      content: { title: '', body: 'body' },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('validateTemplate fails with empty body', async () => {
    const bad = await adapter.validateTemplate({
      id: 't1',
      channel: 'push',
      content: { title: 'Title', body: '' },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.field === 'body')).toBe(true);
  });

  it('validateTemplate passes with title + body', async () => {
    const good = await adapter.validateTemplate({
      id: 't1',
      channel: 'push',
      content: { title: 'Hey!', body: 'Check this' },
    });
    expect(good.valid).toBe(true);
  });

  it('handleInbound parses SW click event', async () => {
    const inbound = await adapter.handleInbound({
      messageId: 'log-001',
      contactId: 'c1',
      url: '/promo',
      action: 'click',
    });
    expect(inbound.channel).toBe('push');
    expect(inbound.content).toBe('click');
    expect(inbound.providerMessageId).toBe('log-001');
  });

  it('getChannelLimits shows high throughput', () => {
    const limits = adapter.getChannelLimits();
    expect(limits.maxPerSecond).toBe(500);
    expect(limits.maxPerDay).toBe(5_000_000);
  });

  it('getStatus reads status from send log', async () => {
    mockDb.limit.mockResolvedValue([
      {
        id: 'log-001',
        status: 'sent',
        sentAt: new Date(),
        clickedAt: null,
      },
    ]);

    const status = await adapter.getStatus('log-001');
    expect(status.status).toBe('sent');
    expect(status.messageId).toBe('log-001');
  });
});

// ─── In-app targeting engine ──────────────────────────────────────────────────

describe('getMatchingMessages — targeting', () => {
  it('returns messages matching page_url contains rule', async () => {
    const future = new Date(Date.now() + 60_000);
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg1',
        active: true,
        startAt: null,
        endAt: future,
        targetingRules: [
          { type: 'page_url', operator: 'contains', value: '/pricing' },
        ] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const msgs = await getMatchingMessages('org1', {
      sessionId: 'sess-1',
      pageUrl: 'https://app.forgemsg.com/pricing?tab=annual',
    });
    expect(msgs).toHaveLength(1);
  });

  it('filters out message when page_url:is does not match', async () => {
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg1',
        active: true,
        startAt: null,
        endAt: null,
        targetingRules: [
          { type: 'page_url', operator: 'is', value: '/checkout' },
        ] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const msgs = await getMatchingMessages('org1', {
      sessionId: 'sess-1',
      pageUrl: '/pricing',
    });
    expect(msgs).toHaveLength(0);
  });

  it('filters out messages past endAt', async () => {
    const past = new Date(Date.now() - 10_000);
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg-old',
        active: true,
        startAt: null,
        endAt: past,
        targetingRules: [] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const msgs = await getMatchingMessages('org1', { sessionId: 'sess-1' });
    expect(msgs).toHaveLength(0);
  });

  it('filters out messages before startAt (not started yet)', async () => {
    const future = new Date(Date.now() + 86_400_000);
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg-future',
        active: true,
        startAt: future,
        endAt: null,
        targetingRules: [] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const msgs = await getMatchingMessages('org1', { sessionId: 'sess-1' });
    expect(msgs).toHaveLength(0);
  });

  it('shows message with empty rules (broadcast)', async () => {
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg-all',
        active: true,
        startAt: null,
        endAt: null,
        targetingRules: [] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const msgs = await getMatchingMessages('org1', { sessionId: 'sess-1', pageUrl: '/any-page' });
    expect(msgs).toHaveLength(1);
  });

  it('matches page_url starts_with rule', async () => {
    mockDb.limit.mockResolvedValue([
      {
        id: 'msg-app',
        active: true,
        startAt: null,
        endAt: null,
        targetingRules: [
          { type: 'page_url', operator: 'starts_with', value: '/app/' },
        ] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const match = await getMatchingMessages('org1', { sessionId: 's', pageUrl: '/app/dashboard' });
    expect(match).toHaveLength(1);

    mockDb.limit.mockResolvedValue([
      {
        id: 'msg-app',
        active: true,
        startAt: null,
        endAt: null,
        targetingRules: [
          { type: 'page_url', operator: 'starts_with', value: '/app/' },
        ] as InAppTargetingRule[],
        maxPerSession: 1,
        maxTotal: 0,
      },
    ]);

    const noMatch = await getMatchingMessages('org1', {
      sessionId: 's',
      pageUrl: '/marketing/home',
    });
    expect(noMatch).toHaveLength(0);
  });
});

// ─── Frequency capping ────────────────────────────────────────────────────────

describe('checkFrequency', () => {
  it('allows send when no prior impressions (count=0)', async () => {
    mockDb.limit.mockResolvedValue([{ count: 0 }]);
    const ok = await checkFrequency('msg1', 'sess1', 'c1', 1, 0);
    expect(ok).toBe(true);
  });

  it('blocks when session count >= maxPerSession', async () => {
    mockDb.limit.mockResolvedValue([{ count: 1 }]);
    const ok = await checkFrequency('msg1', 'sess1', 'c1', 1, 0);
    expect(ok).toBe(false);
  });

  it('allows when maxPerSession=0 (unlimited session shows)', async () => {
    mockDb.limit.mockResolvedValue([{ count: 999 }]);
    const ok = await checkFrequency('msg1', 'sess1', 'c1', 0, 0);
    expect(ok).toBe(true);
  });

  it('blocks when total contact shows >= maxTotal', async () => {
    // maxPerSession=0 → session check skipped; only total check runs
    mockDb.limit.mockResolvedValue([{ count: 5 }]);

    const ok = await checkFrequency('msg1', 'sess1', 'c1', 0, 5);
    expect(ok).toBe(false);
  });

  it('skips total check when no contactId', async () => {
    mockDb.limit.mockResolvedValue([{ count: 0 }]);
    const ok = await checkFrequency('msg1', 'sess1', undefined, 1, 5);
    expect(ok).toBe(true);
  });
});
