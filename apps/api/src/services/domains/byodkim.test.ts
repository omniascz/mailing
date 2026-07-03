import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { importDkimPrivateKey, generateDkimKeyPair } from './dkim.js';

describe('importDkimPrivateKey', () => {
  it('derives the correct public key from a valid RSA private key', async () => {
    const generated = await generateDkimKeyPair();
    const imported = importDkimPrivateKey(generated.privateKeyPem);
    // The derived public key must match the one the generator produced.
    expect(imported.publicKeyBase64).toBe(generated.publicKeyBase64);
    expect(imported.dnsValue).toBe(`v=DKIM1; k=rsa; p=${generated.publicKeyBase64}`);
  });

  it('rejects a non-PEM / invalid key', () => {
    expect(() => importDkimPrivateKey('not a key')).toThrow(/Invalid private key/);
  });

  it('imports an Ed25519 (RFC 8463) private key with a k=ed25519 record', async () => {
    const generated = await generateDkimKeyPair('ed25519');
    const imported = importDkimPrivateKey(generated.privateKeyPem);
    expect(imported.keyType).toBe('ed25519');
    expect(imported.publicKeyBase64).toBe(generated.publicKeyBase64);
    expect(imported.dnsValue).toBe(`v=DKIM1; k=ed25519; p=${generated.publicKeyBase64}`);
  });

  it('rejects an unsupported key type (e.g. EC P-256)', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => importDkimPrivateKey(pem)).toThrow(/RSA or Ed25519/);
  });
});
