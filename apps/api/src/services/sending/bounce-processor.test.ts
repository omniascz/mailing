import { describe, it, expect } from 'vitest';
import {
  classifyBounce,
  extractNdrReason,
  extractSmtpCode,
  isBounceMessage,
  extractFailedRecipient,
  dsnStatusClass,
  dsnIsTransient,
  dsnAction,
  classifyDsn,
  parseDeliveryStatus,
  classifyDsnRecipient,
  dsnAddress,
} from './bounce-processor.js';

describe('parseDeliveryStatus (RFC 3464)', () => {
  const ds = [
    'Reporting-MTA: dns; mx.example',
    'Arrival-Date: Mon, 13 Oct 2026 10:00:00 +0000',
    '',
    'Final-Recipient: rfc822; a@example.test',
    'Action: failed',
    'Status: 5.1.1',
    'Diagnostic-Code: smtp; 550 5.1.1 user',
    '  unknown',
    '',
    'Final-Recipient: rfc822; b@example.test',
    'Action: delayed',
    'Status: 4.4.7',
    '',
  ].join('\r\n');

  it('reads the per-message block and one block per recipient, folded lines joined', () => {
    const p = parseDeliveryStatus(ds)!;
    expect(p.perMessage['reporting-mta']).toBe('dns; mx.example');
    expect(p.recipients).toHaveLength(2);
    expect(p.recipients[0]!['diagnostic-code']).toBe('smtp; 550 5.1.1 user unknown');
    expect(p.recipients[1]!.action).toBe('delayed');
  });

  it('works without the per-message block, and is null without any recipient', () => {
    expect(
      parseDeliveryStatus('Final-Recipient: rfc822; a@b.test\nAction: failed')!.recipients,
    ).toHaveLength(1);
    expect(parseDeliveryStatus('Reporting-MTA: dns; mx.example\n')).toBeNull();
    expect(parseDeliveryStatus('')).toBeNull();
  });
});

describe('dsnAddress', () => {
  it('takes rfc822 and utf-8 addresses, nothing else', () => {
    expect(dsnAddress('rfc822; <A@Example.test>')).toBe('a@example.test');
    expect(dsnAddress('utf-8; jan@příklad.test')).toBe('jan@příklad.test');
    expect(dsnAddress('x400; c=CZ;a= ;p=Example;s=Novak')).toBeNull();
    expect(dsnAddress('garbage')).toBeNull();
    expect(dsnAddress(undefined)).toBeNull();
  });
});

describe('classifyDsnRecipient — the fields decide, not the body (Z141)', () => {
  const r = (fields: Record<string, string>) => classifyDsnRecipient(fields, {});

  it('delayed 4.4.7 is a deferral, whatever an earlier attempt said', () => {
    expect(
      r({
        'final-recipient': 'rfc822; a@b.test',
        action: 'delayed',
        status: '4.4.7',
        'diagnostic-code': 'smtp; 451 4.4.7 delayed',
      }),
    ).toMatchObject({ event: 'deferred', suppress: null, address: 'a@b.test' });
  });

  it('failed 4.4.7 is a definitive soft failure that suppresses', () => {
    expect(
      r({ 'final-recipient': 'rfc822; a@b.test', action: 'failed', status: '4.4.7' }),
    ).toMatchObject({ event: 'bounce', bounceType: 'soft', suppress: 'hard_bounce' });
  });

  it('failed 5.1.1 is hard (invalid_email); 5.7.1 with an RBL diagnostic is a block', () => {
    expect(
      r({ 'final-recipient': 'rfc822; a@b.test', action: 'failed', status: '5.1.1' }),
    ).toMatchObject({ bounceType: 'hard', suppress: 'invalid_email' });
    expect(
      r({
        'final-recipient': 'rfc822; a@b.test',
        action: 'failed',
        status: '5.7.1',
        'diagnostic-code': 'smtp; 550 5.7.1 client host blocked using Spamhaus RBL',
      }),
    ).toMatchObject({ bounceType: 'block', suppress: null });
  });

  it('a field missing from the recipient block comes from the per-message block', () => {
    expect(
      classifyDsnRecipient(
        { 'final-recipient': 'rfc822; a@b.test', status: '5.1.1' },
        { action: 'failed' },
      ),
    ).toMatchObject({ action: 'failed', bounceType: 'hard' });
  });

  it('an X.400 recipient has no address and does not throw', () => {
    expect(
      r({ 'final-recipient': 'x400; c=CZ;s=Novak', action: 'failed', status: '5.1.1' }),
    ).toMatchObject({ address: null, bounceType: 'hard' });
  });

  it('fields that say nothing classifiable: a soft bounce, unclassified, nothing suppressed', () => {
    expect(r({ 'final-recipient': 'rfc822; a@b.test', action: 'failed' })).toMatchObject({
      bounceType: 'soft',
      suppress: null,
      unclassified: true,
    });
  });
});

