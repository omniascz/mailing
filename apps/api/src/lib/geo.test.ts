import { describe, it, expect } from 'vitest';
import { isPublicIp, parseGeoResponse } from './geo.js';

describe('isPublicIp', () => {
  it('rejects private / loopback / link-local', () => {
    for (const ip of [
      '10.0.0.1',
      '192.168.1.5',
      '172.16.0.1',
      '172.31.255.1',
      '127.0.0.1',
      '169.254.1.1',
      '0.0.0.0',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
    ]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('rejects empty / null', () => {
    expect(isPublicIp(null)).toBe(false);
    expect(isPublicIp(undefined)).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });

  it('accepts public IPv4', () => {
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('172.15.0.1')).toBe(true); // just outside private range
    expect(isPublicIp('172.32.0.1')).toBe(true);
  });
});

describe('parseGeoResponse', () => {
  it('parses ip-api.com shape', () => {
    expect(parseGeoResponse({ status: 'success', countryCode: 'cz', city: 'Prague' })).toEqual({
      country: 'CZ',
      city: 'Prague',
    });
  });

  it('returns nulls on failed status', () => {
    expect(parseGeoResponse({ status: 'fail', message: 'private range' })).toEqual({
      country: null,
      city: null,
    });
  });

  it('parses generic country_code shape', () => {
    expect(parseGeoResponse({ country_code: 'SK', city: 'Bratislava' })).toEqual({
      country: 'SK',
      city: 'Bratislava',
    });
  });

  it('uppercases + truncates country to 2 chars', () => {
    expect(parseGeoResponse({ country: 'united states' }).country).toBe('UN');
  });

  it('handles empty / junk input', () => {
    expect(parseGeoResponse(null)).toEqual({ country: null, city: null });
    expect(parseGeoResponse({})).toEqual({ country: null, city: null });
  });
});
