import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { sendTransactionalEmail, setex } = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
  setex: vi.fn(),
}));

vi.mock('../../lib/queues.js', () => ({ sendTransactionalEmail }));
vi.mock('@forgemsg/shared/redis', () => ({ redis: { setex } }));

import { sendListDoiConfirmation } from './doi.js';
import { env } from '../../config/env.js';

/**
 * Double opt-in is the link in the chain that carries the legal basis for
 * processing: if the confirmation does not arrive, the consent does not exist.
 * It used to be sent from `process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com'`
 * — a name nothing validated, and a fallback on a domain nobody owns. In
 * production docker-compose supplied that exact fallback unconditionally
 * (`${DOI_FROM_EMAIL:-no-reply@example.com}`), so the committed placeholder was
 * not a theoretical path, it was the configured one.
 *
 * These pin the sender to the single validated config value.
 */
describe('list double opt-in confirmation', () => {
  const opts = {
    orgId: 'org-1',
    contactId: 'contact-1',
    listId: 'list-1',
    email: 'subscriber@example.test',
    listName: 'Newsletter',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setex.mockResolvedValue('OK');
    sendTransactionalEmail.mockResolvedValue('msg-1');
  });

  it('sends from the canonical system sender', async () => {
    await sendListDoiConfirmation(opts);

    expect(sendTransactionalEmail, 'the confirmation was never enqueued').toHaveBeenCalledTimes(1);
    const sent = sendTransactionalEmail.mock.calls[0]![0] as { from: string };
    expect(sent.from).toBe(env.SYSTEM_EMAIL_FROM);
  });

  it('never falls back to a committed address, and never sends an empty From', async () => {
    await sendListDoiConfirmation(opts);
    const sent = sendTransactionalEmail.mock.calls[0]![0] as { from: string };

    // Empty is the case `??` did not catch: a set-but-empty variable yielded
    // '' rather than the fallback, and nothing downstream refuses it — the Go
    // engine builds `From: ` and hands MAIL FROM:<> to the remote server.
    expect(sent.from, 'empty From reaches the MTA unchallenged').not.toBe('');
    for (const stale of [
      'no-reply@example.com',
      'noreply@example.invalid',
      'no-reply@example.invalid',
      'reports@example.invalid',
    ]) {
      expect(sent.from).not.toBe(stale);
    }
  });
});

/**
 * The confirmation is the one mail a 'manual' suppression does not stop
 * (mta-sender, isSuppressed; owner's decision 14 Oct 2026, Z148). That is safe
 * only while nothing else can ask for it, so these pin who asks: this sender,
 * through sendTransactionalEmail's second argument — never a field of the
 * input object, which customer paths build from a request.
 */
describe('who may ask for the DOI exception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setex.mockResolvedValue('OK');
    sendTransactionalEmail.mockResolvedValue('msg-1');
  });

  it('the list confirmation asks for it, beside the input and not inside it', async () => {
    const out = await sendListDoiConfirmation({
      orgId: 'org-1',
      contactId: 'contact-1',
      listId: 'list-1',
      email: 'subscriber@example.test',
      listName: 'Newsletter',
    });
    const [input, system] = sendTransactionalEmail.mock.calls[0]! as [
      Record<string, unknown>,
      unknown,
    ];
    expect(system).toEqual({ purpose: 'doi_confirmation' });
    expect(input).not.toHaveProperty('purpose');
    // The token the link carries is the one stored for GET /confirm/:token.
    expect(setex.mock.calls[0]![0]).toBe(`doi:${out.token}`);
    expect(String(input.html)).toContain(out.confirmUrl);
  });

  it('no other source file names the purpose', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
      }
    };
    walk(root);
    const naming = files
      .filter((f) => readFileSync(f, 'utf8').includes('doi_confirmation'))
      .map((f) => relative(root, f).split(sep).join('/'))
      .sort();
    // queues.ts declares the type; doi.ts is the one caller that passes it.
    expect(naming).toEqual(['lib/queues.ts', 'services/subscriptions/doi.ts']);
  });
});
