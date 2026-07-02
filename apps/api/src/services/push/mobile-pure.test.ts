import { describe, it, expect } from 'vitest';
import {
  buildApnsPayload,
  buildApnsHeaders,
  buildFcmMessage,
  isTokenInvalidError,
} from './mobile-pure.js';

describe('buildApnsPayload', () => {
  it('builds the aps alert with default sound', () => {
    const p = buildApnsPayload({ title: 'Hi', body: 'There' });
    expect(p.aps).toEqual({ alert: { title: 'Hi', body: 'There' }, sound: 'default' });
  });

  it('sets badge, mutable-content and custom data/url', () => {
    const p = buildApnsPayload({
      title: 'T',
      body: 'B',
      badge: 3,
      url: 'app://x',
      imageUrl: 'https://img/x.png',
      data: { k: 'v' },
    });
    const aps = p.aps as Record<string, unknown>;
    expect(aps.badge).toBe(3);
    expect(aps['mutable-content']).toBe(1);
    expect(p.url).toBe('app://x');
    expect(p.image_url).toBe('https://img/x.png');
    expect(p.k).toBe('v');
  });

  it('omits mutable-content when no url/image', () => {
    const p = buildApnsPayload({ title: 'T', body: 'B' });
    expect((p.aps as Record<string, unknown>)['mutable-content']).toBeUndefined();
  });
});

describe('buildApnsHeaders', () => {
  it('defaults topic + priority 10 + alert push type', () => {
    expect(buildApnsHeaders('com.acme.app')).toEqual({
      'apns-topic': 'com.acme.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });
  });

  it('supports low priority + collapse id', () => {
    const h = buildApnsHeaders('com.acme.app', { priority: 5, collapseId: 'promo' });
    expect(h['apns-priority']).toBe('5');
    expect(h['apns-collapse-id']).toBe('promo');
  });
});

describe('buildFcmMessage', () => {
  it('wraps token + notification and coerces data to strings', () => {
    const m = buildFcmMessage('tok123', {
      title: 'T',
      body: 'B',
      url: 'app://x',
      data: { count: '5' },
    }).message as Record<string, unknown>;
    expect(m.token).toBe('tok123');
    expect(m.notification).toEqual({ title: 'T', body: 'B' });
    expect(m.data).toEqual({ url: 'app://x', count: '5' });
  });

  it('adds notification image and omits data when empty', () => {
    const m = buildFcmMessage('tok', { title: 'T', body: 'B', imageUrl: 'https://i/x.png' })
      .message as Record<string, unknown>;
    expect((m.notification as Record<string, unknown>).image).toBe('https://i/x.png');
    expect(m.data).toBeUndefined();
  });
});

describe('isTokenInvalidError', () => {
  it('flags Apple invalid-token codes', () => {
    expect(isTokenInvalidError('ios', 'BadDeviceToken')).toBe(true);
    expect(isTokenInvalidError('ios', 'Unregistered')).toBe(true);
    expect(isTokenInvalidError('ios', 'TooManyRequests')).toBe(false);
  });

  it('flags FCM invalid-token codes', () => {
    expect(isTokenInvalidError('android', 'UNREGISTERED')).toBe(true);
    expect(isTokenInvalidError('android', 'INVALID_ARGUMENT')).toBe(true);
    expect(isTokenInvalidError('android', 'INTERNAL')).toBe(false);
  });
});
