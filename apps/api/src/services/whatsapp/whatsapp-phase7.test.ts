/**
 * Phase 7.7–7.9 tests: WhatsApp template management, rich messaging, compliance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaWhatsAppAdapter } from '../../channels/whatsapp/meta-adapter.js';
import {
  buildButtonPayloadForTest,
  buildListPayloadForTest,
  buildMediaPayloadForTest,
} from './rich-messaging-test-exports.js';

// ─── Mock DB (vi.hoisted so it's available when vi.mock factory runs) ─────────

const { mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    onConflictDoNothing: vi.fn(),
  };
  return { mockDb: db };
});

vi.mock('../../db/client.js', () => ({ db: mockDb }));

function resetChain(limitValue: unknown[] = []) {
  for (const fn of Object.values(mockDb) as ReturnType<typeof vi.fn>[]) {
    fn.mockReset();
    fn.mockReturnValue(mockDb);
  }
  mockDb.limit.mockResolvedValue(limitValue);
  mockDb.returning.mockResolvedValue([
    { id: 'tmpl-001', orgId: 'org1', status: 'draft', name: 'test' },
  ]);
}

beforeEach(() => resetChain());

// ─── WA template CRUD ─────────────────────────────────────────────────────────

describe('WhatsApp template management', () => {
  it('createWaTemplate returns a template row', async () => {
    const { createWaTemplate } = await import('./templates.js');
    const result = await createWaTemplate('org1', {
      name: 'Hello World',
      components: [{ type: 'BODY', text: 'Hello {{1}}!' }],
    });
    expect(result).toBeDefined();
    expect(result!.id).toBe('tmpl-001');
  });

  it('getWaTemplate throws NOT_FOUND when DB returns []', async () => {
    mockDb.limit.mockResolvedValue([]);
    const { getWaTemplate } = await import('./templates.js');
    await expect(getWaTemplate('nonexistent', 'org1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('submitWaTemplateForApproval calls Meta API and sets pending', async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'tmpl-001',
        orgId: 'org1',
        status: 'draft',
        name: 'hello_world',
        category: 'utility',
        language: 'en_US',
        components: [{ type: 'BODY', text: 'Hello!' }],
      },
    ]);
    mockDb.returning.mockResolvedValueOnce([
      { id: 'tmpl-001', status: 'pending', metaTemplateId: 'meta-123' },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'meta-123', status: 'PENDING' }),
    } as unknown as Response);

    const { submitWaTemplateForApproval } = await import('./templates.js');
    const result = await submitWaTemplateForApproval('tmpl-001', 'org1', 'token', 'waba-1');

    expect(result.status).toBe('pending');
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('syncWaTemplateStatus updates to approved', async () => {
    mockDb.returning.mockResolvedValueOnce([
      { id: 'tmpl-001', status: 'approved', approvedAt: new Date() },
    ]);
    const { syncWaTemplateStatus } = await import('./templates.js');
    const result = await syncWaTemplateStatus('org1', 'hello_world', 'en_US', 'APPROVED');
    expect(result?.status).toBe('approved');
  });

  it('syncWaTemplateStatus stores rejection reason', async () => {
    mockDb.returning.mockResolvedValueOnce([
      {
        id: 'tmpl-001',
        status: 'rejected',
        rejectionReason: 'Content policy violation',
      },
    ]);
    const { syncWaTemplateStatus } = await import('./templates.js');
    const result = await syncWaTemplateStatus(
      'org1',
      'promo',
      'en_US',
      'REJECTED',
      'Content policy violation',
    );
    expect(result?.status).toBe('rejected');
    expect(result?.rejectionReason).toBe('Content policy violation');
  });
});

// ─── Rich messaging payload builders ─────────────────────────────────────────

describe('RichWhatsAppSender payload builders', () => {
  it('button payload limits to max 3 buttons', () => {
    const payload = buildButtonPayloadForTest('12025550100', {
      body: 'Pick an option',
      buttons: [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn2', title: 'Option 2' },
        { id: 'btn3', title: 'Option 3' },
        { id: 'btn4', title: 'Option 4 (ignored)' },
      ],
    });
    expect(payload.interactive.action.buttons).toHaveLength(3);
  });

  it('button title is truncated to 20 chars', () => {
    const payload = buildButtonPayloadForTest('12025550100', {
      body: 'Pick',
      buttons: [{ id: 'b1', title: 'A very long button title text goes here' }],
    });
    expect(payload.interactive.action.buttons[0]!.reply.title.length).toBe(20);
  });

  it('list payload preserves sections and rows', () => {
    const payload = buildListPayloadForTest('12025550100', {
      body: 'Choose a plan',
      buttonLabel: 'View Plans',
      sections: [
        {
          title: 'Monthly',
          rows: [
            { id: 'free', title: 'Free', description: '0 contacts' },
            { id: 'pro', title: 'Pro', description: '10k contacts' },
          ],
        },
      ],
    });
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.sections[0]!.rows).toHaveLength(2);
    expect(payload.interactive.action.button).toBe('View Plans');
  });

  it('list buttonLabel truncated to 20 chars', () => {
    const payload = buildListPayloadForTest('12025550100', {
      body: 'b',
      buttonLabel: 'A very long list button text here',
      sections: [],
    });
    expect(payload.interactive.action.button.length).toBe(20);
  });

  it('media payload image has correct type and link', () => {
    const payload = buildMediaPayloadForTest('12025550100', {
      type: 'image',
      link: 'https://example.com/img.jpg',
      caption: 'Check this out!',
    });
    expect(payload.type).toBe('image');
    const p = payload as { image?: { link?: string; caption?: string } };
    expect(p.image?.link).toBe('https://example.com/img.jpg');
    expect(p.image?.caption).toBe('Check this out!');
  });

  it('media payload document includes filename', () => {
    const payload = buildMediaPayloadForTest('12025550100', {
      type: 'document',
      link: 'https://example.com/file.pdf',
      filename: 'invoice.pdf',
    });
    const p = payload as { document?: { filename?: string } };
    expect(p.document?.filename).toBe('invoice.pdf');
  });

  it('media payload video has no filename field', () => {
    const payload = buildMediaPayloadForTest('12025550100', {
      type: 'video',
      link: 'https://example.com/video.mp4',
    });
    const p = payload as { video?: { filename?: string } };
    expect(p.video?.filename).toBeUndefined();
  });
});

// ─── MetaWhatsApp adapter ─────────────────────────────────────────────────────

describe('MetaWhatsAppAdapter — template parameters', () => {
  let adapter: MetaWhatsAppAdapter;

  beforeEach(() => {
    adapter = new MetaWhatsAppAdapter({ phoneNumberId: '1234', accessToken: 'token' });
    vi.restoreAllMocks();
  });

  it('sends template with body components for multiple params', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.001' }] }),
    } as unknown as Response);

    const result = await adapter.send(
      {
        channel: 'whatsapp',
        content: {
          kind: 'whatsapp',
          templateId: 'order_update',
          parameters: { order: '12345', status: 'shipped' },
        },
        orgId: 'org1',
      },
      { contactId: 'c1', phone: '+12025550100' },
    );

    expect(result.messageId).toBe('wamid.001');
    const callBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(callBody.template.components[0].type).toBe('body');
    expect(callBody.template.components[0].parameters).toHaveLength(2);
  });

  it('sends template with no components when parameters is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.002' }] }),
    } as unknown as Response);

    await adapter.send(
      {
        channel: 'whatsapp',
        content: { kind: 'whatsapp', templateId: 'simple_template', parameters: {} },
        orgId: 'org1',
      },
      { contactId: 'c1', phone: '+12025550100' },
    );

    const callBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(callBody.template.components).toBeUndefined();
  });
});

// ─── WhatsApp compliance ──────────────────────────────────────────────────────

describe('WhatsApp compliance', () => {
  beforeEach(() => resetChain());

  it('checkWaCompliance passes for utility (no consent needed)', async () => {
    const { checkWaCompliance } = await import('./compliance.js');
    await expect(checkWaCompliance('org1', '+1234567890', 'utility')).resolves.toBeUndefined();
  });

  it('checkWaCompliance passes for authentication (no consent needed)', async () => {
    const { checkWaCompliance } = await import('./compliance.js');
    await expect(
      checkWaCompliance('org1', '+1234567890', 'authentication'),
    ).resolves.toBeUndefined();
  });

  it('checkWaCompliance blocks marketing when no consent (DB returns [])', async () => {
    mockDb.limit.mockResolvedValue([]);
    const { checkWaCompliance } = await import('./compliance.js');
    await expect(checkWaCompliance('org1', '+1234567890', 'marketing')).rejects.toMatchObject({
      code: 'WA_COMPLIANCE_BLOCKED',
    });
  });

  it('checkWaCompliance allows marketing when consent exists', async () => {
    mockDb.limit.mockResolvedValue([{ id: 'consent-1' }]);
    const { checkWaCompliance } = await import('./compliance.js');
    await expect(checkWaCompliance('org1', '+1234567890', 'marketing')).resolves.toBeUndefined();
  });

  it('updateQualityRating stores RED', async () => {
    mockDb.returning.mockResolvedValue([{ id: 'pn-1', qualityRating: 'RED' }]);
    const { updateQualityRating } = await import('./compliance.js');
    const result = await updateQualityRating('org1', 'phone1', 'RED');
    expect(result?.qualityRating).toBe('RED');
  });

  it('updateMessagingLimitTier normalizes TIER_10K → 10000', async () => {
    let capturedSetData: Record<string, unknown> = {};
    mockDb.set.mockImplementation((data: Record<string, unknown>) => {
      capturedSetData = data;
      return mockDb;
    });
    mockDb.returning.mockResolvedValue([{ messagingLimitTier: '10000' }]);

    const { updateMessagingLimitTier } = await import('./compliance.js');
    await updateMessagingLimitTier('org1', 'phone1', 'TIER_10K');
    expect(capturedSetData.messagingLimitTier).toBe('10000');
  });

  it('updateMessagingLimitTier normalizes TIER_UNLIMITED', async () => {
    let capturedSetData: Record<string, unknown> = {};
    mockDb.set.mockImplementation((data: Record<string, unknown>) => {
      capturedSetData = data;
      return mockDb;
    });
    mockDb.returning.mockResolvedValue([{ messagingLimitTier: 'UNLIMITED' }]);

    const { updateMessagingLimitTier } = await import('./compliance.js');
    await updateMessagingLimitTier('org1', 'phone1', 'TIER_UNLIMITED');
    expect(capturedSetData.messagingLimitTier).toBe('UNLIMITED');
  });
});
