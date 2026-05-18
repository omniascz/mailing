import { describe, it, expect } from 'vitest';
import { buildDnsRecords } from './dns-records.js';

// verifyDnsRecords makes real DNS calls — test only the pure build function

describe('buildDnsRecords', () => {
  const opts = {
    domain: 'acme.cz',
    mailSubdomain: 'mail.acme.cz',
    dkimSelector: 'fm1',
    dkimPublicKey: 'PUBLICKEY==',
    dmarcEmail: 'dmarc@forgemsg.com',
  };

  it('returns 5 records', () => {
    const recs = buildDnsRecords(opts);
    expect(recs).toHaveLength(5);
  });

  it('includes an SPF TXT record', () => {
    const recs = buildDnsRecords(opts);
    const spf = recs.find((r) => r.purpose.startsWith('SPF'));
    expect(spf).toBeDefined();
    expect(spf!.type).toBe('TXT');
    expect(spf!.hostname).toBe('acme.cz');
    expect(spf!.value).toMatch(/v=spf1/);
    expect(spf!.value).toMatch(/include:/);
  });

  it('includes a DKIM TXT record with correct hostname', () => {
    const recs = buildDnsRecords(opts);
    const dkim = recs.find((r) => r.purpose.startsWith('DKIM'));
    expect(dkim).toBeDefined();
    expect(dkim!.type).toBe('TXT');
    expect(dkim!.hostname).toBe('fm1._domainkey.acme.cz');
    expect(dkim!.value).toContain('v=DKIM1');
    expect(dkim!.value).toContain('PUBLICKEY==');
  });

  it('includes a DMARC TXT record', () => {
    const recs = buildDnsRecords(opts);
    const dmarc = recs.find((r) => r.purpose.startsWith('DMARC'));
    expect(dmarc).toBeDefined();
    expect(dmarc!.type).toBe('TXT');
    expect(dmarc!.hostname).toBe('_dmarc.acme.cz');
    expect(dmarc!.value).toMatch(/v=DMARC1/);
    expect(dmarc!.value).toMatch(/p=quarantine/);
    expect(dmarc!.value).toContain('dmarc@forgemsg.com');
  });

  it('includes a Return-Path CNAME record', () => {
    const recs = buildDnsRecords(opts);
    const rp = recs.find((r) => r.purpose.startsWith('Return-Path'));
    expect(rp).toBeDefined();
    expect(rp!.type).toBe('CNAME');
    expect(rp!.hostname).toBe('mail.acme.cz');
  });

  it('includes an MX record for bounce processing', () => {
    const recs = buildDnsRecords(opts);
    const mx = recs.find((r) => r.type === 'MX');
    expect(mx).toBeDefined();
    expect(mx!.hostname).toBe('mail.acme.cz');
  });

  it('all records start as unverified', () => {
    const recs = buildDnsRecords(opts);
    expect(recs.every((r) => r.verified === false)).toBe(true);
    expect(recs.every((r) => r.lastCheckedAt === null)).toBe(true);
  });

  it('uses custom selector in DKIM hostname', () => {
    const recs = buildDnsRecords({ ...opts, dkimSelector: 'fm3' });
    const dkim = recs.find((r) => r.purpose.startsWith('DKIM'));
    expect(dkim!.hostname).toBe('fm3._domainkey.acme.cz');
  });
});
