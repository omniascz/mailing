/**
 * enqueueCampaignSend flips the campaign to 'sending' and only then does the
 * work that can fail. If anything between the flip and a successful enqueue
 * throws, the flip has to be undone — otherwise the campaign sits in 'sending'
 * with nothing on the queue, and nothing will ever move it again: the splitter
 * never ran, so it never drives sending→sent, and dispatchScheduledCampaigns
 * only selects status='scheduled'.
 *
 * The non-email branch always rolled back. The email branch did not, which is
 * the bug these tests pin. They are deliberately not DKIM-specific: DKIM is one
 * of several things that can throw in that window, and a rollback that only
 * covers one of them is not a rollback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import type { Campaign } from '../../db/schema/index.js';

// ─── mocks ───────────────────────────────────────────────────────────────────

/**
 * Select results are consumed in call order, which is deterministic for a given
 * path through enqueueCampaignSend: the pre-flip campaigns read, then the
 * sending_domains tracking read, then the organizations read. An exhausted
 * queue yields [] so a test only has to declare the reads it actually reaches.
 */
const selectResults: unknown[][] = [];
const updateCalls: Array<Record<string, unknown>> = [];
let updateImpl: () => Promise<unknown[]> = async () => [{ id: 'c1', orgId: 'org1' }];

function selectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'innerJoin', 'leftJoin']) {
    chain[m] = () => chain;
  }
  chain.limit = async () => selectResults.shift() ?? [];
  return chain;
}

function updateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = (v: Record<string, unknown>) => {
    updateCalls.push(v);
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () => updateImpl();
  return chain;
}

vi.mock('../../db/client.js', () => ({
  db: { select: () => selectChain(), update: () => updateChain() },
}));

const queueAdd = vi.fn(async () => ({}));
vi.mock('../../lib/queues.js', () => ({
  campaignSplitterQueue: { add: (...a: unknown[]) => queueAdd(...(a as [])) },
  PRIORITY: { CAMPAIGN: 3 },
}));

vi.mock('../webhooks/emit.js', () => ({ emitWebhookEvent: vi.fn() }));

const sendCampaign = vi.fn();
vi.mock('./index.js', () => ({ sendCampaign: (...a: unknown[]) => sendCampaign(...a) }));

const resolveDkimForSender = vi.fn();
vi.mock('../domains/dkim-rotation.js', () => ({
  resolveDkimForSender: (...a: unknown[]) => resolveDkimForSender(...a),
}));

vi.mock('../identities/index.js', () => ({ assertBulkSendAllowed: vi.fn() }));
vi.mock('../sending/from-domain.js', () => ({
  assertFromDomainOwned: vi.fn(),
  fromAddressDomain: (s: string) => s.split('@')[1] ?? null,
}));

const applyConfigurationSet = vi.fn(async () => ({ ipPoolId: null, tlsPolicy: 'opportunistic' }));
vi.mock('../configuration-sets/index.js', () => ({
  applyConfigurationSet: (...a: unknown[]) => applyConfigurationSet(...(a as [])),
}));

const getMailSettings = vi.fn(async () => ({ footer: { enabled: false } }));
vi.mock('../settings/mail-settings.js', () => ({
  getMailSettings: (...a: unknown[]) => getMailSettings(...(a as [])),
}));

const dispatchChannelCampaign = vi.fn();
vi.mock('./channel-dispatch.js', () => ({
  dispatchChannelCampaign: (...a: unknown[]) => dispatchChannelCampaign(...a),
}));

const { enqueueCampaignSend } = await import('./dispatch.js');

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = 'org1';
const CID = 'c1';

const emailCampaign = (extra: Partial<Campaign> = {}) =>
  ({
    id: CID,
    orgId: ORG,
    type: 'email',
    fromEmail: 'orders@shop.cz',
    content: { blocks: [] },
    subject: 'S',
    configurationSet: null,
    ...extra,
  }) as unknown as Campaign;

/** The status values written by db.update — i.e. what the rollback did. */
const statusWrites = () => updateCalls.map((c) => c.status);

