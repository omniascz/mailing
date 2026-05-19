import { describe, it, expect } from 'vitest';
import { mapSubscriber } from './ecomail.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('Ecomail mapSubscriber', () => {
  it('preserves the original consent timestamp into customFields', () => {
    const sub = mapSubscriber(
      {
        email: 'Petr@Example.cz',
        name: 'Petr',
        surname: 'Novák',
        status: 'subscribed',
        created_at: '2024-03-15T10:30:00Z',
        subscribed_at: '2024-03-15T10:35:00Z',
      },
      ORG_ID,
    );
    expect(sub).not.toBeNull();
    expect(sub!.customFields).toMatchObject({
      imported_from: 'ecomail',
      imported_consent_at: '2024-03-15T10:35:00Z',
      imported_consent_status: 'subscribed',
    });
  });

  it('falls back to created_at when subscribed_at is missing', () => {
    const sub = mapSubscriber(
      {
        email: 'a@b.cz',
        created_at: '2023-01-01T00:00:00Z',
        status: 'subscribed',
      },
      ORG_ID,
    );
    expect(sub!.customFields.imported_consent_at).toBe('2023-01-01T00:00:00Z');
  });

  it('lowercases + trims the email', () => {
    const sub = mapSubscriber(
      { email: '  HELLO@Example.CZ  ', status: 'subscribed' },
      ORG_ID,
    );
    expect(sub!.email).toBe('hello@example.cz');
  });

  it('returns null for invalid / missing email', () => {
    expect(mapSubscriber({ email: '' }, ORG_ID)).toBeNull();
    expect(mapSubscriber({ email: 'no-at-sign' }, ORG_ID)).toBeNull();
  });

  it('skips hard-bounced and spam-complaint records', () => {
    expect(
      mapSubscriber({ email: 'a@b.cz', status: 'hard_bounce' }, ORG_ID),
    ).toBeNull();
    expect(
      mapSubscriber({ email: 'a@b.cz', status: 'spam_complaint' }, ORG_ID),
    ).toBeNull();
  });

  it('maps subscribed → active', () => {
    const sub = mapSubscriber({ email: 'a@b.cz', status: 'subscribed' }, ORG_ID);
    expect(sub!.status).toBe('active');
  });

  it('maps unsubscribed → unsubscribed and records unsubscribed_at', () => {
    const sub = mapSubscriber(
      {
        email: 'a@b.cz',
        status: 'unsubscribed',
        unsubscribed_at: '2024-06-01T12:00:00Z',
      },
      ORG_ID,
    );
    expect(sub!.status).toBe('unsubscribed');
    expect(sub!.customFields.imported_unsubscribed_at).toBe('2024-06-01T12:00:00Z');
  });

  it('nests Ecomail-side custom_fields under ecomail_custom namespace', () => {
    const sub = mapSubscriber(
      {
        email: 'a@b.cz',
        status: 'subscribed',
        custom_fields: { loyalty_tier: 'gold', favorite_color: 'blue' },
      },
      ORG_ID,
    );
    expect(sub!.customFields.ecomail_custom).toEqual({
      loyalty_tier: 'gold',
      favorite_color: 'blue',
    });
  });

  it('preserves the source-side numeric ID for round-trip debugging', () => {
    const sub = mapSubscriber(
      { id: 42, email: 'a@b.cz', status: 'subscribed' },
      ORG_ID,
    );
    expect(sub!.customFields.imported_external_id).toBe('42');
  });

  it('trims first/last name and falls back to null on empty strings', () => {
    const sub = mapSubscriber(
      { email: 'a@b.cz', name: '  Petr  ', surname: '', status: 'subscribed' },
      ORG_ID,
    );
    expect(sub!.firstName).toBe('Petr');
    expect(sub!.lastName).toBeNull();
  });
});
