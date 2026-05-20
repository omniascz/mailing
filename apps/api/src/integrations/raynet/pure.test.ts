import { describe, it, expect } from 'vitest';
import {
  buildRaynetUrl,
  buildRaynetAuthHeader,
  isValidRaynetInstance,
  normalizeRaynetContact,
  normalizeRaynetCompany,
  normalizeRaynetDeal,
} from './pure.js';

describe('buildRaynetUrl', () => {
  it('builds the canonical company URL', () => {
    expect(buildRaynetUrl('acme', '/contacts')).toBe(
      'https://app.raynet.cz/api/v2/company/acme/contacts',
    );
  });

  it('url-encodes instance names', () => {
    expect(buildRaynetUrl('Acme Co', '/x')).toBe(
      'https://app.raynet.cz/api/v2/company/acme%20co/x',
    );
  });

  it('prepends / to missing leading slash', () => {
    expect(buildRaynetUrl('acme', 'companies')).toBe(
      'https://app.raynet.cz/api/v2/company/acme/companies',
    );
  });
});

describe('buildRaynetAuthHeader', () => {
  it('base64-encodes username:apiKey', () => {
    const h = buildRaynetAuthHeader('user@acme.cz', 'SECRET');
    expect(h).toBe(`Basic ${Buffer.from('user@acme.cz:SECRET').toString('base64')}`);
  });
});

describe('isValidRaynetInstance', () => {
  it('accepts valid slugs', () => {
    expect(isValidRaynetInstance('acme')).toBe(true);
    expect(isValidRaynetInstance('acme-corp')).toBe(true);
    expect(isValidRaynetInstance('a1')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(isValidRaynetInstance('')).toBe(false);
    expect(isValidRaynetInstance('-acme')).toBe(false);
    expect(isValidRaynetInstance('acme-')).toBe(false);
    expect(isValidRaynetInstance('acme/corp')).toBe(false);
  });
});

describe('normalizeRaynetContact', () => {
  it('extracts primary email + phone from contactInfo[]', () => {
    const raw = {
      data: {
        id: 42,
        firstName: 'Petr',
        lastName: 'Novák',
        contactInfo: [
          { contactInfoType: 'email', contactInfo: 'petr@example.cz', primary: true },
          { contactInfoType: 'email', contactInfo: 'secondary@example.cz' },
          { contactInfoType: 'tel', contactInfo: '+420777123456', primary: true },
        ],
        primaryAddress: { company: { id: 99 } },
        lastActivity: '2026-04-24T10:15:30+02:00',
      },
    };
    const c = normalizeRaynetContact(raw);
    expect(c).toMatchObject({
      externalId: 42,
      email: 'petr@example.cz',
      phone: '+420777123456',
      firstName: 'Petr',
      lastName: 'Novák',
      companyExternalId: 99,
    });
    expect(c.updatedAt).toBeInstanceOf(Date);
  });

  it('falls back to first entry when no primary flag', () => {
    const c = normalizeRaynetContact({
      data: {
        id: 1,
        contactInfo: [{ contactInfoType: 'email', contactInfo: 'only@example.cz' }],
      },
    });
    expect(c.email).toBe('only@example.cz');
    expect(c.phone).toBeNull();
    expect(c.companyExternalId).toBeNull();
  });

  it('accepts payloads without the "data" wrapper', () => {
    const c = normalizeRaynetContact({ id: 7, firstName: 'Anna', contactInfo: [] });
    expect(c.externalId).toBe(7);
    expect(c.firstName).toBe('Anna');
  });
});

describe('normalizeRaynetCompany', () => {
  it('flattens company with primaryAddress', () => {
    const raw = {
      id: 99,
      name: 'Kavárna U Lípy',
      regNumber: '12345678',
      taxNumber: 'CZ12345678',
      primaryAddress: {
        street: 'Hlavní 10',
        city: 'Brno',
        zipCode: '60200',
        state: 'CZ',
      },
    };
    expect(normalizeRaynetCompany(raw)).toMatchObject({
      externalId: 99,
      name: 'Kavárna U Lípy',
      ico: '12345678',
      dic: 'CZ12345678',
      street: 'Hlavní 10',
      city: 'Brno',
      zip: '60200',
      country: 'CZ',
    });
  });
});

describe('normalizeRaynetDeal', () => {
  it('flattens businessCase with priceMain + company', () => {
    const raw = {
      data: {
        id: 555,
        name: 'Q2 implementace',
        priceMain: { priceWithoutVat: 150000, currency: 'CZK' },
        state: 'IN_PROGRESS',
        company: { id: 99 },
        primaryContactPerson: { id: 42 },
        closeDate: '2026-06-30',
      },
    };
    expect(normalizeRaynetDeal(raw)).toMatchObject({
      externalId: 555,
      name: 'Q2 implementace',
      amount: 150000,
      currency: 'CZK',
      stage: 'IN_PROGRESS',
      companyExternalId: 99,
      primaryContactExternalId: 42,
    });
  });

  it('defaults currency to CZK', () => {
    expect(
      normalizeRaynetDeal({ id: 1, name: 'X', priceMain: { priceWithoutVat: 10 } }).currency,
    ).toBe('CZK');
  });
});
