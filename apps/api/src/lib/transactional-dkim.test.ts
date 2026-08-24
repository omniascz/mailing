import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';

/**
 * Transactional mail must be DKIM-signed, with the sending domain's own key.
 *
 * ─── What was wrong ─────────────────────────────────────────────────────────
 *
 * `sendTransactionalEmail` built its MTA payload by hand and never set
 * dkimDomain / dkimSelector / dkimPrivateKey. The consumer declares all three
 * optional (workers/src/queues/index.ts), so nothing complained; and the Go
 * engine signs only when it is handed a key —
 *
 *     if msg.DkimConfig != nil && msg.DkimConfig.PrivateKeyPEM != "" {
 *         ... engine/internal/smtp/sender.go:134
 *
 * with no else, no default key anywhere in the engine, and no error. So the
 * mail simply left unsigned and every layer reported success.
 *
 * The campaign path has resolved a key since the rotation work; the
 * transactional path never did. That put DOI confirmations, password resets,
 * identity verification and order confirmations out unsigned on a shared IP
 * pool — where DOI is the worst of them, because it is the evidence that
 * consent was given and it is the one mail that must not land in spam.
 *
 * ─── What this file covers, and what it deliberately does not ───────────────
 *
 * This is the WIRING: that queues.ts asks the shared resolver, asks it with the
 * right org and the right From, and puts back exactly what it got — as a group.
 *
 * It cannot cover the resolution itself. `resolveDkimForSender` calls
 * `resolveActiveKey` in the same module, and an intra-module call goes through
 * the local binding, not the export, so no module mock can reach it. Stubbing
 * it here would only prove the stub. Which key comes back for which domain,
 * the org scope, and active-vs-pending are therefore asserted against a real
 * database in integration/transactional-dkim.integration.test.ts.
 */

const { queueAdd, resolveDkimForSender } = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  resolveDkimForSender: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = queueAdd;
    addBulk = vi.fn();
    getJob = vi.fn();
    constructor(
      public name: string,
      public opts?: unknown,
    ) {}
  },
  Worker: class {},
}));

vi.mock('../services/domains/dkim-rotation.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, resolveDkimForSender };
});

const ORG = '00000000-0000-0000-0000-0000000000ff';

/**
 * Two domains, two distinct keys. A payload that carried the other domain's
 * material would satisfy "the field is set" and produce a signature no receiver
 * can validate — a broken signature is a positive failure, worse than none — so
 * every case names which one it expects.
 */
const KEYS: Record<string, { dkimDomain: string; dkimSelector: string; dkimPrivateKey: string }> = {
  'shop.test': {
    dkimDomain: 'shop.test',
    dkimSelector: 'fmk20260101000000',
    dkimPrivateKey: '-----BEGIN PRIVATE KEY-----SHOP',
  },
  'other.test': {
    dkimDomain: 'other.test',
    dkimSelector: 'fmk20991231235959',
    dkimPrivateKey: '-----BEGIN PRIVATE KEY-----OTHER',
  },
};

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  await Promise.all([
    import('./queues.js'),
    import('../services/sending/sink-addresses.js'),
    import('../services/domains/dkim-rotation.js'),
  ]);
}, 60_000);

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  queueAdd.mockReset();
  queueAdd.mockResolvedValue({ id: '1' });
  resolveDkimForSender.mockReset();
  // Stands in for the real resolver: org-scoped, keyed on the From domain.
  resolveDkimForSender.mockImplementation(async (orgId: string, from: string) => {
    if (orgId !== ORG) return null;
    const domain = /<([^>]+)>/.exec(from)?.[1] ?? from;
    return KEYS[domain.trim().toLowerCase().split('@')[1] ?? ''] ?? null;
  });
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function send(
  over: { from?: string; orgId?: string | undefined } = {},
): Promise<Record<string, unknown>> {
  const { sendTransactionalEmail } = await import('./queues.js');
  await sendTransactionalEmail({
    to: 'buyer@example.test',
    from: over.from ?? 'orders@shop.test',
    subject: 'Confirm your subscription',
    html: '<p>x</p>',
    orgId: 'orgId' in over ? over.orgId : ORG,
  });
  expect(queueAdd, 'nothing was enqueued').toHaveBeenCalledTimes(1);
  return queueAdd.mock.calls[0]![1] as Record<string, unknown>;
}

