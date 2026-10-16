/**
 * routedSmsSend with the REAL checkSmsCompliance: a flow's marketing SMS gets
 * consent on the number, the US opt-out suffix and the TCPA quiet hours exactly
 * as an SMS campaign does (Z167 — Michal, 14. 10. 22:10, point 4).
 *
 * routing.test.ts stubs compliance.ts; this file does not, so the text the
 * adapter is handed — the suffix — and the US night are visible. The database
 * is a stub that answers the contact lookup (select { status }), the consent
 * lookup (select { id }) and one route; the Twilio adapter is a stub that keeps
 * the message it was handed. The clock is faked (Date only) to put New York in
 * the day or in the night.
 *
 *   K   an SMS campaign (campaignId) — the reference;
 *   F   a flow's marketing SMS (workflowRunId, no exception);
 *   T   a flow's transactional SMS (workflowRunId + flowTransactional);
 *   D   a direct SMS (no campaign, no flow, no contact).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UnifiedMessage } from '@forgemsg/shared';

const state = vi.hoisted(() => ({
  contactRows: [{ status: 'active' }] as { status: string }[],
  consentRows: [] as { id: string }[],
  consentLookups: 0,
  handed: [] as string[],
}));

vi.mock('../../db/client.js', () => {
  const chainFor = (fields?: Record<string, unknown>) => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => {
        if (fields && 'status' in fields) return Promise.resolve(state.contactRows);
        state.consentLookups++;
        return Promise.resolve(state.consentRows);
      },
      orderBy: () =>
        Promise.resolve([{ id: 'r1', provider: 'twilio', config: {}, countryCode: '*' }]),
    };
    return chain;
  };
  const write = {
    values: () => Promise.resolve(),
    set: () => write,
    where: () => Promise.resolve(),
  };
  return {
    db: {
      select: (fields?: Record<string, unknown>) => chainFor(fields),
      insert: () => write,
      update: () => write,
    },
  };
});
vi.mock('../../channels/sms/twilio-adapter.js', () => ({
  TwilioSmsAdapter: class {
    async send(m: UnifiedMessage) {
      state.handed.push((m.content as { body: string }).body);
      return { messageId: 'tw-1', status: 'sent' };
    }
  },
}));
vi.mock('../../channels/sms/bulkgate-adapter.js', () => ({ BulkgateSmsAdapter: class {} }));
vi.mock('./coupon-merge.js', () => ({
  resolveCouponMergeTags: vi.fn(async (body: string) => body),
}));
vi.mock('../webhooks/emit.js', () => ({ emitWebhookEvent: vi.fn() }));

import { routedSmsSend } from './routing.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const CONTACT = '00000000-0000-4000-8000-000000000002';
const RUN = '00000000-0000-4000-8000-000000000003';
const CZ = '+420777000001';
const US = '+12125550123';
/** 16:00 UTC = 12:00 in New York (EDT) — inside 8–21. */
const US_DAY = new Date('2026-10-16T16:00:00Z');
/** 03:00 UTC = 23:00 in New York — TCPA night. */
const US_NIGHT = new Date('2026-10-16T03:00:00Z');

type Kind = 'K' | 'F' | 'T' | 'D';
const IDS: Record<Kind, Partial<UnifiedMessage>> = {
  K: { campaignId: RUN },
  F: { workflowRunId: RUN },
  T: { workflowRunId: RUN, flowTransactional: true },
  D: {},
};

/** What the adapter got ("sent: <text>") or the gate's code. */
async function cell(kind: Kind, phone: string, consent: boolean, at: Date): Promise<string> {
  vi.setSystemTime(at);
  state.consentRows = consent ? [{ id: 'c1' }] : [];
  state.handed = [];
  const message = {
    channel: 'sms',
    orgId: ORG,
    content: { kind: 'sms', body: 'Akce' },
    ...IDS[kind],
  } as UnifiedMessage;
  const recipient = kind === 'D' ? { phone } : { contactId: CONTACT, phone };
  try {
    await routedSmsSend(ORG, message, recipient);
    return `sent: ${state.handed.join('|')}`;
  } catch (e) {
    return (e as { code?: string; message: string }).code ?? (e as Error).message;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  state.contactRows = [{ status: 'active' }];
  state.consentLookups = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

const CASES: [string, string, boolean, Date][] = [
  ['CZ with consent', CZ, true, US_DAY],
  ['CZ without a consent row (or revoked)', CZ, false, US_DAY],
  ['US with consent, New York day', US, true, US_DAY],
  ['US with consent, New York night', US, true, US_NIGHT],
  ['US without consent, New York day', US, false, US_DAY],
];

describe("a flow's marketing SMS = an SMS campaign, with the real compliance (Z167)", () => {
  it.each(CASES)('%s: F answers exactly what K answers', async (_label, phone, consent, at) => {
    expect(await cell('F', phone, consent, at)).toBe(await cell('K', phone, consent, at));
  });

  it('the values themselves, for the campaign and the flow alike', async () => {
    for (const kind of ['K', 'F'] as const) {
      expect(await cell(kind, CZ, true, US_DAY), kind).toBe('sent: Akce');
      expect(await cell(kind, CZ, false, US_DAY), kind).toBe('SMS_COMPLIANCE_BLOCKED');
      expect(await cell(kind, US, true, US_DAY), kind).toBe('sent: Akce Reply STOP to opt out.');
      expect(await cell(kind, US, true, US_NIGHT), kind).toBe('SMS_QUIET_HOURS');
      expect(await cell(kind, US, false, US_DAY), kind).toBe('SMS_COMPLIANCE_BLOCKED');
    }
  });

  it.each(CASES)(
    '%s: the transactional exception and a direct SMS are untouched — sent as written, consent never read',
    async (_label, phone, consent, at) => {
      expect(await cell('T', phone, consent, at)).toBe('sent: Akce');
      expect(await cell('D', phone, consent, at)).toBe('sent: Akce');
      expect(state.consentLookups).toBe(0);
    },
  );

  it('costs one consent lookup per marketing SMS of a flow, as per campaign SMS', async () => {
    await cell('K', CZ, true, US_DAY);
    expect(state.consentLookups).toBe(1);
    await cell('F', CZ, true, US_DAY);
    expect(state.consentLookups).toBe(2);
  });
});