describe('extractSmtpCode', () => {
  it('extracts 3-digit SMTP code', () => {
    expect(extractSmtpCode('550 User unknown')).toBe(550);
    expect(extractSmtpCode('452 Mailbox full')).toBe(452);
    expect(extractSmtpCode('421 Service unavailable')).toBe(421);
  });

  it('extracts code from enhanced status', () => {
    expect(extractSmtpCode('5.1.1 bad destination mailbox')).toBe(550);
    expect(extractSmtpCode('4.2.2 mailbox full')).toBe(450);
  });

  it('returns null when no code present', () => {
    expect(extractSmtpCode('some random message')).toBeNull();
  });
});

describe('extractNdrReason', () => {
  it('extracts Diagnostic-Code line', () => {
    const ndr =
      'From: mailer-daemon@example.com\nDiagnostic-Code: smtp; 550 User unknown\nStatus: 5.1.1';
    const reason = extractNdrReason(ndr);
    expect(reason).toContain('550 User unknown');
  });

  it('falls back to Status line', () => {
    const ndr = 'From: mailer-daemon@example.com\nStatus: 5.1.1';
    const reason = extractNdrReason(ndr);
    expect(reason).toContain('5.1.1');
  });

  it('falls back to first non-empty line', () => {
    const ndr = '\nThis is a bounce reason that is long enough';
    const reason = extractNdrReason(ndr);
    expect(reason).toBeTruthy();
  });
});

describe('classifyBounce — hard bounces', () => {
  it('classifies 550 as hard', () => {
    const r = classifyBounce(
      550,
      'Delivery Status Notification\nDiagnostic-Code: smtp; 550 User unknown',
    );
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
    expect(r.alert).toBe(false);
  });

  it('classifies "user unknown" as hard', () => {
    const r = classifyBounce('User unknown');
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
  });

  it('classifies "no such user" as hard', () => {
    const r = classifyBounce('550 no such user here');
    expect(r.type).toBe('hard');
  });

  it('classifies "mailbox does not exist" as hard', () => {
    const r = classifyBounce('mailbox does not exist');
    expect(r.type).toBe('hard');
  });

  it('classifies "account disabled" as hard', () => {
    const r = classifyBounce('account disabled');
    expect(r.type).toBe('hard');
  });

  it('classifies 5.1.1 enhanced status as hard', () => {
    const r = classifyBounce('5.1.1 bad destination mailbox address');
    expect(r.type).toBe('hard');
  });

  it('classifies any 5xx code as hard (fallback)', () => {
    const r = classifyBounce(556);
    expect(r.type).toBe('hard');
  });
});

describe('classifyBounce — soft bounces', () => {
  it('classifies 452 as soft', () => {
    const r = classifyBounce(452);
    expect(r.type).toBe('soft');
    expect(r.autoSuppress).toBe(false);
    expect(r.alert).toBe(false);
  });

  it('classifies "mailbox full" as soft', () => {
    const r = classifyBounce('452 mailbox full, please try again later');
    expect(r.type).toBe('soft');
  });

  it('classifies "temporarily unavailable" as soft', () => {
    const r = classifyBounce('temporarily unavailable');
    expect(r.type).toBe('soft');
  });

  it('classifies "greylisted" as soft', () => {
    const r = classifyBounce('greylisted, please retry');
    expect(r.type).toBe('soft');
  });

  it('classifies 421 as soft', () => {
    const r = classifyBounce(421);
    expect(r.type).toBe('soft');
  });

  it('classifies 4xx code range as soft (fallback)', () => {
    const r = classifyBounce(450);
    expect(r.type).toBe('soft');
  });
});

describe('classifyBounce — block bounces', () => {
  it('classifies "blocked by policy" as block', () => {
    const r = classifyBounce('554 blocked by policy violation');
    expect(r.type).toBe('block');
    expect(r.alert).toBe(true);
    expect(r.autoSuppress).toBe(false);
  });

  it('classifies "ip blacklisted" as block', () => {
    const r = classifyBounce('Your IP is blacklisted');
    expect(r.type).toBe('block');
  });

  it('classifies "spam detected" as block', () => {
    const r = classifyBounce('spam detected — message rejected');
    expect(r.type).toBe('block');
  });

  it('classifies "DKIM fail" as block', () => {
    const r = classifyBounce('550 DKIM fail — signature invalid');
    expect(r.type).toBe('block');
  });

  it('classifies "SPF softfail" as block', () => {
    const r = classifyBounce('SPF softfail — not authorised sender');
    expect(r.type).toBe('block');
  });
});

