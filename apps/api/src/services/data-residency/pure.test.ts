import { describe, it, expect } from 'vitest';
import {
  isDataRegion,
  DEFAULT_ENDPOINTS,
  resolveRegionEndpoints,
  guardCrossRegion,
  suggestRegionForCountry,
  DATA_REGIONS,
} from './pure.js';

describe('DATA_REGIONS', () => {
  it('exposes the 3 supported regions', () => {
    expect(DATA_REGIONS).toEqual(['us', 'eu', 'ap']);
  });
});

describe('isDataRegion', () => {
  it('accepts canonical values', () => {
    expect(isDataRegion('eu')).toBe(true);
    expect(isDataRegion('us')).toBe(true);
    expect(isDataRegion('ap')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isDataRegion('EU')).toBe(false); // case-sensitive on purpose
    expect(isDataRegion('uk')).toBe(false);
    expect(isDataRegion(null)).toBe(false);
  });
});

describe('resolveRegionEndpoints', () => {
  it('returns default endpoints by region', () => {
    const eu = resolveRegionEndpoints('eu');
    expect(eu.s3Bucket).toBe('forgemsg-eu');
    expect(eu.awsRegion).toBe('eu-central-1');
  });

  it('honours overrides per region', () => {
    const custom = resolveRegionEndpoints('eu', {
      eu: { s3Bucket: 'forgemsg-eu-staging', postgresHost: 'pg.eu.staging' },
    });
    expect(custom.s3Bucket).toBe('forgemsg-eu-staging');
    expect(custom.postgresHost).toBe('pg.eu.staging');
    // Non-overridden fields keep defaults
    expect(custom.redisHost).toBe(DEFAULT_ENDPOINTS.eu.redisHost);
  });

  it('leaves other regions untouched', () => {
    const us = resolveRegionEndpoints('us', {
      eu: { s3Bucket: 'forgemsg-eu-staging' },
    });
    expect(us.s3Bucket).toBe(DEFAULT_ENDPOINTS.us.s3Bucket);
  });
});

describe('guardCrossRegion', () => {
  it('allows same-region access', () => {
    expect(
      guardCrossRegion({ orgRegion: 'eu', resourceRegion: 'eu', resource: 's3://forgemsg-eu/exports' }),
    ).toEqual({ allowed: true });
  });

  it('blocks cross-region access with a descriptive reason', () => {
    const result = guardCrossRegion({
      orgRegion: 'eu',
      resourceRegion: 'us',
      resource: 's3://forgemsg-us/exports',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('EU');
    expect(result.reason).toContain('US');
  });

  it('blocks untagged resources', () => {
    const result = guardCrossRegion({
      orgRegion: 'eu',
      resourceRegion: null,
      resource: 'legacy_blob',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no region tag');
  });
});

describe('suggestRegionForCountry', () => {
  it('CZ → eu', () => {
    expect(suggestRegionForCountry('CZ')).toBe('eu');
  });

  it('SK → eu', () => {
    expect(suggestRegionForCountry('SK')).toBe('eu');
  });

  it('DE → eu (GDPR-heavy)', () => {
    expect(suggestRegionForCountry('DE')).toBe('eu');
  });

  it('GB → us (post-Brexit, default)', () => {
    expect(suggestRegionForCountry('GB')).toBe('us');
  });

  it('JP → ap', () => {
    expect(suggestRegionForCountry('JP')).toBe('ap');
  });

  it('Unknown country falls back to us', () => {
    expect(suggestRegionForCountry('XX')).toBe('us');
  });

  it('is case-insensitive', () => {
    expect(suggestRegionForCountry('cz')).toBe('eu');
    expect(suggestRegionForCountry('  cz ')).toBe('eu');
  });
});
