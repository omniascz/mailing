import { describe, it, expect, vi } from 'vitest';

// Mock dispatchEvent so we can assert the mapping without a DB/queue.
const dispatched: Array<{ event: string; payload: unknown }> = [];
vi.mock('./index.js', () => ({
  dispatchEvent: async (_orgId: string, event: string, payload: unknown) => {
    dispatched.push({ event, payload });
  },
}));

const { emitEmailEvent } = await import('./email-events.js');

describe('emitEmailEvent', () => {
  it('maps each email kind to the correct webhook event name', async () => {
    dispatched.length = 0;
    emitEmailEvent('o1', 'delivered', { messageId: 'm1' });
    emitEmailEvent('o1', 'opened', { contactId: 'c1' });
    emitEmailEvent('o1', 'bounced', { bounceType: 'hard' });
    emitEmailEvent('o1', 'complained', {});
    emitEmailEvent('o1', 'unsubscribed', {});
    emitEmailEvent('o1', 'sent', {});
    // allow the fire-and-forget promises to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatched.map((d) => d.event)).toEqual([
      'email.delivered',
      'email.opened',
      'email.bounced',
      'email.complained',
      'email.unsubscribed',
      'email.sent',
    ]);
  });
});
