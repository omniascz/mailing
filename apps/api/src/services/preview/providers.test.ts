import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockProvider, selectProvider, createLitmusProvider } from './providers.js';

/**
 * Provider-layer tests — exercise the mock and the env-driven selectProvider
 * without hitting the network. Real Litmus integration is smoke-tested at
 * staging time, not in unit suite.
 */
describe('mockProvider', () => {
  it('lists at least three named clients across categories', () => {
    const clients = mockProvider.listClients();
    expect(clients.length).toBeGreaterThanOrEqual(3);
    const cats = new Set(clients.map((c) => c.category));
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });

  it('startJob returns a job id', async () => {
    const job = await mockProvider.startJob({
      html: '<p>hi</p>',
      subject: 's',
      clients: ['gmail_chrome'],
    });
    expect(job.providerJobId).toMatch(/^mock-/);
  });

  it('pollJob immediately reports completed with screenshot urls', async () => {
    const { providerJobId } = await mockProvider.startJob({
      html: '<p>hi</p>',
      clients: ['gmail_chrome'],
    });
    const polled = await mockProvider.pollJob(providerJobId);
    expect(polled.status).toBe('completed');
    expect(polled.results?.length).toBeGreaterThan(0);
    expect(polled.results![0]!.url).toContain('https://');
  });
});

describe('selectProvider', () => {
  const originalProviderEnv = process.env.INBOX_PREVIEW_PROVIDER;
  const originalKey = process.env.LITMUS_API_KEY;

  beforeEach(() => {
    delete process.env.INBOX_PREVIEW_PROVIDER;
    delete process.env.LITMUS_API_KEY;
  });

  afterEach(() => {
    if (originalProviderEnv === undefined) delete process.env.INBOX_PREVIEW_PROVIDER;
    else process.env.INBOX_PREVIEW_PROVIDER = originalProviderEnv;
    if (originalKey === undefined) delete process.env.LITMUS_API_KEY;
    else process.env.LITMUS_API_KEY = originalKey;
  });

  it('falls back to mock when no provider env is set', () => {
    expect(selectProvider().name).toBe('mock');
  });

  it('honors explicit mock override even when LITMUS_API_KEY is present', () => {
    process.env.LITMUS_API_KEY = 'x';
    process.env.INBOX_PREVIEW_PROVIDER = 'mock';
    expect(selectProvider().name).toBe('mock');
  });

  it('selects litmus when only LITMUS_API_KEY is set', () => {
    process.env.LITMUS_API_KEY = 'fake-key';
    expect(selectProvider().name).toBe('litmus');
  });
});

describe('createLitmusProvider', () => {
  it('exposes a named subset of clients in three categories', () => {
    const provider = createLitmusProvider('fake-key');
    const clients = provider.listClients();
    expect(clients.length).toBeGreaterThanOrEqual(5);
    const cats = new Set(clients.map((c) => c.category));
    expect(cats.has('desktop')).toBe(true);
    expect(cats.has('mobile')).toBe(true);
    expect(cats.has('webmail')).toBe(true);
  });
});
