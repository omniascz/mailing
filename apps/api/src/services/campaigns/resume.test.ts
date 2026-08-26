/**
 * Resume has to tell two identical-looking pauses apart.
 *
 * A campaign rolled back by a failed dispatch queued nothing, so resuming it
 * means actually sending. A campaign an operator paused may already have
 * batches in flight, and the dispatch ledger is scoped per enqueue attempt, so
 * enqueueing again would re-send the whole audience on purpose. `paused_reason`
 * is the only thing that separates them, and NULL — a legacy row, or a pause
 * from a path that records no reason — must fall on the safe side.
 *
 * The db mock here holds one real row rather than canned results, so
 * "the flip clears the reason" and "the second Resume sees NULL" are observed
 * rather than arranged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Row {
  id: string;
  orgId: string;
  status: string;
  pausedReason: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  listId: string | null;
  content: Record<string, unknown>;
  templateId: string | null;
  deletedAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
}

let row: Row;
const updateSets: Array<Record<string, unknown>> = [];

function selectChain() {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy']) c[m] = () => c;
  c.limit = async () => [{ ...row }];
  return c;
}

function updateChain() {
  const c: Record<string, unknown> = {};
  c.set = (v: Record<string, unknown>) => {
    updateSets.push(v);
    Object.assign(row, v);
    return c;
  };
  c.where = () => c;
  c.returning = async () => [{ ...row }];
  return c;
}

vi.mock('../../db/client.js', () => ({
  db: { select: () => selectChain(), update: () => updateChain() },
}));
vi.mock('../editor/ai-alt-text.js', () => ({ fillMissingAltTexts: vi.fn(async (c) => c) }));

const enqueueCampaignSend = vi.fn();
vi.mock('./dispatch.js', () => ({
  enqueueCampaignSend: (...a: unknown[]) => enqueueCampaignSend(...a),
}));

const mod = await import('./index.js');

const ORG = 'org1';
const CID = 'c1';

beforeEach(() => {
  updateSets.length = 0;
  row = {
    id: CID,
    orgId: ORG,
    status: 'paused',
    pausedReason: null,
    subject: 'S',
    fromEmail: 'a@shop.cz',
    fromName: 'Shop',
    listId: 'list1',
    content: { blocks: [] },
    templateId: null,
    deletedAt: null,
    sentAt: null,
    updatedAt: new Date(),
  };
  enqueueCampaignSend.mockReset();
  // Stand in for the real dispatch: it calls sendCampaign, which performs the
  // flip. That flip is what clears the reason, so the fake has to do it too or
  // the double-resume test would prove nothing.
  enqueueCampaignSend.mockImplementation(async (orgId: string, id: string) =>
    mod.sendCampaign(orgId, id),
  );
});

describe('resumeCampaign — which pause is this', () => {
  it('(b) a send_failed pause enqueues, exactly once', async () => {
    row.pausedReason = 'send_failed';

    await mod.resumeCampaign(ORG, CID);

    expect(enqueueCampaignSend).toHaveBeenCalledTimes(1);
    expect(enqueueCampaignSend).toHaveBeenCalledWith(ORG, CID);
    expect(row.status).toBe('sending');
  });

  it('(c) an operator pause does NOT enqueue', async () => {
    row.pausedReason = 'operator';

    await mod.resumeCampaign(ORG, CID);

    expect(enqueueCampaignSend).not.toHaveBeenCalled();
    expect(row.status).toBe('sending');
  });

  it('(d) a NULL reason does NOT enqueue — a legacy row must not be guessed at', async () => {
    row.pausedReason = null;

    await mod.resumeCampaign(ORG, CID);

    expect(enqueueCampaignSend).not.toHaveBeenCalled();
    expect(row.status).toBe('sending');
  });

  it('(d) an unrecognised reason does NOT enqueue either', async () => {
    row.pausedReason = 'something_a_later_version_writes';

    await mod.resumeCampaign(ORG, CID);

    expect(enqueueCampaignSend).not.toHaveBeenCalled();
  });

  it('(e) the flip into sending clears the reason', async () => {
    row.pausedReason = 'send_failed';

    await mod.resumeCampaign(ORG, CID);

    expect(row.pausedReason).toBeNull();
    // Asserted on the write as well as the row, so a future refactor that stops
    // writing the column is caught rather than passing on a stale object.
    expect(updateSets.some((s) => s.status === 'sending' && s.pausedReason === null)).toBe(true);
  });

  it('(e) resuming an operator pause clears the reason too', async () => {
    row.pausedReason = 'operator';

    await mod.resumeCampaign(ORG, CID);

    expect(row.pausedReason).toBeNull();
  });

  it('(f) a second Resume does not enqueue again — it now sees NULL', async () => {
    row.pausedReason = 'send_failed';
    await mod.resumeCampaign(ORG, CID);
    expect(enqueueCampaignSend).toHaveBeenCalledTimes(1);

    // The operator presses it again. Status is 'sending' now, and
    // sending → sending is not a legal transition, so this is refused outright.
    await expect(mod.resumeCampaign(ORG, CID)).rejects.toThrow();
    expect(enqueueCampaignSend).toHaveBeenCalledTimes(1);

    // And if the campaign lands back in paused by some other route, the reason
    // is gone, so Resume takes the safe branch rather than sending twice.
    row.status = 'paused';
    await mod.resumeCampaign(ORG, CID);
    expect(enqueueCampaignSend).toHaveBeenCalledTimes(1);
  });
});

describe('pauseCampaign / sendCampaign — who writes the reason', () => {
  it('pauseCampaign records an operator pause', async () => {
    row.status = 'sending';
    row.pausedReason = null;

    await mod.pauseCampaign(ORG, CID);

    expect(row.status).toBe('paused');
    expect(row.pausedReason).toBe('operator');
  });

  it('sendCampaign clears whatever reason was there', async () => {
    row.status = 'paused';
    row.pausedReason = 'send_failed';

    await mod.sendCampaign(ORG, CID);

    expect(row.status).toBe('sending');
    expect(row.pausedReason).toBeNull();
  });
});
