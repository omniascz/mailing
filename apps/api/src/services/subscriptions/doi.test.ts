import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { sendTransactionalEmail, setex, evalScript } = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
  setex: vi.fn(),
  evalScript: vi.fn(),
}));

vi.mock('../../lib/queues.js', () => ({ sendTransactionalEmail }));
vi.mock('@forgemsg/shared/redis', () => ({ redis: { setex, eval: evalScript } }));

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
    evalScript.mockResolvedValue(1);
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
 * The confirmation is the one mail the row a GDPR erasure leaves does not stop
 * (mta-sender, isSuppressed; Z148, narrowed to the erasure row in Z170 —
 * výjimka jen pro výmaz GDPR, Michal 14. 10., varianta (a)). That is safe
 * only while nothing else can ask for it, so these pin who asks: this sender,
 * through sendTransactionalEmail's second argument — never a field of the
 * input object, which customer paths build from a request.
 */
describe('who may ask for the DOI exception', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setex.mockResolvedValue('OK');
    evalScript.mockResolvedValue(1);
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

/**
 * At most three confirmations per address and list in 24 hours (Michal 14. 10.;
 * Z170). The window itself is a Redis script, measured against a real Redis by
 * apps/api/src/integration/doi-confirmation-limit; this pins what the sender
 * does with the script's answer.
 */
describe('the limit of three per address and list', () => {
  const opts = {
    orgId: 'org-1',
    contactId: 'contact-1',
    listId: 'list-1',
    email: 'Subscriber@Example.test',
    listName: 'Newsletter',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setex.mockResolvedValue('OK');
    sendTransactionalEmail.mockResolvedValue('msg-1');
  });

  it('asks the window under the list and the keyed fingerprint, never the address', async () => {
    evalScript.mockResolvedValue(1);
    const { suppressionEmailHash } = await import('../suppressions/email.js');
    await sendListDoiConfirmation(opts);
    const [, keys, key, now, window, max] = evalScript.mock.calls[0]! as unknown[];
    expect(keys).toBe(1);
    expect(key).toBe(`doi:limit:list-1:${suppressionEmailHash('subscriber@example.test')}`);
    expect(String(key)).not.toContain('ubscriber');
    expect(typeof now).toBe('number');
    expect(window).toBe(24 * 60 * 60 * 1000);
    expect(max).toBe(3);
  });

  it('under the limit: the token is stored and the mail queued, as before', async () => {
    evalScript.mockResolvedValue(1);
    const out = await sendListDoiConfirmation(opts);
    expect(setex).toHaveBeenCalledTimes(1);
    expect(setex.mock.calls[0]![0]).toBe(`doi:${out.token}`);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('over the limit: nothing stored, nothing queued, the same answer, a log line without the address', async () => {
    evalScript.mockResolvedValue(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await sendListDoiConfirmation(opts);
      expect(setex).not.toHaveBeenCalled();
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
      expect(out.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(out.confirmUrl.endsWith(`/api/v1/confirm/${out.token}`)).toBe(true);
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
        '[doi] doi_rate_limited list=list-1 org=org-1',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('a Redis failure is an error, as the store was: nothing is sent unchecked', async () => {
    evalScript.mockRejectedValue(new Error('redis down'));
    await expect(sendListDoiConfirmation(opts)).rejects.toThrow('redis down');
    expect(setex).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
