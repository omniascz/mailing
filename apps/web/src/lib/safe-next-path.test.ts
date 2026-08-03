import { describe, it, expect } from 'vitest';
import { safeNextPath, DEFAULT_AFTER_LOGIN } from './safe-next-path';

/**
 * `next` is attacker-controlled, so this is a security boundary rather than a
 * convenience helper: anything that escapes the origin turns /login into an
 * open redirect.
 */
describe('safeNextPath', () => {
  it('allows same-origin paths', () => {
    expect(safeNextPath('/campaigns')).toBe('/campaigns');
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/campaigns?id=1&x=2')).toBe('/campaigns?id=1&x=2');
    expect(safeNextPath('/contacts/abc-123')).toBe('/contacts/abc-123');
    expect(safeNextPath('/reports#section')).toBe('/reports#section');
  });

  it('falls back to the root when next is missing', () => {
    expect(safeNextPath('')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.com')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('//evil.com/path')).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('rejects absolute URLs', () => {
    expect(safeNextPath('https://evil.com')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('http://evil.com/x')).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('rejects backslash bypasses', () => {
    expect(safeNextPath('/\\evil.com')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('/\\\\evil.com')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('/campaigns\\..\\x')).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('rejects non-http schemes', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('data:text/html,<script>')).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('rejects control-character smuggling', () => {
    expect(safeNextPath('/\nhttps://evil.com')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath('/\tfoo')).toBe(DEFAULT_AFTER_LOGIN);
  });
});