describe('classifyBounce — suppression list bucketing', () => {
  it('buckets nonexistent-address bounces as invalid_email', () => {
    expect(classifyBounce('550 User unknown').suppressionReason).toBe('invalid_email');
    expect(classifyBounce('550 no such user here').suppressionReason).toBe('invalid_email');
    expect(classifyBounce('mailbox does not exist').suppressionReason).toBe('invalid_email');
    expect(classifyBounce('5.1.1 bad destination mailbox address').suppressionReason).toBe(
      'invalid_email',
    );
  });

  it('buckets other permanent failures as hard_bounce', () => {
    expect(classifyBounce('account disabled').suppressionReason).toBe('hard_bounce');
    expect(classifyBounce(556).suppressionReason).toBe('hard_bounce');
  });

  it('buckets policy rejections as block (but does not auto-suppress)', () => {
    const r = classifyBounce('554 blocked by policy violation');
    expect(r.suppressionReason).toBe('block');
    expect(r.autoSuppress).toBe(false);
  });

  it('does not assign a suppression list to soft/unknown bounces', () => {
    expect(classifyBounce(452).suppressionReason).toBeNull();
    expect(classifyBounce('something completely unexpected').suppressionReason).toBeNull();
  });
});

describe('classifyBounce — unknown', () => {
  it('returns unknown for unrecognised message with no code', () => {
    const r = classifyBounce('something completely unexpected happened');
    expect(r.type).toBe('unknown');
    expect(r.autoSuppress).toBe(false);
  });
});

// shouldSuppressAfterSoftBounces (suppress after n soft bounces) was deleted in
// Z139: nothing called it, and the address is now suppressed when a message
// definitively fails on soft bounces (mta-sender, last attempt), not after a
// count of them.

describe('dsnStatusClass', () => {
  it('reads the RFC 3464 Status field', () => {
    expect(dsnStatusClass('Action: delayed\nStatus: 4.4.7\n')).toBe(4);
    expect(dsnStatusClass('Action: failed\nStatus: 5.1.1\n')).toBe(5);
    expect(dsnStatusClass('  status: 2.0.0')).toBe(2);
  });

  it('is null without one, and does not read a status out of prose', () => {
    expect(dsnStatusClass('Diagnostic-Code: smtp; 550 5.1.1 user unknown')).toBeNull();
  });
});

describe('dsnIsTransient', () => {
  const body = (status: string, diag: string) =>
    `Final-Recipient: rfc822; a@b.test\nStatus: ${status}\nDiagnostic-Code: smtp; ${diag}`;

  it('a 4.x.x status is a deferral whatever the words say', () => {
    const b = body('4.4.7', '451 4.4.7 delivery delayed — user unknown');
    expect(dsnIsTransient(b, classifyBounce(b, b))).toBe(true);
  });

  it('a 5.x.x status is not, and policy stays block', () => {
    const hard = body('5.1.1', '550 5.1.1 user unknown');
    expect(dsnIsTransient(hard, classifyBounce(hard, hard))).toBe(false);
    const policy = body('5.7.1', '550 5.7.1 rejected by policy');
    expect(classifyBounce(policy, policy).type).toBe('block');
    expect(dsnIsTransient(policy, classifyBounce(policy, policy))).toBe(false);
  });

  it('without a Status field, the classification decides', () => {
    const soft = 'Diagnostic-Code: smtp; 452 mailbox full, try again later';
    expect(dsnIsTransient(soft, classifyBounce(soft, soft))).toBe(true);
    const hard = 'Diagnostic-Code: smtp; 550 5.1.1 user unknown';
    expect(dsnIsTransient(hard, classifyBounce(hard, hard))).toBe(false);
  });
});

describe('dsnAction', () => {
  it('reads the RFC 3464 Action field', () => {
    expect(dsnAction('Action: failed\nStatus: 4.4.7')).toBe('failed');
    expect(dsnAction('  action: Delayed')).toBe('delayed');
    expect(dsnAction('Diagnostic-Code: smtp; 550 the action failed')).toBeNull();
  });
});

