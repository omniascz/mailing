/**
 * Which contacts and which suppression reasons batch-sender lets through for a
 * flow's template e-mail, with the flow's transactional exception and without
 * it (Z158 — Michal, 15. 10. 6:10, point 1b).
 *
 * The real processBatchSender, with the API answered by a stand-in fetch and
 * the MTA queue by a stand-in that records the jobs. Asserted: the statuses
 * refused, the `reasons` sent to /internal/suppressions/check-batch, and the
 * purpose each mta job carries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';

const enqueued: Array<{ name: string; data: Record<string, unknown> }> = [];
const fakeQueue = {
  addBulk: async (jobs: Array<{ name: string; data: Record<string, unknown> }>) => {
    enqueued.push(...jobs);
  },
};

// Stand-ins for the modules that would open a Redis or Postgres connection on import.
vi.mock('../queues/index.js', () => ({
  connection: {},
  QUEUE_NAMES: {},
  detectIsp: () => 'other',
  getMtaQueue: () => fakeQueue,
}));
vi.mock('@forgemsg/api/services/campaigns/email-coupon-merge', () => ({
  resolveEmailCouponTags: async (s: string) => s,
}));
vi.mock('@forgemsg/api/services/dedicated-ips', () => ({
  pickIpForSend: async () => null,
  recordIpSend: async () => {},
}));

const { processBatchSender } = await import('./batch-sender.js');

const ORG = '00000000-0000-4000-8000-000000000001';
const STATUSES = [
  'active',
  'pending',
  'archived',
  'unsubscribed',
  'complained',
  'bounced',
  'non_subscribed',
] as const;
const contactId = (i: number) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
const contacts = STATUSES.map((status, i) => ({
  id: contactId(i),
  email: `${status}@example.test`,
  firstName: null,
  lastName: null,
  customFields: {},
  status,
}));

let suppressionBodies: Array<Record<string, unknown>> = [];
let suppressedAnswer: string[] = [];

function respond(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  enqueued.length = 0;
  suppressionBodies = [];
  suppressedAnswer = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url.includes('/internal/contacts/batch')) return respond(contacts);
      if (url.includes('/internal/suppressions/check-batch')) {
        suppressionBodies.push(body);
        return respond({ suppressed: suppressedAnswer });
      }
      if (url.includes('/internal/quiet-hours/check'))
        return respond({ inQuietHours: false, nextSendAt: null });
      if (url.includes('/internal/org/suspended')) return respond({ suspended: false });
      if (url.includes('/internal/org/tracking-strict')) return respond({ strict: false });
      if (url.includes('/internal/consent/check-batch')) return respond({ blocked: [] });
      if (url.includes('/internal/tracking-domain'))
        return respond({ baseUrl: 'https://track.example.test', branded: false });
      if (url.includes('/internal/newsletter-tiers/batch')) return respond([]);
      // Broadcast only: the campaign brake, the frequency cap and the holdout.
      if (url.includes('/dispatch-state'))
        return respond({ status: 'sending', pausedReason: null });
      if (url.includes('/internal/frequency/check-batch')) return respond({ capped: [] });
      if (url.includes('/internal/holdout/check-batch')) return respond({ heldOut: [] });
      return respond({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function job(extra: Record<string, unknown>): Job {
  const data = {
    campaignId: ORG,
    campaignIsPlaceholder: true,
    orgId: ORG,
    batchIndex: 0,
    contactIds: contacts.map((c) => c.id),
    content: { html: '<p>Ticket</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
    subject: 'Your ticket',
    fromName: '',
    fromEmail: 'noreply@example.test',
    priority: 2,
    stream: 'triggered',
    ...extra,
  };
  return {
    data,
    log: () => {},
    updateData: async () => {},
    moveToDelayed: async () => {},
  } as unknown as Job;
}

const reached = () => enqueued.map((j) => String(j.data.toEmail).split('@')[0]).sort();

describe('batch-sender — the flow transactional exception on the template branch (Z158)', () => {
  it('without the flag: only active and non_subscribed, every reason, no purpose (as before)', async () => {
    await processBatchSender(job({}) as never);
    expect(reached()).toEqual(['active', 'non_subscribed']);
    expect(suppressionBodies).toHaveLength(1);
    expect(suppressionBodies[0]).not.toHaveProperty('reasons');
    for (const j of enqueued) expect(j.data).not.toHaveProperty('purpose');
  });

  it('with the flag: pending, archived, unsubscribed and complained pass; bounced does not', async () => {
    await processBatchSender(job({ flowTransactional: true }) as never);
    expect(reached()).toEqual([
      'active',
      'archived',
      'complained',
      'non_subscribed',
      'pending',
      'unsubscribed',
    ]);
  });

  it("with the flag: only the transactional reasons count, and every mta job says 'flow_transactional'", async () => {
    await processBatchSender(job({ flowTransactional: true }) as never);
    expect(suppressionBodies).toHaveLength(1);
    expect(suppressionBodies[0]!.reasons).toEqual([
      'hard_bounce',
      'complaint',
      'manual',
      'block',
      'invalid_email',
    ]);
    expect(enqueued.length).toBeGreaterThan(0);
    for (const j of enqueued) {
      expect(j.data.purpose).toBe('flow_transactional');
      expect(j.data.stream).toBe('triggered');
    }
  });

  it('with the flag: an address the suppression check returns is still skipped', async () => {
    suppressedAnswer = ['pending@example.test'];
    await processBatchSender(job({ flowTransactional: true }) as never);
    expect(reached()).not.toContain('pending');
    expect(reached()).toContain('archived');
  });

  it('the flag on a broadcast job changes nothing', async () => {
    await processBatchSender(job({ flowTransactional: true, stream: 'broadcast' }) as never);
    expect(reached()).toEqual(['active', 'non_subscribed']);
    expect(suppressionBodies[0]).not.toHaveProperty('reasons');
    for (const j of enqueued) expect(j.data).not.toHaveProperty('purpose');
  });

  it('flowTransactional: false is the same as no flag', async () => {
    await processBatchSender(job({ flowTransactional: false }) as never);
    expect(reached()).toEqual(['active', 'non_subscribed']);
    expect(suppressionBodies[0]).not.toHaveProperty('reasons');
  });
});

// Z166 — Michal, 14. 10. 22:10, point 3: a flow's marketing node skips
// non_subscribed "jako kampaň". The dispatch marks every template-branch job it
// does not mark flowTransactional with flowMarketing.
describe('batch-sender — a flow marketing node skips non_subscribed (Z166)', () => {
  it('flowMarketing on the triggered stream: only active, every reason, no purpose', async () => {
    await processBatchSender(job({ flowMarketing: true }) as never);
    expect(reached()).toEqual(['active']);
    expect(suppressionBodies).toHaveLength(1);
    expect(suppressionBodies[0]).not.toHaveProperty('reasons');
    for (const j of enqueued) expect(j.data).not.toHaveProperty('purpose');
  });

  it('flowMarketing on a broadcast job changes nothing (not by the stream alone either)', async () => {
    await processBatchSender(job({ flowMarketing: true, stream: 'broadcast' }) as never);
    expect(reached()).toEqual(['active', 'non_subscribed']);
  });

  it('flowMarketing: false is the same as no flag', async () => {
    await processBatchSender(job({ flowMarketing: false }) as never);
    expect(reached()).toEqual(['active', 'non_subscribed']);
  });

  it('with flowTransactional the flowMarketing flag is not read', async () => {
    await processBatchSender(job({ flowTransactional: true, flowMarketing: true }) as never);
    expect(reached()).toEqual([
      'active',
      'archived',
      'complained',
      'non_subscribed',
      'pending',
      'unsubscribed',
    ]);
    for (const j of enqueued) expect(j.data.purpose).toBe('flow_transactional');
  });
});
