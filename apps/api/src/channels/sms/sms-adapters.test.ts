/**
 * Tests for SMS channel adapters + routing + compliance (tasks 7.1–7.5).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BulkgateSmsAdapter } from './bulkgate-adapter.js';
import { TwilioSmsAdapter } from './twilio-adapter.js';
import { checkTcpaQuietHours, appendOptOutText } from '../../services/sms/compliance.js';
import { phoneToCountry } from '../../services/sms/routing.js';
import type { UnifiedMessage, Recipient } from '@forgemsg/shared';
/**
 * vitest reuses a forked worker across test files, so a replaced global.fetch
 * outlives this one unless it is put back. A leaked stub is worse than a leaked
 * env var: the next file's real network call silently gets this file's canned
 * response.
 */
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockRecipient: Recipient = {
  contactId: 'c1',
  phone: '+12025550100',
};

const mockSmsMessage: UnifiedMessage = {
  channel: 'sms',
  content: { kind: 'sms', body: 'Hello from ForgeMsg!' },
  orgId: 'org1',
};

// ─── Bulkgate adapter ─────────────────────────────────────────────────────────

describe('BulkgateSmsAdapter', () => {
  let adapter: BulkgateSmsAdapter;

  beforeEach(() => {
    adapter = new BulkgateSmsAdapter({
      applicationId: 'app123',
      applicationToken: 'token456',
    });
    vi.restoreAllMocks();
  });

  it('sends SMS successfully', async () => {
    const responseBody = JSON.stringify({
      data: { status: 'accepted', sms_id: 'bg-msg-001', price: '0.0350', currency: 'EUR' },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => responseBody,
      json: async () => JSON.parse(responseBody),
    } as unknown as Response);

    const result = await adapter.send(mockSmsMessage, mockRecipient);

    expect(result.messageId).toBe('bg-msg-001');
    expect(result.status).toBe('sent');
    expect(result.cost).toBeCloseTo(0.035);
    expect(result.provider).toBe('bulkgate');
  });

  it('throws on API error with error_code mapping', async () => {
    const errorBody = JSON.stringify({
      data: { status: 'error', error_code: 14, error: 'Number is blacklisted' },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => errorBody,
      json: async () => JSON.parse(errorBody),
    } as unknown as Response);

    await expect(adapter.send(mockSmsMessage, mockRecipient)).rejects.toMatchObject({
      code: 'BLACKLISTED',
      retryable: false,
    });
  });

  it('throws ChannelAdapterError on HTTP 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as unknown as Response);

    await expect(adapter.send(mockSmsMessage, mockRecipient)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('rejects non-sms content', async () => {
    const msg: UnifiedMessage = {
      channel: 'whatsapp',
      content: { kind: 'whatsapp', templateId: 'x', parameters: {} },
      orgId: 'org1',
    };

    await expect(adapter.send(msg, mockRecipient)).rejects.toMatchObject({
      code: 'WRONG_CONTENT',
    });
  });

  it('estimateCost returns EUR cost', async () => {
    const est = await adapter.estimateCost(mockSmsMessage, [mockRecipient]);

    expect(est.currency).toBe('EUR');
    expect(est.perRecipientCost).toBe(0.035);
    expect(est.recipientCount).toBe(1);
  });

  it('validates template — empty body is error', async () => {
    const result = await adapter.validateTemplate({
      id: 't1',
      channel: 'sms',
      content: { body: '' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('body');
  });

  it('validates template — long body warns about segments', async () => {
    const longBody = 'A'.repeat(500); // 4 segments
    const result = await adapter.validateTemplate({
      id: 't1',
      channel: 'sms',
      content: { body: longBody },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings?.[0]?.field).toBe('body');
  });

  it('getStatus returns stub with note', async () => {
    const status = await adapter.getStatus('bg-msg-001');

    expect(status.status).toBe('sent');
    expect(status.metadata?.note).toMatch(/DLR webhook/);
  });

  it('handleInbound parses DLR payload', async () => {
    const dlr = {
      sms_id: 'bg-001',
      number: '12025550100',
      status: 'delivered',
      time: '2026-04-12T10:00:00Z',
    };
    const inbound = await adapter.handleInbound(dlr);

    expect(inbound.channel).toBe('sms');
    expect(inbound.providerMessageId).toBe('bg-001');
    expect(inbound.content).toBe('delivered');
  });

  it('getChannelLimits returns expected values', () => {
    const limits = adapter.getChannelLimits();
    expect(limits.maxPerSecond).toBe(50);
    expect(limits.maxPerDay).toBe(500_000);
  });
});

// ─── Twilio adapter ───────────────────────────────────────────────────────────

describe('TwilioSmsAdapter', () => {
  let adapter: TwilioSmsAdapter;

  beforeEach(() => {
    adapter = new TwilioSmsAdapter({
      accountSid: 'ACxxxx',
      authToken: 'authtoken',
      fromNumber: '+19995551234',
    });
    vi.restoreAllMocks();
  });

  it('sends SMS successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sid: 'SM001',
        status: 'queued',
        price: '-0.0075',
        price_unit: 'USD',
        error_code: null,
      }),
    } as unknown as Response);

    const result = await adapter.send(mockSmsMessage, mockRecipient);

    expect(result.messageId).toBe('SM001');
    expect(result.status).toBe('queued');
    expect(result.cost).toBeCloseTo(0.0075);
    expect(result.provider).toBe('twilio');
  });

  it('throws on Twilio error 21611 (BLACKLISTED)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        code: 21610,
        message: 'Message blocked',
        status: 400,
      }),
    } as unknown as Response);

    await expect(adapter.send(mockSmsMessage, mockRecipient)).rejects.toMatchObject({
      code: 'BLACKLISTED',
      retryable: false,
    });
  });

  it('getStatus fetches from Twilio API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sid: 'SM001',
        status: 'delivered',
        error_code: null,
        error_message: null,
      }),
    } as unknown as Response);

    const status = await adapter.getStatus('SM001');

    expect(status.status).toBe('delivered');
  });

  it('handleInbound parses status callback', async () => {
    const payload = {
      MessageSid: 'SM001',
      MessageStatus: 'delivered',
      To: '+12025550100',
      From: '+19995551234',
    };

    const inbound = await adapter.handleInbound(payload);

    expect(inbound.content).toBe('delivered');
    expect((inbound.metadata as { type: string }).type).toBe('status_callback');
  });

  it('handleInbound parses inbound SMS', async () => {
    const payload = {
      MessageSid: 'SM002',
      From: '+12025550199',
      To: '+19995551234',
      Body: 'STOP',
    };

    const inbound = await adapter.handleInbound(payload);

    expect(inbound.content).toBe('STOP');
    expect((inbound.metadata as { type: string }).type).toBe('inbound');
  });

  it('estimateCost returns USD', async () => {
    const est = await adapter.estimateCost(mockSmsMessage, [mockRecipient, mockRecipient]);
    expect(est.currency).toBe('USD');
    expect(est.recipientCount).toBe(2);
  });

  it('getChannelLimits has higher throughput than Bulkgate', () => {
    const twilio = new TwilioSmsAdapter({ accountSid: 'AC', authToken: 'at', fromNumber: '+1' });
    const bulkgate = new BulkgateSmsAdapter({ applicationId: 'a', applicationToken: 'b' });

    expect(twilio.getChannelLimits().maxPerSecond).toBeGreaterThan(
      bulkgate.getChannelLimits().maxPerSecond,
    );
  });
});