describe('classifyDsn (Z140)', () => {
  const dsn = (lines: string[]) => ['Final-Recipient: rfc822; a@b.test', ...lines].join('\n');

  it('Action: failed on 4.4.7 is a definitive soft failure that suppresses (hard_bounce)', () => {
    const r = classifyDsn(
      dsn(['Action: failed', 'Status: 4.4.7', 'Diagnostic-Code: smtp; 421 4.4.7 Message expired']),
    );
    expect(r).toMatchObject({ event: 'bounce', bounceType: 'soft', suppress: 'hard_bounce' });
  });

  it('Action: delayed, delivered, relayed are deferrals that suppress nothing', () => {
    for (const action of ['delayed', 'delivered', 'relayed']) {
      const r = classifyDsn(
        dsn([`Action: ${action}`, 'Status: 4.4.7', 'Diagnostic-Code: smtp; 550 5.1.1 quoted']),
      );
      expect(r).toMatchObject({ event: 'deferred', bounceType: null, suppress: null });
    }
  });

  it('a block never suppresses — SMTP-side policy, with or without Action', () => {
    for (const lines of [
      ['Action: failed', 'Status: 5.7.1', 'Diagnostic-Code: smtp; 550 5.7.1 rejected by policy'],
      ['Status: 5.7.1', 'Diagnostic-Code: smtp; 550 5.7.1 rejected by policy'],
    ]) {
      expect(classifyDsn(dsn(lines))).toMatchObject({
        event: 'bounce',
        bounceType: 'block',
        suppress: null,
      });
    }
  });

  it('a hard failure suppresses on the list it belongs to', () => {
    expect(
      classifyDsn(
        dsn(['Action: failed', 'Status: 5.1.1', 'Diagnostic-Code: smtp; 550 5.1.1 user unknown']),
      ),
    ).toMatchObject({ event: 'bounce', bounceType: 'hard', suppress: 'invalid_email' });
    expect(
      classifyDsn(
        dsn(['Action: failed', 'Status: 5.2.2', 'Diagnostic-Code: smtp; 552 5.2.2 Mailbox full']),
      ),
    ).toMatchObject({ event: 'bounce', bounceType: 'hard', suppress: 'hard_bounce' });
  });

  it('a DSN nothing can read is a soft bounce, never suppressed, and says so', () => {
    expect(classifyDsn('Your message could not be processed by the remote system.')).toMatchObject({
      event: 'bounce',
      bounceType: 'soft',
      suppress: null,
      unclassified: true,
    });
    expect(classifyDsn(dsn(['Action: failed', 'something went wrong']))).toMatchObject({
      bounceType: 'soft',
      suppress: null,
      unclassified: true,
    });
  });

  it('without an Action, Z139 holds: 4.x.x is a deferral even when it quotes 5.1.1', () => {
    expect(
      classifyDsn(dsn(['Status: 4.4.7', 'Diagnostic-Code: smtp; 451 4.4.7 earlier: 550 5.1.1'])),
    ).toMatchObject({ event: 'deferred', suppress: null });
  });
});

describe('isBounceMessage', () => {
  it('detects mailer-daemon / postmaster senders', () => {
    expect(isBounceMessage('MAILER-DAEMON@gmail.com')).toBe(true);
    expect(isBounceMessage('postmaster@seznam.cz')).toBe(true);
  });

  it('detects DSN subjects', () => {
    expect(isBounceMessage('x@y.com', 'Delivery Status Notification (Failure)')).toBe(true);
    expect(isBounceMessage('x@y.com', 'Undeliverable: Your invoice')).toBe(true);
    expect(isBounceMessage('x@y.com', 'Mail delivery failed: returning message to sender')).toBe(
      true,
    );
  });

  it('does not flag a normal reply', () => {
    expect(isBounceMessage('jana@firma.cz', 'Re: your quote')).toBe(false);
  });
});

describe('extractFailedRecipient', () => {
  it('parses RFC 3464 Final-Recipient', () => {
    const body =
      'Diagnostic-Code: smtp; 550 5.1.1 user unknown\nFinal-Recipient: rfc822; bob@example.com\n';
    expect(extractFailedRecipient(body)).toBe('bob@example.com');
  });

  it('falls back to a "failed" pattern', () => {
    expect(extractFailedRecipient('The following address failed: alice@example.org')).toBe(
      'alice@example.org',
    );
  });

  it('returns null when no address present', () => {
    expect(extractFailedRecipient('no addresses here')).toBeNull();
  });
});
