import { describe, it, expect } from 'vitest';
import { validateEmail, validateEmailSync } from './index.js';

describe('validateEmailSync', () => {
  it('returns score=0 for invalid syntax', () => {
    const result = validateEmailSync('not-an-email');
    expect(result.score).toBe(0);
    expect(result.isValid).toBe(false);
    expect(result.reasons).toContain('invalid_syntax');
  });

  it('returns score=0 for email without TLD', () => {
    const result = validateEmailSync('user@domain');
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('invalid_syntax');
  });

  it('penalizes disposable domains (-50)', () => {
    const result = validateEmailSync('user@mailinator.com');
    expect(result.isDisposable).toBe(true);
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.reasons).toContain('disposable_domain');
  });

  it('penalizes role-based prefixes (-20)', () => {
    const result = validateEmailSync('admin@example.com');
    expect(result.isRoleBased).toBe(true);
    expect(result.score).toBe(80);
    expect(result.reasons).toContain('role_based');
  });

  it('penalizes both disposable and role-based', () => {
    const result = validateEmailSync('info@yopmail.com');
    expect(result.isDisposable).toBe(true);
    expect(result.isRoleBased).toBe(true);
    expect(result.score).toBe(30);
  });

  it('returns full score for a clean personal email', () => {
    const result = validateEmailSync('john.doe@gmail.com');
    expect(result.score).toBe(100);
    expect(result.isValid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects empty string', () => {
    const result = validateEmailSync('');
    expect(result.score).toBe(0);
    expect(result.isValid).toBe(false);
  });

  it('rejects email exceeding 254 chars', () => {
    const long = 'a'.repeat(250) + '@b.com';
    const result = validateEmailSync(long);
    expect(result.score).toBe(0);
  });

  it('case-insensitive role check', () => {
    const result = validateEmailSync('Admin@example.com');
    // admin@ is role-based
    expect(result.isRoleBased).toBe(true);
  });

  it('hasMx is null for sync variant', () => {
    const result = validateEmailSync('user@example.com');
    expect(result.hasMx).toBeNull();
  });
});

describe('validateEmail (async, no MX)', () => {
  it('runs without MX lookup when checkMx=false', async () => {
    const result = await validateEmail('test@mailinator.com', { checkMx: false });
    expect(result.isDisposable).toBe(true);
    expect(result.hasMx).toBeNull();
  }, 5000);

  it('returns valid=true for common clean email (no MX check)', async () => {
    const result = await validateEmail('alice@example.com', { checkMx: false });
    expect(result.score).toBe(100);
    expect(result.isValid).toBe(true);
    expect(result.hasMx).toBeNull();
  }, 5000);
});
