import { describe, it, expect } from 'vitest';
import { mapProfile } from './klaviyo.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'klprof_42',
    attributes: {
      email: 'a@b.cz',
      ...overrides,
    },
  } as Parameters<typeof mapProfile>[0];
}

describe('Klaviyo mapProfile', () => {
  it('maps SUBSCRIBED consent → active', () => {
    const sub = mapProfile(
      profile({
        subscriptions: {
          email: {
            marketing: {
              consent: 'SUBSCRIBED',
              consent_timestamp: '2024-04-01T08:00:00Z',
            },
          },
        },
      }),
      ORG_ID,
    );
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe('active');
    expect(sub!.customFields.imported_consent_status).toBe('SUBSCRIBED');
    expect(sub!.customFields.imported_consent_at).toBe('2024-04-01T08:00:00Z');
  });

  it('maps UNSUBSCRIBED consent → unsubscribed', () => {
    const sub = mapProfile(
      profile({
        subscriptions: {
          email: {
            marketing: { consent: 'UNSUBSCRIBED', consent_timestamp: '2024-05-01T08:00:00Z' },
          },
        },
      }),
      ORG_ID,
    );
    expect(sub!.status).toBe('unsubscribed');
    expect(sub!.customFields.imported_consent_status).toBe('UNSUBSCRIBED');
  });

  it('treats NEVER_SUBSCRIBED as unsubscribed (no implicit consent)', () => {
    const sub = mapProfile(
      profile({
        subscriptions: {
          email: { marketing: { consent: 'NEVER_SUBSCRIBED' } },
        },
        created: '2020-01-01T00:00:00Z',
      }),
      ORG_ID,
    );
    expect(sub!.status).toBe('unsubscribed');
    expect(sub!.customFields.imported_consent_status).toBe('NEVER_SUBSCRIBED');
    expect(sub!.customFields.imported_consent_at).toBe('2020-01-01T00:00:00Z');
  });

  it('records consent method + method_detail when present', () => {
    const sub = mapProfile(
      profile({
        subscriptions: {
          email: {
            marketing: {
              consent: 'SUBSCRIBED',
              consent_timestamp: '2024-04-01T08:00:00Z',
              method: 'FORM',
              method_detail: 'Shopify checkout footer',
            },
          },
        },
      }),
      ORG_ID,
    );
    expect(sub!.customFields.imported_consent_method).toBe('FORM');
    expect(sub!.customFields.imported_consent_method_detail).toBe(
      'Shopify checkout footer',
    );
  });

  it('falls back to attributes.created when consent_timestamp is missing', () => {
    const sub = mapProfile(
      profile({
        subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
        created: '2022-06-15T12:00:00Z',
      }),
      ORG_ID,
    );
    expect(sub!.customFields.imported_consent_at).toBe('2022-06-15T12:00:00Z');
  });

  it('skips profiles with missing or invalid email', () => {
    expect(mapProfile(profile({ email: null }), ORG_ID)).toBeNull();
    expect(mapProfile(profile({ email: 'no-at-sign' }), ORG_ID)).toBeNull();
  });

  it('lowercases + trims the email', () => {
    const sub = mapProfile(profile({ email: '  HELLO@Example.CZ ' }), ORG_ID);
    expect(sub!.email).toBe('hello@example.cz');
  });

  it('preserves Klaviyo profile ID as imported_external_id', () => {
    const sub = mapProfile(profile(), ORG_ID);
    expect(sub!.customFields.imported_external_id).toBe('klprof_42');
  });

  it('namespaces properties under klaviyo_custom', () => {
    const sub = mapProfile(
      profile({
        properties: { lifetime_value: 1234, fav_brand: 'Pilsner' },
      }),
      ORG_ID,
    );
    expect(sub!.customFields.klaviyo_custom).toEqual({
      lifetime_value: 1234,
      fav_brand: 'Pilsner',
    });
  });

  it('omits klaviyo_custom when properties are empty / missing', () => {
    const sub1 = mapProfile(profile({ properties: {} }), ORG_ID);
    const sub2 = mapProfile(profile({}), ORG_ID);
    expect('klaviyo_custom' in sub1!.customFields).toBe(false);
    expect('klaviyo_custom' in sub2!.customFields).toBe(false);
  });

  it('preserves organization label when set', () => {
    const sub = mapProfile(profile({ organization: 'Acme Spol. s r.o.' }), ORG_ID);
    expect(sub!.customFields.imported_organization).toBe('Acme Spol. s r.o.');
  });

  it('tags imported_from = "klaviyo"', () => {
    const sub = mapProfile(profile(), ORG_ID);
    expect(sub!.customFields.imported_from).toBe('klaviyo');
  });

  it('handles uppercase/lowercase consent values consistently', () => {
    const sub = mapProfile(
      profile({
        subscriptions: { email: { marketing: { consent: 'subscribed' } } },
      }),
      ORG_ID,
    );
    expect(sub!.status).toBe('active');
    expect(sub!.customFields.imported_consent_status).toBe('SUBSCRIBED');
  });
});
