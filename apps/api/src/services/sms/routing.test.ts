/**
 * routedSmsSend's contact-state gate (Z155).
 *
 * A flow's SMS job carries workflowRunId and never workflowId. On master that
 * made it transactional: the contact's status was never read, so pending,
 * unsubscribed and archived contacts got flow SMS (measured, Z154).
 * workflowRunId now switches the contact-state gate on. Since Z167 (Michal,
 * 14. 10. 22:10, point 4) a flow's marketing SMS — a run, no campaign, no
 * transactional exception — also gets checkSmsCompliance (sms_consents, quiet
 * hours, the opt-out suffix) exactly as an SMS campaign does.
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

  // Z167 — Michal, 14. 10. 22:10, point 4: a flow's marketing SMS gets the
  // consent check and the opt-out suffix as an SMS campaign does. This said
  // "WITHOUT the consent check" and `not.toHaveBeenCalled()` before.
  it('lets an active contact through on a flow SMS, after the consent check', async () => {
    state.contactRows = [{ status: 'active' }];
    const code = await codeOf(
      routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
        contactId: CONTACT,
        phone: '+420777000001',
      }),
    );
    expect(code).toBe('BAD_REQUEST'); // "No active SMS route" = past every gate
    expect(checkSmsCompliance).toHaveBeenCalledTimes(1);
  });

  // Z166 — Michal, 14. 10. 22:10, point 3: a flow's marketing SMS skips
  // non_subscribed. This said 'BAD_REQUEST' (past every gate) before.
  it('non_subscribed is refused on a flow SMS (Z166)', async () => {
    state.contactRows = [{ status: 'non_subscribed' }];
    expect(
      await codeOf(
        routedSmsSend(ORG, msg({ workflowRunId: RUN }), {
          contactId: CONTACT,
          phone: '+420777000001',
        }),
      ),
    ).toBe('MARKETING_REFUSED');
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
//
// Z158 — Michal, 15. 10. 6:10, point 1b, which overrides the narrower reading
// of Z156: pending and archived are lifted too. These two used to be asserted
// refused with the exception (archived MARKETING_REFUSED, pending
// CONSENT_PENDING); that is the change of behaviour, so those assertions moved
// to the "lets through" case. Bounced and a missing contact stay refused.
describe('routedSmsSend — flowTransactional lifts pending, archived, unsubscribed and complained', () => {
  const send = (status: string | null, ids: Parameters<typeof msg>[0]) => {
    state.contactRows = status === null ? [] : [{ status }];
    return codeOf(routedSmsSend(ORG, msg(ids), { contactId: CONTACT, phone: '+420777000001' }));
  };

  it.each(['unsubscribed', 'complained', 'pending', 'archived'])(
    'lets %s through on a flow SMS with the exception, still without the consent check',
    async (status) => {
      expect(await send(status, { workflowRunId: RUN, flowTransactional: true })).toBe(
        'BAD_REQUEST',
      );
      expect(checkSmsCompliance).not.toHaveBeenCalled();
    },
  );

  it.each(['unsubscribed', 'complained', 'archived'])(
    'refuses %s without the exception, as before',
    async (status) => {
      expect(await send(status, { workflowRunId: RUN })).toBe('MARKETING_REFUSED');
      expect(await send(status, { workflowRunId: RUN, flowTransactional: false })).toBe(
        'MARKETING_REFUSED',
      );
    },
  );

  it('answers CONSENT_PENDING for a pending contact without the exception, as before', async () => {
    expect(await send('pending', { workflowRunId: RUN })).toBe('CONSENT_PENDING');
    expect(await send('pending', { workflowRunId: RUN, flowTransactional: false })).toBe(
      'CONSENT_PENDING',
    );
  });

  // Bounced waits on Michal (Z158): unchanged.
  it('still refuses bounced with the exception', async () => {
    expect(await send('bounced', { workflowRunId: RUN, flowTransactional: true })).toBe(
      'MARKETING_REFUSED',
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
    expect(await send('pending', { campaignId: RUN, flowTransactional: true })).toBe(
      'CONSENT_PENDING',
    );
    expect(
      await send('pending', { campaignId: RUN, workflowRunId: RUN, flowTransactional: true }),
    ).toBe('CONSENT_PENDING');
    expect(
      await send('unsubscribed', { campaignId: RUN, workflowRunId: RUN, flowTransactional: true }),
    ).toBe('MARKETING_REFUSED');
  });

  it('needs the flow run: the flag alone does not lift anything', async () => {
    expect(await send('unsubscribed', { workflowId: RUN, flowTransactional: true })).toBe(
      'MARKETING_REFUSED',
    );
    expect(await send('pending', { workflowId: RUN, flowTransactional: true })).toBe(
      'CONSENT_PENDING',
    );
  });

  it('never runs the consent on the number for an exception SMS (isMarketing unchanged)', async () => {
    for (const status of [
      'active',
      'non_subscribed',
      'unsubscribed',
      'complained',
      'pending',
      'archived',
    ]) {
      await send(status, { workflowRunId: RUN, flowTransactional: true });
    }
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });
});

// Z166 — Michal, 14. 10. 22:10, point 3: "non_subscribed: marketingové uzly
// flow ho vynechají jako kampaň; transakční výjimka z bodu 1 platí." Only a
// flow's marketing SMS (a run, no campaign, no exception) refuses it.
describe('routedSmsSend — non_subscribed on a flow marketing SMS only', () => {
  const send = (status: string, ids: Parameters<typeof msg>[0]) => {
    state.contactRows = [{ status }];
    return codeOf(routedSmsSend(ORG, msg(ids), { contactId: CONTACT, phone: '+420777000001' }));
  };

  it('refuses it on a flow SMS without the exception, before the consent check', async () => {
    expect(await send('non_subscribed', { workflowRunId: RUN })).toBe('MARKETING_REFUSED');
    expect(await send('non_subscribed', { workflowRunId: RUN, flowTransactional: false })).toBe(
      'MARKETING_REFUSED',
    );
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it('lets it through on a flow SMS under the exception', async () => {
    expect(await send('non_subscribed', { workflowRunId: RUN, flowTransactional: true })).toBe(
      'BAD_REQUEST',
    );
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it('a campaign SMS is unchanged: the gate lets it through to the consent check', async () => {
    expect(await send('non_subscribed', { campaignId: RUN })).toBe('BAD_REQUEST');
    expect(await send('non_subscribed', { campaignId: RUN, workflowRunId: RUN })).toBe(
      'BAD_REQUEST',
    );
    expect(checkSmsCompliance).toHaveBeenCalledTimes(2);
  });

  it('an SMS with a workflowId and no run is unchanged', async () => {
    expect(await send('non_subscribed', { workflowId: RUN })).toBe('BAD_REQUEST');
  });

  it('active still passes a flow SMS; the other refused statuses keep their codes', async () => {
    expect(await send('active', { workflowRunId: RUN })).toBe('BAD_REQUEST');
    expect(await send('pending', { workflowRunId: RUN })).toBe('CONSENT_PENDING');
    for (const status of ['unsubscribed', 'bounced', 'complained', 'archived'])
      expect(await send(status, { workflowRunId: RUN })).toBe('MARKETING_REFUSED');
  });
});

// Z167 — Michal, 14. 10. 22:10, point 4: "Marketingová SMS z flow: souhlas na
// čísle (sms_consents), dovětek STOP a noční klid jako SMS kampaň." The same
// call with the same parameters as a campaign SMS; the exception never reads it.
describe("routedSmsSend — a flow's marketing SMS gets the campaign's compliance call", () => {
  const send = (ids: Parameters<typeof msg>[0], phone = '+420777000001', status = 'active') => {
    state.contactRows = [{ status }];
    return codeOf(routedSmsSend(ORG, msg(ids), { contactId: CONTACT, phone }));
  };

  it('calls checkSmsCompliance with exactly the arguments a campaign SMS gets', async () => {
    for (const phone of ['+420777000001', '+12125550123']) {
      vi.mocked(checkSmsCompliance).mockClear();
      await send({ campaignId: RUN }, phone);
      await send({ workflowRunId: RUN }, phone);
      await send({ workflowRunId: RUN, flowTransactional: false }, phone);
      const [campaign, flow, flowFalse] = vi.mocked(checkSmsCompliance).mock.calls;
      expect(campaign).toEqual([
        ORG,
        phone,
        'Vstupenka',
        phone.startsWith('+1') ? 'US' : 'CZ',
        { requireConsent: true },
      ]);
      expect(flow).toEqual(campaign);
      expect(flowFalse).toEqual(campaign);
    }
  });

  it('a block from the compliance check stops a flow SMS with its code', async () => {
    for (const code of ['SMS_COMPLIANCE_BLOCKED', 'SMS_QUIET_HOURS']) {
      vi.mocked(checkSmsCompliance).mockRejectedValueOnce(Object.assign(new Error(code), { code }));
      expect(await send({ workflowRunId: RUN })).toBe(code);
    }
  });

  it('the contact-state gate stays first: consent on the number is not even read for a refused contact', async () => {
    for (const status of ['unsubscribed', 'non_subscribed', 'complained', 'archived', 'bounced'])
      expect(await send({ workflowRunId: RUN }, '+420777000001', status)).toBe('MARKETING_REFUSED');
    expect(await send({ workflowRunId: RUN }, '+420777000001', 'pending')).toBe('CONSENT_PENDING');
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });

  it('the transactional exception and an SMS with no campaign, flow or run never read it', async () => {
    await send({ workflowRunId: RUN, flowTransactional: true });
    await send({ workflowRunId: RUN, flowTransactional: true }, '+12125550123');
    state.contactRows = [];
    await codeOf(routedSmsSend(ORG, msg({}), { phone: '+420777000001' }));
    await codeOf(routedSmsSend(ORG, msg({}), { phone: '+12125550123' }));
    expect(checkSmsCompliance).not.toHaveBeenCalled();
  });
});
