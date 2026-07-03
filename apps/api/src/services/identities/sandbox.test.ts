import { describe, it, expect } from 'vitest';
import { sandboxViolations } from './index.js';

describe('sandboxViolations', () => {
  const verifiedEmails = new Set(['ok@test.com', 'ada@x.com']);
  const verifiedDomains = new Set(['mydomain.com']);

  it('allows verified emails and addresses under a verified domain', () => {
    expect(
      sandboxViolations(['ok@test.com', 'anyone@mydomain.com'], verifiedEmails, verifiedDomains),
    ).toEqual([]);
  });

  it('flags unverified recipients (case-insensitive)', () => {
    expect(
      sandboxViolations(['OK@test.com', 'stranger@other.com'], verifiedEmails, verifiedDomains),
    ).toEqual(['stranger@other.com']);
  });

  it('flags everything when nothing is verified', () => {
    expect(sandboxViolations(['a@b.com', 'c@d.com'], new Set(), new Set())).toEqual([
      'a@b.com',
      'c@d.com',
    ]);
  });
});