beforeEach(() => {
  selectResults.length = 0;
  updateCalls.length = 0;
  updateImpl = async () => [{ id: CID, orgId: ORG }];
  queueAdd.mockClear();
  sendCampaign.mockReset();
  resolveDkimForSender.mockReset();
  applyConfigurationSet.mockReset();
  applyConfigurationSet.mockResolvedValue({ ipPoolId: null, tlsPolicy: 'opportunistic' });
  getMailSettings.mockReset();
  getMailSettings.mockResolvedValue({ footer: { enabled: false } });
  dispatchChannelCampaign.mockReset();

  sendCampaign.mockResolvedValue(emailCampaign());
  // pre-flip campaigns read
  selectResults.push([{ fromEmail: 'orders@shop.cz', type: 'email' }]);
});

// ─── the fix ─────────────────────────────────────────────────────────────────

describe('enqueueCampaignSend — rollback out of "sending"', () => {
  it('(a,b) a failing DKIM resolver leaves the campaign paused and enqueues nothing', async () => {
    const boom = new Error('dkim: key cannot be read');
    resolveDkimForSender.mockRejectedValue(boom);

    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow(boom);

    expect(statusWrites()).toEqual(['paused']);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('(c) a second attempt with a working resolver goes through — not stuck in paused', async () => {
    resolveDkimForSender.mockRejectedValueOnce(new Error('dkim: key cannot be read'));
    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow();
    expect(statusWrites()).toEqual(['paused']);

    // Second pass, key repaired.
    updateCalls.length = 0;
    selectResults.push([{ fromEmail: 'orders@shop.cz', type: 'email' }]); // pre-flip read
    selectResults.push([{ open: true, click: true }]); // tracking
    selectResults.push([{ companyName: 'Shop', postalAddress: 'Praha' }]); // org
    resolveDkimForSender.mockResolvedValue({
      dkimDomain: 'shop.cz',
      dkimSelector: 's1',
      dkimPrivateKey: 'PEM',
    });

    await enqueueCampaignSend(ORG, CID);

    expect(queueAdd).toHaveBeenCalledTimes(1);
    // No rollback on the happy path — the campaign stays in 'sending'.
    expect(statusWrites()).toEqual([]);
  });

  it('(e) a paused configuration set rolls back the same way — the fix is not DKIM-specific', async () => {
    resolveDkimForSender.mockResolvedValue(null);
    selectResults.push([{ open: true, click: true }]);
    applyConfigurationSet.mockRejectedValue(AppError.forbidden('sending paused'));

    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow('sending paused');

    expect(statusWrites()).toEqual(['paused']);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('(e) a failing organizations read rolls back too', async () => {
    resolveDkimForSender.mockResolvedValue(null);
    selectResults.push([{ open: true, click: true }]);
    getMailSettings.mockRejectedValue(new Error('db: connection terminated'));

    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow('connection terminated');

    expect(statusWrites()).toEqual(['paused']);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('(e) a Redis failure on the enqueue itself rolls back', async () => {
    resolveDkimForSender.mockResolvedValue(null);
    selectResults.push([{ open: true, click: true }]);
    selectResults.push([{ companyName: 'Shop', postalAddress: 'Praha' }]);
    queueAdd.mockRejectedValueOnce(new Error('redis: ECONNREFUSED'));

    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow('ECONNREFUSED');

    expect(statusWrites()).toEqual(['paused']);
  });

  it('surfaces the original error even when the rollback write itself fails', async () => {
    resolveDkimForSender.mockRejectedValue(new Error('dkim: key cannot be read'));
    updateImpl = async () => {
      throw new Error('db: rollback write failed');
    };

    // The operator needs the reason the send failed, not the reason the cleanup
    // failed. Best-effort rollback, original error rethrown.
    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow('dkim: key cannot be read');
  });

  it('still rolls back the non-email branch (unchanged behaviour, now shared)', async () => {
    sendCampaign.mockResolvedValue(emailCampaign({ type: 'sms', fromEmail: null }));
    selectResults.length = 0;
    selectResults.push([{ fromEmail: null, type: 'sms' }]);
    dispatchChannelCampaign.mockRejectedValue(new Error('sms: no body'));

    await expect(enqueueCampaignSend(ORG, CID)).rejects.toThrow('sms: no body');

    expect(statusWrites()).toEqual(['paused']);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('does not roll back a successful non-email dispatch', async () => {
    sendCampaign.mockResolvedValue(emailCampaign({ type: 'sms', fromEmail: null }));
    selectResults.length = 0;
    selectResults.push([{ fromEmail: null, type: 'sms' }]);
    dispatchChannelCampaign.mockResolvedValue(undefined);

    await enqueueCampaignSend(ORG, CID);

    expect(statusWrites()).toEqual([]);
  });
});
