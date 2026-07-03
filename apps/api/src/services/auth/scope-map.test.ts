import { describe, it, expect } from 'vitest';
import { requiredScopeFor, scopeAllows, resourceOf } from './scope-map.js';

describe('resourceOf', () => {
  it('extracts the resource after /api/v1/', () => {
    expect(resourceOf('/api/v1/contacts/123')).toBe('contacts');
    expect(resourceOf('/api/v1/campaigns?limit=10')).toBe('campaigns');
    expect(resourceOf('/track/o/abc')).toBeNull();
  });
});

describe('requiredScopeFor', () => {
  it('maps read vs write on gated resources', () => {
    expect(requiredScopeFor('GET', '/api/v1/contacts')).toBe('contacts:read');
    expect(requiredScopeFor('POST', '/api/v1/contacts')).toBe('contacts:write');
    expect(requiredScopeFor('DELETE', '/api/v1/campaigns/1')).toBe('campaigns:write');
    expect(requiredScopeFor('GET', '/api/v1/custom-fields')).toBe('custom-fields:read');
  });

  it('maps send + read-only resources', () => {
    expect(requiredScopeFor('POST', '/api/v1/transactional/email')).toBe('emails:send');
    expect(requiredScopeFor('POST', '/api/v1/emails')).toBe('emails:send');
    expect(requiredScopeFor('GET', '/api/v1/emails/1')).toBe('emails:read');
    expect(requiredScopeFor('GET', '/api/v1/analytics/compare')).toBe('analytics:read');
  });

  it('returns null for unmapped routes', () => {
    expect(requiredScopeFor('GET', '/api/v1/account/data-region')).toBeNull();
    expect(requiredScopeFor('POST', '/api/v1/auth/login')).toBeNull();
    expect(requiredScopeFor('GET', '/health')).toBeNull();
  });
});

describe('scopeAllows (backward compatible)', () => {
  it('allows JWT (undefined), legacy (empty), and wildcard keys', () => {
    expect(scopeAllows(undefined, 'POST', '/api/v1/contacts')).toBe(true);
    expect(scopeAllows([], 'POST', '/api/v1/contacts')).toBe(true);
    expect(scopeAllows(['*'], 'DELETE', '/api/v1/domains/1')).toBe(true);
  });

  it('enforces least privilege for explicitly-scoped keys', () => {
    expect(scopeAllows(['contacts:read'], 'GET', '/api/v1/contacts')).toBe(true);
    expect(scopeAllows(['contacts:read'], 'POST', '/api/v1/contacts')).toBe(false);
    expect(scopeAllows(['emails:send'], 'POST', '/api/v1/transactional/email')).toBe(true);
    expect(scopeAllows(['emails:send'], 'GET', '/api/v1/contacts')).toBe(false);
  });

  it('does not gate unmapped routes even for scoped keys', () => {
    expect(scopeAllows(['contacts:read'], 'GET', '/api/v1/account/data-region')).toBe(true);
  });
});
