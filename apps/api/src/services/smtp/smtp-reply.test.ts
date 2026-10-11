import { describe, it, expect } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import { smtpReplyFor, submissionPorts, suppressedRecipientReply } from './smtp-reply.js';

describe('what the submission server answers (Z131)', () => {
  it('a refusal that will not change is permanent: 550, with the reason', () => {
    const from = new AppError({
      code: 'FROM_NOT_VERIFIED',
      statusCode: 403,
      message: 'This From address is not a verified sender for your account.',
    });
    expect(smtpReplyFor(from)).toEqual({
      code: 550,
      enhanced: '5.7.1',
      text: 'This From address is not a verified sender for your account.',
    });
    const plan = AppError.forbidden(
      'Free plan send limit reached (2500/mo). Upgrade or wait until next month.',
    );
    expect(smtpReplyFor(plan)).toMatchObject({
      code: 550,
      text: expect.stringContaining('send limit reached'),
    });
    expect(smtpReplyFor(AppError.badRequest('No From address in message')).code).toBe(550);
  });

  it('the send-rate limit is temporary: 451 4.7.0', () => {
    expect(
      smtpReplyFor(AppError.tooManyRequests('Send rate limit exceeded (1/sec) — retry shortly')),
    ).toEqual({
      code: 451,
      enhanced: '4.7.0',
      text: 'Send rate limit exceeded (1/sec) - retry shortly',
    });
  });

  it('anything unexpected is temporary: 451 4.3.0, without the internals', () => {
    expect(smtpReplyFor(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toEqual({
      code: 451,
      enhanced: '4.3.0',
      text: 'Temporary failure, try again later',
    });
    expect(smtpReplyFor(AppError.internal('boom')).code).toBe(451);
  });

  it('a reply is one printable line', () => {
    const r = smtpReplyFor(AppError.forbidden('line one\r\nline two “quoted”'));
    expect(r.text).toBe('line one line two "quoted"');
  });

  it('a suppressed recipient: 550 5.7.1 naming the address and the reason', () => {
    expect(suppressedRecipientReply('a@b.test', 'hard_bounce')).toEqual({
      code: 550,
      enhanced: '5.7.1',
      text: "Recipient <a@b.test> is on this account's suppression list (hard_bounce); not sent, not billed",
    });
  });

  it('advertises the one port the engine listens on, and none when it is off', () => {
    expect(submissionPorts(':587')).toEqual([587]);
    expect(submissionPorts('0.0.0.0:2587')).toEqual([2587]);
    expect(submissionPorts('')).toEqual([]);
    expect(submissionPorts(undefined)).toEqual([]);
    expect(submissionPorts('nonsense')).toEqual([]);
  });
});
