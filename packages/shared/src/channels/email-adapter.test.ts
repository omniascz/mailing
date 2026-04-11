import { describe, it, expect } from 'vitest';
import { EmailAdapter } from './email-adapter.js';
import { ChannelRegistry } from './registry.js';
import { ChannelAdapterError } from '../types/channels.js';
import type { UnifiedMessage, Recipient } from '../types/channels.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const validMessage: UnifiedMessage = {
  channel: 'email',
  orgId: ORG_ID,
  content: {
    kind: 'email',
    subject: 'Welcome to ForgeMsg',
    html: '<p>Hello {{first_name}}</p>',
    text: 'Hello {{first_name}}',
  },
};

const validRecipient: Recipient = {
  contactId: 'c-1',
  email: 'alice@example.com',
  firstName: 'Alice',
};

describe('EmailAdapter', () => {
  it('exposes channel and provider', () => {
    const adapter = new EmailAdapter('test-provider');
    expect(adapter.channel).toBe('email');
    expect(adapter.provider).toBe('test-provider');
  });

  it('returns a queued result for valid input', async () => {
    const adapter = new EmailAdapter();
    const result = await adapter.send(validMessage, validRecipient);
    expect(result.status).toBe('queued');
    expect(result.recipientId).toBe('c-1');
    expect(result.messageId).toMatch(/^mock-/);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('throws ChannelAdapterError when recipient has no email', async () => {
    const adapter = new EmailAdapter();
    await expect(adapter.send(validMessage, { contactId: 'c-2' })).rejects.toBeInstanceOf(
      ChannelAdapterError,
    );
  });

  it('throws ChannelAdapterError when content is not email', async () => {
    const adapter = new EmailAdapter();
    const smsMessage: UnifiedMessage = {
      channel: 'email',
      orgId: ORG_ID,
      content: { kind: 'sms', body: 'hi' },
    };
    await expect(adapter.send(smsMessage, validRecipient)).rejects.toBeInstanceOf(
      ChannelAdapterError,
    );
  });

  it('validates templates', async () => {
    const adapter = new EmailAdapter();
    const valid = await adapter.validateTemplate({
      id: 't-1',
      channel: 'email',
      content: { subject: 'Hello', html: '<p>Body</p>' },
    });
    expect(valid.valid).toBe(true);

    const invalid = await adapter.validateTemplate({
      id: 't-2',
      channel: 'email',
      content: {},
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(2);
  });

  it('estimates cost linearly with recipients', async () => {
    const adapter = new EmailAdapter();
    const estimate = await adapter.estimateCost(validMessage, [
      validRecipient,
      validRecipient,
      validRecipient,
    ]);
    expect(estimate.recipientCount).toBe(3);
    expect(estimate.totalCost).toBeCloseTo(estimate.perRecipientCost * 3);
    expect(estimate.currency).toBe('USD');
  });

  it('bulk send aggregates results and isolates failures', async () => {
    const adapter = new EmailAdapter();
    const result = await adapter.sendBulk(validMessage, [
      validRecipient,
      { contactId: 'c-no-email' }, // will fail
      { contactId: 'c-3', email: 'bob@example.com' },
    ]);
    expect(result.successful).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.errorCode).toBe('MISSING_EMAIL');
  });
});

describe('ChannelRegistry', () => {
  it('registers and retrieves adapters by channel', () => {
    const registry = new ChannelRegistry();
    const adapter = new EmailAdapter();
    registry.register(adapter);

    expect(registry.get('email')).toBe(adapter);
    expect(registry.list()).toEqual(['email']);
  });

  it('require() throws for missing channels', () => {
    const registry = new ChannelRegistry();
    expect(() => registry.require('sms')).toThrow(/No adapter registered for channel: sms/);
  });
});
