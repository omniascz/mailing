import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      'noreply@forgemsg.com',
      'no-reply@forgemsg.io',
      'reports@forgemsg.com',
    ]) {
      expect(sent.from).not.toBe(stale);
    }
  });
});
