import { describe, it, expect } from 'vitest';
import { deriveAudit } from './audit.js';

describe('deriveAudit', () => {
  it('maps POST create to <resource>.created', () => {
    expect(deriveAudit('POST', '/api/v1/campaigns')).toEqual({
      resource: 'campaigns',
      action: 'campaigns.created',
    });
  });

  it('maps DELETE to <resource>.deleted', () => {
    expect(deriveAudit('DELETE', '/api/v1/api-keys/:id')).toEqual({
      resource: 'api-keys',
      action: 'api-keys.deleted',
    });
  });

  it('maps PATCH/PUT to <resource>.updated', () => {
    expect(deriveAudit('PATCH', '/api/v1/contacts/:id')!.action).toBe('contacts.updated');
    expect(deriveAudit('PUT', '/api/v1/settings')!.action).toBe('settings.updated');
  });

  it('uses a trailing action verb when present', () => {
    expect(deriveAudit('POST', '/api/v1/campaigns/:id/send')!.action).toBe('campaigns.send');
    expect(deriveAudit('POST', '/api/v1/suppressions/:id/pause')!.action).toBe('suppressions.pause');
  });

  it('returns null for unaudited resources', () => {
    expect(deriveAudit('POST', '/api/v1/tracking/open')).toBeNull();
    expect(deriveAudit('POST', '/api/v1/internal/events')).toBeNull();
  });

  it('returns null for non-/api/v1 paths', () => {
    expect(deriveAudit('POST', '/health')).toBeNull();
  });
});