// ─── Phone → country ──────────────────────────────────────────────────────────

describe('phoneToCountry', () => {
  it.each([
    ['+12025550100', 'US'],
    ['+442071234567', 'GB'],
    ['+491701234567', 'DE'],
    ['+33123456789', 'FR'],
    ['+48123456789', 'PL'],
    ['+61412345678', 'AU'],
    ['+81312345678', 'JP'],
    ['+9991234567', 'XX'], // unknown prefix (999 not assigned)
  ])('maps %s → %s', (phone, expected) => {
    expect(phoneToCountry(phone)).toBe(expected);
  });
});

// ─── TCPA quiet hours ─────────────────────────────────────────────────────────

describe('checkTcpaQuietHours', () => {
  it('allows send during business hours (10 AM ET)', () => {
    // 10 AM Eastern = 15:00 UTC (standard time)
    const date = new Date('2026-04-12T14:00:00Z'); // 10 AM EDT
    const result = checkTcpaQuietHours('US', date);
    expect(result.blocked).toBe(false);
  });

  it('blocks send at 11 PM ET', () => {
    // 11 PM Eastern = 03:00 UTC next day (EDT)
    const date = new Date('2026-04-13T03:00:00Z'); // 11 PM EDT
    const result = checkTcpaQuietHours('US', date);
    expect(result.blocked).toBe(true);
    expect(result.allowedAfter).toBeDefined();
  });

  it('blocks send at 6 AM ET', () => {
    const date = new Date('2026-04-12T10:00:00Z'); // 6 AM EDT
    const result = checkTcpaQuietHours('US', date);
    expect(result.blocked).toBe(true);
  });

  it('does not block for non-US countries', () => {
    const date = new Date('2026-04-13T03:00:00Z'); // night time UTC
    expect(checkTcpaQuietHours('DE', date).blocked).toBe(false);
    expect(checkTcpaQuietHours('GB', date).blocked).toBe(false);
    expect(checkTcpaQuietHours('AU', date).blocked).toBe(false);
  });
});

// ─── Opt-out text ─────────────────────────────────────────────────────────────

describe('appendOptOutText', () => {
  it('appends opt-out text for US', () => {
    const result = appendOptOutText('Hello!', 'US');
    expect(result).toContain('Reply STOP to opt out');
  });

  it('does not append for non-US', () => {
    const result = appendOptOutText('Hello!', 'DE');
    expect(result).toBe('Hello!');
  });

  it('does not duplicate if STOP already in body', () => {
    const body = 'Text something. Reply STOP to quit.';
    const result = appendOptOutText(body, 'US');
    // Should not add another STOP mention but also shouldn't error
    expect(result).toContain('STOP');
    expect(result).toBe(body); // no change because STOP is already present
  });
});
