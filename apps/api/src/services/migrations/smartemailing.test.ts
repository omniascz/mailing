import { describe, it, expect } from 'vitest';
import { mapSubscriber } from './smartemailing.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function row(overrides: Record<string, unknown> = {}) {
  return {
    contact: {
      id: 1,
      emailaddress: 'a@b.cz',
      ...overrides,
    },
    status: 'confirmed',
    updated: '2024-01-01T00:00:00Z',
  } as Parameters<typeof mapSubscriber>[0];
}

describe('SmartEmailing mapSubscriber', () => {
  it('prefers GDPR consent_at over row.updated and contact.created', () => {
    const sub = mapSubscriber(
      row({
        gdpr: { consent_at: '2024-05-10T09:00:00Z', consent_source: 'web_form' },
        created: '2020-01-01T00:00:00Z',
      }),
      ORG_ID,
    );
    expect(sub).not.toBeNull();
    expect(sub!.customFields.imported_consent_at).toBe('2024-05-10T09:00:00Z');
    expect(sub!.customFields.imported_consent_source).toBe('web_form');
  });

  it('falls back to row.updated, then contact.created when gdpr.consent_at is missing', () => {
    const sub1 = mapSubscriber(row({ created: '2020-01-01T00:00:00Z' }), ORG_ID);
    expect(sub1!.customFields.imported_consent_at).toBe('2024-01-01T00:00:00Z');

    const sub2 = mapSubscriber(
      {
        contact: { id: 1, emailaddress: 'a@b.cz', created: '2020-01-01T00:00:00Z' },
        status: 'confirmed',
      } as Parameters<typeof mapSubscriber>[0],
      ORG_ID,
    );
    expect(sub2!.customFields.imported_consent_at).toBe('2020-01-01T00:00:00Z');
  });

  it('preserves consent IP and note when present', () => {
    const sub = mapSubscriber(
      row({
        gdpr: {
          consent_at: '2024-05-10T09:00:00Z',
          consent_ip: '203.0.113.42',
          consent_note: 'Submitted via product page footer',
        },
      }),
      ORG_ID,
    );
    expect(sub!.customFields.imported_consent_ip).toBe('203.0.113.42');
    expect(sub!.customFields.imported_consent_note).toBe('Submitted via product page footer');
  });

  it('lowercases + trims emailaddress', () => {
    const sub = mapSubscriber(row({ emailaddress: '  HELLO@Example.CZ ' }), ORG_ID);
    expect(sub!.email).toBe('hello@example.cz');
  });

  it('returns null for missing / malformed emails', () => {
    expect(mapSubscriber(row({ emailaddress: '' }), ORG_ID)).toBeNull();
    expect(mapSubscriber(row({ emailaddress: 'invalid-no-at' }), ORG_ID)).toBeNull();
  });

  it('skips bounce and spam_complaint statuses', () => {
    const r1 = { ...row(), status: 'bounce' };
    const r2 = { ...row(), status: 'spam_complaint' };
    expect(mapSubscriber(r1, ORG_ID)).toBeNull();
    expect(mapSubscriber(r2, ORG_ID)).toBeNull();
  });

  it('maps confirmed + subscribed → active', () => {
    const sub1 = mapSubscriber({ ...row(), status: 'confirmed' }, ORG_ID);
    const sub2 = mapSubscriber({ ...row(), status: 'subscribed' }, ORG_ID);
    expect(sub1!.status).toBe('active');
    expect(sub2!.status).toBe('active');
  });

  it('maps unsubscribed → unsubscribed', () => {
    const sub = mapSubscriber({ ...row(), status: 'unsubscribed' }, ORG_ID);
    expect(sub!.status).toBe('unsubscribed');
  });

  it('records source-side numeric ID for round-trip debugging', () => {
    const sub = mapSubscriber(row({ id: 42 }), ORG_ID);
    expect(sub!.customFields.imported_external_id).toBe('42');
  });

  it('flattens customfields_values into a named map under smartemailing_custom', () => {
    const sub = mapSubscriber(
      row({
        customfields_values: [
          { id: 10, name: 'loyalty_tier', value: 'gold' },
          { id: 11, name: 'favourite_brand', value: 'Bohemia' },
        ],
      }),
      ORG_ID,
    );
    expect(sub!.customFields.smartemailing_custom).toEqual({
      loyalty_tier: 'gold',
      favourite_brand: 'Bohemia',
    });
  });

  it('falls back to cf_{id} key when a custom field has no name', () => {
    const sub = mapSubscriber(
      row({
        customfields_values: [{ id: 99, value: 'unnamed-value' }],
      }),
      ORG_ID,
    );
    expect((sub!.customFields.smartemailing_custom as Record<string, unknown>).cf_99).toBe(
      'unnamed-value',
    );
  });

  it('tags imported_from = "smartemailing"', () => {
    const sub = mapSubscriber(row(), ORG_ID);
    expect(sub!.customFields.imported_from).toBe('smartemailing');
  });
});
