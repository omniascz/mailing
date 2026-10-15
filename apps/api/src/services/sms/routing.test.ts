/**
 * routedSmsSend's contact-state gate (Z155).
 *
 * A flow's SMS job carries workflowRunId and never workflowId. On master that
 * made it transactional: the contact's status was never read, so pending,
 * unsubscribed and archived contacts got flow SMS (measured, Z154).
 * workflowRunId now switches the contact-state gate on — and ONLY that gate:
 * sms_consents, quiet hours and the opt-out suffix stay keyed on
 * campaignId/workflowId, which the owner has not decided for flows.
 *
 * The database is a stub that answers the contact lookup and returns no SMS
 * route; "No active SMS route" therefore means "past every gate".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedMessage } from '@forgemsg/shared';

const state = vi.hoisted(() => ({
  contactRows: [] as { status: string }[],
  contactLookups: 0,
}));

vi.mock('../../db/client.js', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    // The contact lookup ends in .limit(1); the route lookup in .orderBy().
    limit: () => {
      state.contactLookups++;
      return Promise.resolve(state.contactRows);
    },
    orderBy: () => Promise.resolve([]),
  };
  return { db: { select: () => chain, insert: vi.fn(), update: vi.fn() } };
});
vi.mock('./compliance.js', () => ({
  checkSmsCompliance: vi.fn(async (_o: string, _p: string, body: string) => ({
    body: `${body} STOP`,
  })),
}));
vi.mock('./coupon-merge.js', () => ({
  resolveCouponMergeTags: vi.fn(async (body: string) => body),
}));
vi.mock('../webhooks/emit.js', () => ({ emitWebhookEvent: vi.fn() }));

import { routedSmsSend } from './routing.js';
import { checkSmsCompliance } from './compliance.js';

const ORG = '00000000-0000-4000-8000-000000000001';
const CONTACT = '00000000-0000-4000-8000-000000000002';
const RUN = '00000000-0000-4000-8000-000000000003';

function msg(
  ids: Partial<
    Pick<UnifiedMessage, 'campaignId' | 'workflowId' | 'workflowRunId' | 'flowTransactional'>
  >,
) {
  return {
    channel: 'sms',
    orgId: ORG,
    content: { kind: 'sms', body: 'Vstupenka' },
    ...ids,
  } as UnifiedMessage;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  return p.then(
    () => 'sent',
    (e: { code?: string; message: string }) => e.code ?? e.message,
  );
}

beforeEach(() => {
  state.contactRows = [];
  state.contactLookups = 0;
  vi.mocked(checkSmsCompliance).mockClear();
});

describe('routedSmsSend — workflowRunId gates the contact state, not consent on the number', () => {
  it('refuses an unsubscribed contact on a flow SMS, before the consent check', async () => {
    state.contactRows = [{ status: 'unsubscribed' }];
    const code = await codeOf(
      routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
        contactId: CONTACT,
        phone: '+420777000001',
      }),
    );
    expect(code).toBe('MARKETING_REFUSED');
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it.each(['bounced', 'complained', 'archived'])('refuses %s on a flow SMS', async (status) => {
    state.contactRows = [{ status }];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('MARKETING_REFUSED');
  });

  it('keeps CONSENT_PENDING for a pending contact on a flow SMS', async () => {
    state.contactRows = [{ status: 'pending' }];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('CONSENT_PENDING');
  });

  it('refuses a contact that is not found (missing or deleted) with CONTACT_UNAVAILABLE', async () => {
    state.contactRows = [];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('CONTACT_UNAVAILABLE');
  });

  it('lets an active contact through on a flow SMS WITHOUT the consent check or the opt-out suffix', async () => {
    state.contactRows = [{ status: 'active' }];
    const code = await codeOf(
      routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
        contactId: CONTACT,
        phone: '+420777000001',
      }),
    );
    expect(code).toBe('BAD_REQUEST'); // "No active SMS route" = past every gate
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it('non_subscribed passes the gate as before', async () => {
    state.contactRows = [{ status: 'non_subscribed' }];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('BAD_REQUEST');
  });

  it('a campaign SMS still gets the consent check after the gate', async () => {
    state.contactRows = [{ status: 'active' }];
    await codeOf(
      routedSmsSend(ORG, msg({ campaignId: RUN }), { contactId: CONTACT, phone: '+420777000001' }),
    );
    expect(checkSmsCompliance).toHaveBeenCalledTimes(1);
  });

  it('a campaign SMS to an unsubscribed contact is refused even when the number has consent', async () => {
    state.contactRows = [{ status: 'unsubscribed' }];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ campaignId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('MARKETING_REFUSED');
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it('transactional SMS (no campaign, no workflow, no run) never reads the contact', async () => {
    state.contactRows = [{ status: 'unsubscribed' }];
    expect(
      await codeOf(routedSmsSend(ORG, msg({}), { contactId: CONTACT, phone: '+420777000001' })),
    ).toBe('BAD_REQUEST');
    expect(state.contactLookups).toBe(0);
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });
});

// The flow's transactional exception (Z156; Michal, 14. 10. 22:10). The route
// sets flowTransactional only after reading the run's flow and node from the
// database; here it is set directly to test what the gate does with it.
describe('routedSmsSend — flowTransactional lifts only unsubscribed and complained', () => {
  const send = (status: string | null, ids: Parameters<typeof msg>[0]) => {
    state.contactRows = status === null ? [] : [{ status }];
    return codeOf(routedSmsSend(ORG, msg(ids), { contactId: CONTACT, phone: '+420777000001' }));
  };

  it.each(['unsubscribed', 'complained'])(
    'lets %s through on a flow SMS with the exception, still without the consent check',
    async (status) => {
      expect(await send(status, { workflowRunId: RUN, flowTransactional: true })).toBe(
        'BAD_REQUEST',
      );
      expect(checkSmsCompliance).not.toHaveBeenCalled();
    },
  );

  it.each(['unsubscribed', 'complained'])(
    'refuses %s without the exception, as before',
    async (status) => {
      expect(await send(status, { workflowRunId: RUN })).toBe('MARKETING_REFUSED');
      expect(await send(status, { workflowRunId: RUN, flowTransactional: false })).toBe(
        'MARKETING_REFUSED',
      );
    },
  );

  it.each(['archived', 'bounced'])('still refuses %s with the exception', async (status) => {
    expect(await send(status, { workflowRunId: RUN, flowTransactional: true })).toBe(
      'MARKETING_REFUSED',
    );
  });

  it('still answers CONSENT_PENDING for a pending contact with the exception', async () => {
    expect(await send('pending', { workflowRunId: RUN, flowTransactional: true })).toBe(
      'CONSENT_PENDING',
    );
  });

  it('still refuses a contact that is not found (missing or deleted) with the exception', async () => {
    expect(await send(null, { workflowRunId: RUN, flowTransactional: true })).toBe(
      'CONTACT_UNAVAILABLE',
    );
  });

  it('never applies to a campaign SMS, even if the flag is set', async () => {
    expect(await send('unsubscribed', { campaignId: RUN, flowTransactional: true })).toBe(
      'MARKETING_REFUSED',
    );
    expect(
      await send('unsubscribed', { campaignId: RUN, workflowRunId: RUN, flowTransactional: true }),
    ).toBe('MARKETING_REFUSED');
  });

  it('needs the flow run: the flag alone does not lift anything', async () => {
    expect(await send('unsubscribed', { workflowId: RUN, flowTransactional: true })).toBe(
      'MARKETING_REFUSED',
    );
  });

  it('never runs the consent on the number for an exception SMS (isMarketing unchanged)', async () => {
    for (const status of ['active', 'non_subscribed', 'unsubscribed', 'complained']) {
      await send(status, { workflowRunId: RUN, flowTransactional: true });
    }
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });
});
