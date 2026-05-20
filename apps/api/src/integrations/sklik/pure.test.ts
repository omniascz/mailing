import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl,
  normaliseTokenResponse,
  shouldRefresh,
  encodeForm,
  isValidRedirectUri,
  DEFAULT_SCOPES,
  SKLIK_OAUTH_AUTHORIZE_URL,
} from './pure.js';

describe('buildAuthorizeUrl', () => {
  it('builds a query-string with all required OAuth params', () => {
    const url = buildAuthorizeUrl({
      clientId: 'cid',
      redirectUri: 'https://app.forgemsg.com/oauth/sklik/callback',
      state: 's-1',
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(SKLIK_OAUTH_AUTHORIZE_URL);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://app.forgemsg.com/oauth/sklik/callback',
    );
    expect(u.searchParams.get('state')).toBe('s-1');
    expect(u.searchParams.get('scope')).toBe(DEFAULT_SCOPES.join(' '));
  });

  it('respects custom scopes', () => {
    const url = buildAuthorizeUrl({
      clientId: 'cid',
      redirectUri: 'https://x',
      state: 's',
      scopes: ['user.read', 'audience.write'],
    });
    expect(new URL(url).searchParams.get('scope')).toBe('user.read audience.write');
  });

  it('throws on missing required inputs', () => {
    expect(() => buildAuthorizeUrl({ clientId: '', redirectUri: 'https://x', state: 's' })).toThrow(
      /clientId/,
    );
    expect(() => buildAuthorizeUrl({ clientId: 'c', redirectUri: '', state: 's' })).toThrow(
      /redirectUri/,
    );
    expect(() => buildAuthorizeUrl({ clientId: 'c', redirectUri: 'https://x', state: '' })).toThrow(
      /state/,
    );
  });
});

describe('normaliseTokenResponse', () => {
  it('extracts access + refresh + expiry', () => {
    const now = new Date('2026-04-25T12:00:00Z');
    const out = normaliseTokenResponse(
      { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'user.read campaign.read' },
      now,
    );
    expect(out).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date('2026-04-25T13:00:00Z'),
      scopes: ['user.read', 'campaign.read'],
    });
  });

  it('tolerates missing refresh / expires / scope', () => {
    const out = normaliseTokenResponse({ access_token: 'a' });
    expect(out.accessToken).toBe('a');
    expect(out.refreshToken).toBeNull();
    expect(out.expiresAt).toBeNull();
    expect(out.scopes).toEqual([]);
  });

  it('throws on missing access_token', () => {
    expect(() => normaliseTokenResponse({})).toThrow(/access_token/);
    expect(() => normaliseTokenResponse(null)).toThrow();
  });
});

describe('shouldRefresh', () => {
  const now = new Date('2026-04-25T12:00:00Z');

  it('refreshes when no expiry', () => {
    expect(shouldRefresh(null, now)).toBe(true);
    expect(shouldRefresh(undefined, now)).toBe(true);
  });

  it('refreshes when within skew window', () => {
    const expiresIn30s = new Date(now.getTime() + 30_000);
    expect(shouldRefresh(expiresIn30s, now, 60)).toBe(true);
  });

  it('keeps fresh tokens', () => {
    const expiresIn5m = new Date(now.getTime() + 5 * 60 * 1000);
    expect(shouldRefresh(expiresIn5m, now, 60)).toBe(false);
  });

  it('refreshes already-expired tokens', () => {
    const past = new Date(now.getTime() - 1000);
    expect(shouldRefresh(past, now)).toBe(true);
  });
});

describe('encodeForm', () => {
  it('produces application/x-www-form-urlencoded body', () => {
    expect(encodeForm({ a: '1', b: 'two words', c: '+plus' })).toBe('a=1&b=two+words&c=%2Bplus');
  });
});

describe('isValidRedirectUri', () => {
  it('accepts https://', () => {
    expect(isValidRedirectUri('https://app.forgemsg.com/cb')).toBe(true);
  });

  it('accepts http://localhost', () => {
    expect(isValidRedirectUri('http://localhost:3000/cb')).toBe(true);
    expect(isValidRedirectUri('http://127.0.0.1:3000/cb')).toBe(true);
  });

  it('rejects plain http on a public host', () => {
    expect(isValidRedirectUri('http://example.com/cb')).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isValidRedirectUri('not-a-url')).toBe(false);
    expect(isValidRedirectUri('')).toBe(false);
  });
});
