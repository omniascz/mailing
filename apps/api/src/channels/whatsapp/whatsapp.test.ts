/**
 * Tests for MetaWhatsAppAdapter (task 7.6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaWhatsAppAdapter } from '@forgemsg/shared/whatsapp/meta-adapter';
import type { UnifiedMessage, Recipient } from '@forgemsg/shared';

const adapter = new MetaWhatsAppAdapter({
  phoneNumberId: '12345',
  accessToken: 'EAAxxxtoken',
  defaultLanguage: 'en_US',
});

const mockRecipient: Recipient = {
  contactId: 'c1',
  phone: '+12025550100',
};

const mockWaMessage: UnifiedMessage = {
  channel: 'whatsapp',
  content: {
    kind: 'whatsapp',
    templateId: 'hello_world',
    parameters: { name: 'Alice', code: '123456' },
    language: 'en_US',
  },
  orgId: 'org1',
};

describe('MetaWhatsAppAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends template message successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ input: '12025550100', wa_id: '12025550100' }],
        messages: [{ id: 'wamid.001' }],
      }),
    } as unknown as Response);

    const result = await adapter.send(mockWaMessage, mockRecipient);

    expect(result.messageId).toBe('wamid.001');
    expect(result.status).toBe('sent');
    expect(result.provider).toBe('meta');
  });

  it('throws on Meta API error (template not approved)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Template not approved',
          code: 131047,
        },
      }),
    } as unknown as Response);

    await expect(adapter.send(mockWaMessage, mockRecipient)).rejects.toMatchObject({
      code: 'TEMPLATE_NOT_APPROVED',
      retryable: false,
    });
  });

  it('throws on rate limit error (retryable)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'Rate limit reached', code: 130429 },
      }),
    } as unknown as Response);

    await expect(adapter.send(mockWaMessage, mockRecipient)).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      retryable: true,
    });
  });

  it('rejects non-whatsapp content', async () => {
    const msg: UnifiedMessage = {
      channel: 'sms',
      content: { kind: 'sms', body: 'text' },
      orgId: 'org1',
    };

    await expect(adapter.send(msg, mockRecipient)).rejects.toMatchObject({
      code: 'WRONG_CONTENT',
    });
  });

  it('getStatus returns stub note', async () => {
    const status = await adapter.getStatus('wamid.001');
    expect(status.status).toBe('sent');
    expect(status.metadata?.note).toMatch(/webhook/);
  });

  it('handleInbound parses delivery status webhook', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: 'wamid.001',
                    status: 'delivered',
                    timestamp: '1712923200',
                    recipient_id: '12025550100',
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const inbound = await adapter.handleInbound(payload);

    expect(inbound.channel).toBe('whatsapp');
    expect(inbound.providerMessageId).toBe('wamid.001');
    expect(inbound.content).toBe('delivered');
    expect((inbound.metadata as { type: string }).type).toBe('status');
  });

  it('handleInbound parses inbound text message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    id: 'wamid.inbound',
                    from: '12025550199',
                    timestamp: '1712923200',
                    type: 'text',
                    text: { body: 'Hello!' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const inbound = await adapter.handleInbound(payload);

    expect(inbound.content).toBe('Hello!');
    expect(inbound.from).toBe('+12025550199');
    expect((inbound.metadata as { type: string }).type).toBe('inbound');
  });

  it('estimateCost returns per-conversation pricing', async () => {
    const est = await adapter.estimateCost(mockWaMessage, [mockRecipient, mockRecipient]);
    expect(est.currency).toBe('USD');
    expect(est.recipientCount).toBe(2);
    expect(est.totalCost).toBeCloseTo(0.01);
  });

  it('validateTemplate requires templateId', async () => {
    const result = await adapter.validateTemplate({
      id: 't1',
      channel: 'whatsapp',
      content: { parameters: {} },
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('templateId');
  });

  it('validateTemplate passes with valid content', async () => {
    const result = await adapter.validateTemplate({
      id: 't1',
      channel: 'whatsapp',
      content: { templateId: 'hello_world', parameters: { name: 'Bob' } },
    });

    expect(result.valid).toBe(true);
  });

  it('getChannelLimits returns expected values', () => {
    const limits = adapter.getChannelLimits();
    expect(limits.maxPerSecond).toBe(80);
    expect(limits.maxPerDay).toBe(1_000_000);
  });
});
