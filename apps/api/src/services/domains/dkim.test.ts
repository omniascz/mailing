import { describe, it, expect } from 'vitest';
import { generateDkimKeyPair, buildDkimDnsRecord, signEmailDkim } from './dkim.js';

describe('generateDkimKeyPair', () => {
  it('generates a key pair with all required fields', async () => {
    const kp = await generateDkimKeyPair();
    expect(kp.privateKeyPem).toMatch(/BEGIN PRIVATE KEY/);
    expect(kp.publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    expect(kp.publicKeyBase64).toBeTruthy();
    expect(kp.publicKeyBase64).not.toMatch(/-----|BEGIN|END|\n/);
    expect(kp.dnsValue).toMatch(/^v=DKIM1; k=rsa; p=/);
  });

  it('generates different keys each call', async () => {
    const kp1 = await generateDkimKeyPair();
    const kp2 = await generateDkimKeyPair();
    expect(kp1.publicKeyBase64).not.toBe(kp2.publicKeyBase64);
  });

  it('includes the public key in the DNS value', async () => {
    const kp = await generateDkimKeyPair();
    expect(kp.dnsValue).toContain(kp.publicKeyBase64);
  });
});

describe('buildDkimDnsRecord', () => {
  it('builds correct hostname', () => {
    const rec = buildDkimDnsRecord('fm1', 'acme.cz', 'ABCDEF==');
    expect(rec.hostname).toBe('fm1._domainkey.acme.cz');
  });

  it('builds correct TXT value', () => {
    const rec = buildDkimDnsRecord('fm2', 'test.com', 'PUBLICKEY==');
    expect(rec.type).toBe('TXT');
    expect(rec.value).toBe('v=DKIM1; k=rsa; p=PUBLICKEY==');
  });

  it('uses custom selector', () => {
    const rec = buildDkimDnsRecord('fm3', 'example.cz', 'KEY==');
    expect(rec.hostname).toMatch(/^fm3\._domainkey\./);
  });
});

describe('signEmailDkim', () => {
  it('produces a DKIM-Signature value', async () => {
    const kp = await generateDkimKeyPair();
    const sig = signEmailDkim({
      headers: {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test email',
        date: new Date().toUTCString(),
        'message-id': '<test@example.com>',
        messageId: '<test@example.com>',
      },
      body: 'Hello world',
      privateKeyPem: kp.privateKeyPem,
      domain: 'example.com',
      selector: 'fm1',
    });

    expect(sig).toMatch(/v=1; a=rsa-sha256/);
    expect(sig).toMatch(/d=example\.com/);
    expect(sig).toMatch(/s=fm1/);
    expect(sig).toMatch(/bh=/);
    expect(sig).toMatch(/b=/);
  });

  it('includes all signing headers', async () => {
    const kp = await generateDkimKeyPair();
    const sig = signEmailDkim({
      headers: {
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Hi',
        date: 'Mon, 1 Jan 2024 00:00:00 +0000',
        messageId: '<x@y>',
        'message-id': '<x@y>',
      },
      body: 'body',
      privateKeyPem: kp.privateKeyPem,
      domain: 'b.com',
      selector: 'fm1',
    });

    expect(sig).toMatch(/h=from:to:subject:date:message-id/);
  });
});

describe('Ed25519 DKIM (RFC 8463)', () => {
  it('generates an ed25519 key with a k=ed25519 DNS record', async () => {
    const kp = await generateDkimKeyPair('ed25519');
    expect(kp.keyType).toBe('ed25519');
    expect(kp.privateKeyPem).toMatch(/BEGIN PRIVATE KEY/);
    expect(kp.dnsValue).toMatch(/k=ed25519/);
    // Raw Ed25519 public key is 32 bytes → 44 base64 chars.
    expect(kp.publicKeyBase64).toHaveLength(44);
  });

  it('signs with a=ed25519-sha256 and the signature verifies against the key', async () => {
    const crypto = await import('node:crypto');
    const kp = await generateDkimKeyPair('ed25519');
    const sig = signEmailDkim({
      headers: {
        from: 'a@x.com',
        to: 'b@y.com',
        subject: 'Hi',
        date: 'Mon, 01 Jan 2026 00:00:00 +0000',
        messageId: '<1@x>',
      },
      body: 'hello world',
      privateKeyPem: kp.privateKeyPem,
      domain: 'x.com',
      selector: 'fm1',
    });
    expect(sig).toMatch(/a=ed25519-sha256/);

    // Reconstruct the signed header block and verify b= against the public key.
    const b = sig.match(/b=([A-Za-z0-9+/=]+)$/)![1]!;
    const partial = sig.replace(/ b=[A-Za-z0-9+/=]+$/, '');
    const canon = [
      'from:a@x.com',
      'to:b@y.com',
      'subject:Hi',
      'date:Mon, 01 Jan 2026 00:00:00 +0000',
      'message-id:<1@x>',
      `dkim-signature:${partial} b=`,
    ].join('\r\n');
    const ok = crypto.verify(
      null,
      Buffer.from(canon),
      crypto.createPublicKey(kp.publicKeyPem),
      Buffer.from(b, 'base64'),
    );
    expect(ok).toBe(true);
  });

  it('keeps RSA as the default algorithm', async () => {
    const kp = await generateDkimKeyPair();
    expect(kp.keyType).toBe('rsa');
    expect(kp.dnsValue).toMatch(/k=rsa/);
  });

  it('buildDkimDnsRecord reflects the key type', () => {
    expect(buildDkimDnsRecord('fm1', 'x.com', 'PPP', 'ed25519').value).toMatch(/k=ed25519/);
    expect(buildDkimDnsRecord('fm1', 'x.com', 'PPP').value).toMatch(/k=rsa/);
  });
});
