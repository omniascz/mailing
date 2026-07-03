import { describe, it, expect } from 'vitest';
import { evaluateInboundRules, defaultInboundActions } from './index.js';

const msg = { to: 'support@acme.com', from: 'jo@customer.com', subject: 'Help please' };

describe('evaluateInboundRules', () => {
  it('matches by recipient/from/subject regex and returns actions in priority order', () => {
    const actions = evaluateInboundRules(
      [
        { priority: 20, active: true, match: { subjectPattern: 'invoice' }, actions: [{ type: 'store', url: 'https://x' }] },
        { priority: 10, active: true, match: { recipientPattern: '^support@' }, actions: [{ type: 'helpdesk' }] },
      ],
      msg,
    );
    expect(actions).toEqual([{ type: 'helpdesk' }]); // only the support rule matched
  });

  it('stops evaluation at a stop action (keeping prior actions)', () => {
    const actions = evaluateInboundRules(
      [
        { priority: 10, active: true, match: {}, actions: [{ type: 'webhook', url: 'https://a' }, { type: 'stop' }] },
        { priority: 20, active: true, match: {}, actions: [{ type: 'helpdesk' }] },
      ],
      msg,
    );
    expect(actions).toEqual([{ type: 'webhook', url: 'https://a' }]);
  });

  it('skips inactive rules and empty match = matches all', () => {
    const actions = evaluateInboundRules(
      [
        { priority: 5, active: false, match: {}, actions: [{ type: 'drop' }] },
        { priority: 10, active: true, match: {}, actions: [{ type: 'workflow_event', eventName: 'x' }] },
      ],
      msg,
    );
    expect(actions).toEqual([{ type: 'workflow_event', eventName: 'x' }]);
  });

  it('invalid regex never matches (no throw)', () => {
    const actions = evaluateInboundRules(
      [{ priority: 1, active: true, match: { recipientPattern: '(' }, actions: [{ type: 'helpdesk' }] }],
      msg,
    );
    expect(actions).toEqual([]);
  });
});

describe('defaultInboundActions', () => {
  it('routes support/help/etc to helpdesk, else a reply workflow event', () => {
    expect(defaultInboundActions({ to: 'help@x.com', from: 'a@b.com', subject: null })).toEqual([
      { type: 'helpdesk' },
    ]);
    expect(defaultInboundActions({ to: 'random@x.com', from: 'a@b.com', subject: null })).toEqual([
      { type: 'workflow_event', eventName: 'email_reply_received' },
    ]);
  });
});
