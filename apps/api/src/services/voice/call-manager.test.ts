/**
 * Tests for voice call management (task 8.17).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCall,
  getCall,
  completeCall,
  getCallStats,
  queueOutboundCall,
} from './call-manager.js';
/**
 * vitest reuses a forked worker across test files, so a replaced global.fetch
 * outlives this one unless it is put back. A leaked stub is worse than a leaked
 * env var: the next file's real network call silently gets this file's canned
 * response.
 */
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.unstubAllEnvs();
});

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const db = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return { mockDb: db };
});

vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('@forgemsg/shared/redis', () => ({
  redis: {
    llen: vi.fn().mockResolvedValue(0),
    rpush: vi.fn().mockResolvedValue(1),
    lrem: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.returning.mockResolvedValue([]);
  mockDb.limit.mockResolvedValue([]);
  // Twilio env for these tests. vi.stubEnv rather than assignment because
  // vi.unstubAllEnvs below puts them back — API_URL in particular is read by
  // other modules, and a forked worker is reused for the next test file.
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'test-sid');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token');
  vi.stubEnv('TWILIO_FROM_NUMBER', '+15551234567');
  vi.stubEnv('API_URL', 'http://localhost:3001');
});

// ─── Call creation ─────────────────────────────────────────────────────────

describe('createCall', () => {
  it('creates a call record with minimal params', async () => {
    const mockCall = {
      id: 'call-001',
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: null,
      scenarioId: null,
      status: 'completed',
      durationSeconds: 0,
      recordingUrl: null,
      transcript: null,
      aiSummary: null,
      outcome: null,
      cost: '0.00',
      twilioCallSid: null,
      twilioRecordingSid: null,
      createdAt: new Date(),
    };

    mockDb.returning.mockResolvedValueOnce([mockCall]);

    const call = await createCall({
      orgId: 'org-1',
      contactId: 'contact-1',
      status: 'completed',
    });

    expect(call.id).toBe('call-001');
    expect(call.status).toBe('completed');
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('creates a call with all optional params', async () => {
    const mockCall = {
      id: 'call-002',
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: 'camp-1',
      scenarioId: 'scenario-1',
      status: 'voicemail' as const,
      durationSeconds: 45,
      recordingUrl: 's3://bucket/call-002.wav',
      transcript: 'Hello, please call back',
      aiSummary: 'Voicemail left',
      outcome: { voicemail: true, message_length: 15 },
      cost: '0.50',
      twilioCallSid: 'CA123456',
      twilioRecordingSid: 'RE789012',
      createdAt: new Date(),
    };

    mockDb.returning.mockResolvedValueOnce([mockCall]);

    const call = await createCall({
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: 'camp-1',
      scenarioId: 'scenario-1',
      status: 'voicemail',
      durationSeconds: 45,
      recordingUrl: 's3://bucket/call-002.wav',
      transcript: 'Hello, please call back',
      aiSummary: 'Voicemail left',
      outcome: { voicemail: true, message_length: 15 },
      cost: 0.5,
      twilioCallSid: 'CA123456',
      twilioRecordingSid: 'RE789012',
    });

    expect(call.campaignId).toBe('camp-1');
    expect(call.status).toBe('voicemail');
    expect(call.durationSeconds).toBe(45);
    expect(call.transcript).toBe('Hello, please call back');
  });
});

// ─── Call lookup ──────────────────────────────────────────────────────────

describe('getCall', () => {
  it('returns call for matching ID and org', async () => {
    const mockCall = {
      id: 'call-001',
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: null,
      scenarioId: null,
      status: 'completed' as const,
      durationSeconds: 120,
      recordingUrl: null,
      transcript: null,
      aiSummary: null,
      outcome: null,
      cost: '0.00',
      twilioCallSid: null,
      twilioRecordingSid: null,
      createdAt: new Date(),
    };

    mockDb.limit.mockResolvedValueOnce([mockCall]);

    const call = await getCall('call-001', 'org-1');

    expect(call).not.toBeNull();
    expect(call!.id).toBe('call-001');
    expect(call!.durationSeconds).toBe(120);
  });

  it('returns null for call not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const call = await getCall('nonexistent', 'org-1');

    expect(call).toBeNull();
  });

  it('returns null if org_id does not match', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const call = await getCall('call-001', 'org-OTHER');

    expect(call).toBeNull();
  });
});

// ─── Call completion ──────────────────────────────────────────────────────

describe('completeCall', () => {
  it('updates call with final status and duration', async () => {
    const updatedCall = {
      id: 'call-001',
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: null,
      scenarioId: null,
      status: 'completed' as const,
      durationSeconds: 180,
      recordingUrl: 's3://bucket/rec.wav',
      transcript: 'Full conversation',
      aiSummary: 'Positive interaction',
      outcome: { confirmed: true },
      cost: '0.25',
      twilioCallSid: null,
      twilioRecordingSid: 'RE456789',
      createdAt: new Date(),
    };

    mockDb.returning.mockResolvedValueOnce([updatedCall]);

    const call = await completeCall('call-001', 'org-1', {
      status: 'completed',
      durationSeconds: 180,
      recordingUrl: 's3://bucket/rec.wav',
      transcript: 'Full conversation',
      aiSummary: 'Positive interaction',
      outcome: { confirmed: true },
      cost: 0.25,
      twilioRecordingSid: 'RE456789',
    });

    expect(call).not.toBeNull();
    expect(call!.status).toBe('completed');
    expect(call!.durationSeconds).toBe(180);
  });
});

// ─── Call statistics ───────────────────────────────────────────────────────

describe('getCallStats', () => {
  it('calculates stats for campaign with mixed call outcomes', async () => {
    const mockCalls = [
      {
        id: 'c1',
        status: 'completed' as const,
        durationSeconds: 120,
        cost: '0.25',
        orgId: 'org-1',
        contactId: 'contact-1',
        campaignId: 'camp-1',
        scenarioId: null,
        recordingUrl: null,
        transcript: null,
        aiSummary: null,
        outcome: null,
        twilioCallSid: null,
        twilioRecordingSid: null,
        createdAt: new Date(),
      },
      {
        id: 'c2',
        status: 'completed' as const,
        durationSeconds: 90,
        cost: '0.25',
        orgId: 'org-1',
        contactId: 'contact-1',
        campaignId: 'camp-1',
        scenarioId: null,
        recordingUrl: null,
        transcript: null,
        aiSummary: null,
        outcome: null,
        twilioCallSid: null,
        twilioRecordingSid: null,
        createdAt: new Date(),
      },
      {
        id: 'c3',
        status: 'voicemail' as const,
        durationSeconds: 30,
        cost: '0.20',
        orgId: 'org-1',
        contactId: 'contact-1',
        campaignId: 'camp-1',
        scenarioId: null,
        recordingUrl: null,
        transcript: null,
        aiSummary: null,
        outcome: null,
        twilioCallSid: null,
        twilioRecordingSid: null,
        createdAt: new Date(),
      },
      {
        id: 'c4',
        status: 'no_answer' as const,
        durationSeconds: 0,
        cost: '0.15',
        orgId: 'org-1',
        contactId: 'contact-1',
        campaignId: 'camp-1',
        scenarioId: null,
        recordingUrl: null,
        transcript: null,
        aiSummary: null,
        outcome: null,
        twilioCallSid: null,
        twilioRecordingSid: null,
        createdAt: new Date(),
      },
      {
        id: 'c5',
        status: 'failed' as const,
        durationSeconds: 0,
        cost: '0.00',
        orgId: 'org-1',
        contactId: 'contact-1',
        campaignId: 'camp-1',
        scenarioId: null,
        recordingUrl: null,
        transcript: null,
        aiSummary: null,
        outcome: null,
        twilioCallSid: null,
        twilioRecordingSid: null,
        createdAt: new Date(),
      },
    ];

    mockDb.limit.mockResolvedValueOnce(mockCalls);

    const stats = await getCallStats('camp-1', 'org-1');

    expect(stats.totalCalls).toBe(5);
    expect(stats.completedCalls).toBe(2);
    expect(stats.answeredCalls).toBe(3); // completed (2) + voicemail (1)
    expect(stats.noAnswerCalls).toBe(1);
    expect(stats.voicemailCalls).toBe(1);
    expect(stats.failedCalls).toBe(1);
    expect(stats.avgDurationSeconds).toBe(48); // (120 + 90 + 30) / 5 = 48
    expect(stats.answerRate).toBe(60); // 3 answered / 5 total = 60%
  });

  it('returns zero stats for campaign with no calls', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const stats = await getCallStats('camp-1', 'org-1');

    expect(stats.totalCalls).toBe(0);
    expect(stats.answerRate).toBe(0);
    expect(stats.avgDurationSeconds).toBe(0);
  });
});

// ─── Concurrent call limiting ──────────────────────────────────────────────

describe('queueOutboundCall', () => {
  it('queues call when capacity available', async () => {
    const mockCall = {
      id: 'call-new',
      orgId: 'org-1',
      contactId: 'contact-1',
      campaignId: null,
      scenarioId: null,
      status: 'completed' as const,
      durationSeconds: 0,
      recordingUrl: null,
      transcript: null,
      aiSummary: null,
      outcome: null,
      cost: '0.00',
      twilioCallSid: null,
      twilioRecordingSid: null,
      createdAt: new Date(),
    };

    mockDb.returning.mockResolvedValueOnce([mockCall]);

    // Mock Twilio API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'CA12345' }),
    } as unknown as Response);

    const callId = await queueOutboundCall({
      orgId: 'org-1',
      contactId: 'contact-1',
      phone: '+12025550100',
    });

    expect(callId).toBe('call-new');
  });

  it('returns null when at max concurrent calls', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    vi.mocked(redis).llen.mockResolvedValueOnce(5);

    const callId = await queueOutboundCall({
      orgId: 'org-1',
      contactId: 'contact-1',
      phone: '+12025550100',
    });

    expect(callId).toBeNull();
  });
});
