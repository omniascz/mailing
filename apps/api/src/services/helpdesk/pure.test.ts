import { describe, it, expect } from 'vitest';
import {
  normalizeInboxIdentity,
  channelTrust,
  chooseReuseTicket,
  type ReuseCandidate,
} from './pure.js';

describe('normalizeInboxIdentity', () => {
  it('lowercases + trims email', () => {
    const id = normalizeInboxIdentity({ email: '  Petr@Example.CZ ' });
    expect(id.email).toBe('petr@example.cz');
  });

  it('strips non-digit chars from phone', () => {
    expect(
      normalizeInboxIdentity({ phone: '+420 777 123 456' }).phone,
    ).toBe('+420777123456');
  });

  it('drops phones shorter than 8 digits', () => {
    expect(normalizeInboxIdentity({ phone: '1234' }).phone).toBeNull();
  });

  it('trims socialId but preserves case', () => {
    expect(
      normalizeInboxIdentity({ socialId: '  @AnnaDvorakova  ' }).socialId,
    ).toBe('@AnnaDvorakova');
  });

  it('returns nulls for missing inputs', () => {
    expect(normalizeInboxIdentity({})).toEqual({
      email: null,
      phone: null,
      socialId: null,
    });
  });
});

describe('channelTrust', () => {
  it('email/whatsapp rank highest for merging', () => {
    expect(channelTrust('email')).toBeGreaterThanOrEqual(channelTrust('whatsapp'));
    expect(channelTrust('whatsapp')).toBeGreaterThan(channelTrust('voice'));
  });

  it('social comments rank below DMs', () => {
    expect(channelTrust('social_comment')).toBeLessThan(channelTrust('social_dm'));
  });
});

describe('chooseReuseTicket', () => {
  const now = new Date('2026-04-24T12:00:00Z');
  const mk = (
    id: string,
    minutesAgo: number,
    status: ReuseCandidate['status'] = 'open',
    channel: ReuseCandidate['channel'] = 'email',
  ): ReuseCandidate => ({
    ticketId: id,
    channel,
    lastMessageAt: new Date(now.getTime() - minutesAgo * 60_000),
    status,
  });

  it('prefers thread match over identity/contact', () => {
    const res = chooseReuseTicket({
      now,
      candidatesByChannel: [mk('thread-1', 10)],
      candidatesByIdentity: [mk('id-1', 5)],
      candidatesByContact: [mk('contact-1', 1)],
    });
    expect(res).toEqual({ ticketId: 'thread-1', reason: 'thread' });
  });

  it('falls through to identity when no thread match', () => {
    const res = chooseReuseTicket({
      now,
      candidatesByChannel: [],
      candidatesByIdentity: [mk('id-older', 60), mk('id-newest', 5)],
      candidatesByContact: [mk('contact-1', 1)],
    });
    expect(res.ticketId).toBe('id-newest');
    expect(res.reason).toBe('identity');
  });

  it('uses contact match only for open tickets within window', () => {
    const res = chooseReuseTicket({
      now,
      candidatesByChannel: [],
      candidatesByIdentity: [],
      candidatesByContact: [mk('stale', 9 * 1440), mk('fresh', 30)],
    });
    expect(res.ticketId).toBe('fresh');
    expect(res.reason).toBe('contact');
  });

  it('rejects contact match for closed tickets', () => {
    const res = chooseReuseTicket({
      now,
      candidatesByChannel: [],
      candidatesByIdentity: [],
      candidatesByContact: [mk('closed', 10, 'closed')],
    });
    expect(res.ticketId).toBeNull();
    expect(res.reason).toBe('none');
  });

  it('ignores closed tickets in thread + identity match too', () => {
    const res = chooseReuseTicket({
      now,
      candidatesByChannel: [mk('closed-thread', 1, 'closed')],
      candidatesByIdentity: [mk('closed-id', 1, 'closed')],
      candidatesByContact: [],
    });
    expect(res.ticketId).toBeNull();
  });

  it('falls back to "none" when no candidates', () => {
    expect(
      chooseReuseTicket({
        now,
        candidatesByChannel: [],
        candidatesByIdentity: [],
        candidatesByContact: [],
      }),
    ).toEqual({ ticketId: null, reason: 'none' });
  });
});
