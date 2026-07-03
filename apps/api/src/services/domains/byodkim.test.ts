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

  it('rejects a non-RSA key (e.g. EC)', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => importDkimPrivateKey(pem)).toThrow(/must be RSA/);
  });
});
