/**
 * Universal Inbox pure helpers (#244/#401).
 *
 * Identity normalisation + channel prioritisation rules extracted out of
 * `universal-inbox.ts` so we can unit-test without loading the schema barrel.
 */

export type InboxChannel =
  | 'email'
  | 'chat'
  | 'sms'
  | 'whatsapp'
  | 'voice'
  | 'messenger'
  | 'twitter'
  | 'instagram'
  | 'viber'
  | 'rcs'
  | 'telegram'
  | 'webchat'
  | 'social_comment'
  | 'social_dm'
  | 'facebook'
  | 'linkedin'
  | 'tiktok';

/** Trust ordering for auto-merging inbound messages into an existing thread. */
export const CHANNEL_PRIORITY: Record<InboxChannel, number> = {
  email: 10,
  whatsapp: 9,
  sms: 9,
  viber: 9,
  rcs: 9,
  messenger: 8,
  facebook: 8,
  instagram: 8,
  telegram: 8,
  twitter: 7,
  social_dm: 7,
  linkedin: 7,
  tiktok: 7,
  social_comment: 5,
  chat: 6,
  webchat: 6,
  voice: 4,
};

export interface InboxIdentity {
  email?: string;
  phone?: string;
  socialId?: string;
}

export interface NormalizedIdentity {
  email: string | null;
  phone: string | null;
  socialId: string | null;
}

export function normalizeInboxIdentity(input: InboxIdentity): NormalizedIdentity {
  return {
    email: normEmail(input.email),
    phone: normPhone(input.phone),
    socialId: normSocial(input.socialId),
  };
}

function normEmail(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normPhone(v: string | undefined): string | null {
  if (!v) return null;
  const cleaned = v.replace(/[^+\d]/g, '');
  return cleaned.length >= 8 ? cleaned : null;
}

function normSocial(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Ticket-reuse decision ──────────────────────────────────────────────────

export interface ReuseCandidate {
  ticketId: string;
  channel: InboxChannel;
  lastMessageAt: Date;
  status: 'open' | 'pending' | 'closed';
}

export interface ReuseDecision {
  ticketId: string | null;
  reason: 'thread' | 'identity' | 'contact' | 'none';
}

/**
 * Pick the best existing ticket to merge a new inbound message into.
 *
 * Rules (first match wins):
 *   - "thread": same channel + same externalThreadId (delegated to DB lookup)
 *   - "identity": same channel + same identity → any open/pending ticket
 *   - "contact": any channel with the same contact → open ticket within
 *     `reuseWindowMs` of now
 *   - otherwise: null → create new ticket
 */
export function chooseReuseTicket(opts: {
  now: Date;
  candidatesByChannel: ReuseCandidate[];
  candidatesByIdentity: ReuseCandidate[];
  candidatesByContact: ReuseCandidate[];
  reuseWindowMs?: number;
}): ReuseDecision {
  const windowMs = opts.reuseWindowMs ?? 7 * 86_400_000;

  const threadPick = opts.candidatesByChannel.find((c) => c.status !== 'closed');
  if (threadPick) return { ticketId: threadPick.ticketId, reason: 'thread' };

  const identityPick = opts.candidatesByIdentity
    .filter((c) => c.status !== 'closed')
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())[0];
  if (identityPick) return { ticketId: identityPick.ticketId, reason: 'identity' };

  const cutoff = opts.now.getTime() - windowMs;
  const contactPick = opts.candidatesByContact
    .filter(
      (c) => c.status === 'open' && c.lastMessageAt.getTime() >= cutoff,
    )
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())[0];
  if (contactPick) return { ticketId: contactPick.ticketId, reason: 'contact' };

  return { ticketId: null, reason: 'none' };
}

export function channelTrust(channel: InboxChannel): number {
  return CHANNEL_PRIORITY[channel] ?? 0;
}
