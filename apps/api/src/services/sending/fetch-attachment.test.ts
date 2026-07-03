import { describe, it, expect } from 'vitest';
import { isPrivateIp } from './fetch-attachment.js';

describe('isPrivateIp (SSRF guard)', () => {
  it('blocks IPv4 private + reserved ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback / link-local / unique-local', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12:3456::1')).toBe(true);
  });

  it('unwraps IPv4-mapped IPv6', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows public IPv6 + blocks malformed', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIp('not-an-ip')).toBe(true); // malformed → block (fail closed)
  });
});
