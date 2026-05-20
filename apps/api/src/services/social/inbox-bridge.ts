/**
 * Social inbox bridge (#297) — routes social comments/DMs into the Universal Inbox.
 * Called when a mention is ingested with type=comment or type=dm.
 */

import { routeInbound } from '../helpdesk/universal-inbox.js';
import type { InboxChannel } from '../helpdesk/universal-inbox.js';

const PLATFORM_CHANNEL_MAP: Record<string, InboxChannel> = {
  twitter: 'twitter',
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
};

export async function bridgeMentionToInbox(
  orgId: string,
  mention: {
    platform: string;
    platformMentionId: string;
    type: string;
    authorUsername?: string | null;
    authorId?: string | null;
    body?: string | null;
    url?: string | null;
    rawData?: Record<string, unknown>;
  },
) {
  const channel: InboxChannel =
    mention.type === 'dm'
      ? (PLATFORM_CHANNEL_MAP[mention.platform] ?? 'social_dm')
      : 'social_comment';

  return routeInbound({
    orgId,
    channel,
    externalThreadId: mention.platformMentionId,
    externalMessageId: mention.platformMentionId,
    identity: {
      socialId: mention.authorId ?? mention.authorUsername ?? undefined,
    },
    body: mention.body ?? '',
    channelMetadata: {
      platform: mention.platform,
      type: mention.type,
      url: mention.url,
      ...mention.rawData,
    },
  });
}