describe('sendTransactionalEmail — DKIM', () => {
  it('carries the signing material of the From domain', async () => {
    const payload = await send({ from: 'orders@shop.test' });

    expect(
      payload.dkimDomain,
      'no dkimDomain means the engine is handed no key and sends unsigned',
    ).toBe('shop.test');
    expect(payload.dkimSelector).toBe(KEYS['shop.test']!.dkimSelector);
    expect(payload.dkimPrivateKey).toBe(KEYS['shop.test']!.dkimPrivateKey);
  });

  it('carries the other domain when the From is the other domain', async () => {
    const payload = await send({ from: 'noreply@other.test' });

    expect(payload.dkimDomain).toBe('other.test');
    expect(payload.dkimSelector).toBe(KEYS['other.test']!.dkimSelector);
    expect(
      payload.dkimPrivateKey,
      'a key from the wrong domain signs with something no receiver can validate',
    ).toBe(KEYS['other.test']!.dkimPrivateKey);
  });

  it('asks the resolver with this org and this From, not a synthesised one', async () => {
    // queues.ts substitutes a random uuid into the payload's orgId field when
    // the caller omits one. If that substitute ever reached the lookup, the
    // query would be scoped to an org that does not exist.
    await send({ from: 'orders@shop.test' });
    expect(resolveDkimForSender).toHaveBeenCalledWith(ORG, 'orders@shop.test');
  });

  it('uses the same resolver as campaign dispatch, not a second lookup', async () => {
    // Campaign and transactional mail from one address must be signed with one
    // key. Both call this export; the campaigns module re-exports it.
    const dispatch = await import('../services/campaigns/dispatch.js');
    const rotation = await import('../services/domains/dkim-rotation.js');
    expect(dispatch.resolveDkimForSender).toBe(rotation.resolveDkimForSender);
  });
});

describe('sendTransactionalEmail — when there is no key', () => {
  /**
   * Decided: send unsigned, never refuse. Two senders reach this legitimately
   * and refusing helps neither:
   *
   *   - a verified single email identity (email_identities) has no DKIM key and
   *     no sending_domains row to hold one — refusing would close the on-ramp
   *     the product deliberately offers;
   *   - system mail (SYSTEM_EMAIL_FROM) is sent from OUR domain under the
   *     CUSTOMER's org id, and the lookup is org-scoped, so it can never match.
   *     Refusing would mean no DOI, no password reset and no email verification
   *     at all.
   *
   * For DOI specifically: unsigned-and-delivered beats refused-and-never-sent.
   * A confirmation that is never sent is a consent record that never exists,
   * which is a worse legal position than one that risks the spam folder.
   */
  it('still enqueues, with no DKIM fields at all', async () => {
    const payload = await send({ from: 'no-reply@unknown.test' });

    expect(payload.dkimDomain, 'an empty string is a value; the field must be absent').toBe(
      undefined,
    );
    expect(payload.dkimSelector).toBe(undefined);
    expect(payload.dkimPrivateKey).toBe(undefined);
    expect(payload.toEmail, 'the mail must still go out').toBe('buyer@example.test');
  });

  it('does not attempt a lookup when the caller has no org', async () => {
    // services/identities/index.ts sends without an orgId. The lookup is
    // org-scoped, so there is nothing to scope to and the answer is known.
    const payload = await send({ orgId: undefined });
    expect(resolveDkimForSender).not.toHaveBeenCalled();
    expect(payload.dkimDomain).toBe(undefined);
  });

  /**
   * All three, or none.
   *
   * The mta-other queue has no payload contract — queue-contracts.ts guards
   * email, sms and viber-send, and writing a full schema for the ~30-field MTA
   * payload is a bigger change than this one. Nor do these fields become
   * REQUIRED: the two senders above legitimately have no key, so a schema that
   * demanded them would reject the mail it is meant to protect.
   *
   * What the fix does create is a grouping, and this is the assertion for it.
   * mta-sender.ts builds the gRPC dkim message from `data.dkimDomain` alone:
   *
   *     dkim: data.dkimDomain ? { domain, selector: … ?? '', privateKeyPem: … ?? '' } : undefined
   *
   * so a domain without a key would reach the engine as a config with an empty
   * PEM, which sender.go then skips — the same unsigned mail, arrived at by a
   * longer road and with a Message that claims to be configured.
   */
  it('never emits a partial group', async () => {
    for (const from of ['orders@shop.test', 'no-reply@unknown.test']) {
      queueAdd.mockClear();
      const payload = await send({ from });
      const present = (['dkimDomain', 'dkimSelector', 'dkimPrivateKey'] as const).filter(
        (k) => payload[k] !== undefined,
      );
      expect(present.length, `From=${from} emitted ${present.join(',')}`).not.toBe(1);
      expect(present.length, `From=${from} emitted ${present.join(',')}`).not.toBe(2);
    }
  });

  it('sends unsigned rather than throwing when the lookup itself fails', async () => {
    // A database blip must not turn into a failed password reset.
    resolveDkimForSender.mockRejectedValue(new Error('connection terminated'));
    const payload = await send({ from: 'orders@shop.test' });
    expect(payload.dkimDomain).toBe(undefined);
    expect(payload.toEmail).toBe('buyer@example.test');
  });
});
