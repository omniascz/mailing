/**
 * BotSense — open/click bot detection.
 *
 * Mailbox providers (Gmail, Outlook, Apple) and security gateways (Mimecast,
 * Proofpoint, Microsoft ATP) routinely fetch tracking pixels and visit URLs to
 * scan them for malware. Counting those as "real engagement" inflates open and
 * click rates and corrupts engagement-driven segmentation, lead scoring, and
 * predictive analytics.
 *
 * This module assigns each event a 0-1 bot score plus a list of triggered
 * rules. Anything above `BOT_THRESHOLD` (default 0.6) is flagged `is_bot=true`
 * and excluded from engagement metrics — but still stored, so audits and
 * deliverability dashboards can show the suppressed totals.
 *
 * Heuristics (each adds weight, capped at 1.0):
 *   - UA matches a known bot/scanner pattern (Mimecast, ProofPoint, GoogleImageProxy…).
 *   - UA missing or generic (most legitimate clients send descriptive UAs).
 *   - Click happened < 2 s after open (humans don't read that fast).
 *   - Multiple distinct links clicked in < 1 s window (link prefetch).
 *   - Same IP fired both open and click (some scanners do this; humans often
 *     hit different IPs because the open is tracked at the gateway, the click
 *     at the user's browser).
 *
 * The scorer is provider-agnostic and stateless aside from the click cluster
 * lookup, which uses a small in-memory ring per session. For higher accuracy
 * we'd swap in a trained model on labelled data, but the heuristics catch the
 * common cases without ML and run in microseconds.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';

const BOT_UA_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: 'mimecast', re: /mimecast/i },
  { id: 'proofpoint', re: /proofpoint/i },
  { id: 'barracuda', re: /barracuda/i },
  { id: 'symantec', re: /symantec/i },
  { id: 'cisco-ironport', re: /ironport|ESA/i },
  { id: 'forcepoint', re: /forcepoint/i },
  { id: 'microsoft-atp', re: /microsoft.*safelink|atp\b/i },
  { id: 'google-image-proxy', re: /GoogleImageProxy/i },
  { id: 'yahoo-mail-proxy', re: /YahooMailProxy/i },
  { id: 'apple-mail-privacy', re: /Mac OS X .* AppleWebKit.* Mail/i },
  { id: 'curl', re: /^curl\//i },
  { id: 'wget', re: /^Wget\//i },
  { id: 'python-requests', re: /python-requests/i },
  { id: 'go-http', re: /^Go-http-client/i },
  { id: 'java', re: /^Java\//i },
  { id: 'headless', re: /HeadlessChrome|PhantomJS|puppeteer/i },
  { id: 'bot-keyword', re: /\b(bot|crawler|spider|scanner|monitor|preview|fetcher)\b/i },
];

export interface EventForScoring {
  eventType: 'open' | 'click' | string;
  userAgent?: string | null;
  ipAddress?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  messageId?: string | null;
  /** Time of *this* event. */
  occurredAt?: Date;
  /** Time of the matching open event for this message, if known (for click scoring). */
  openOccurredAt?: Date;
  /** IP of the open event (to detect when same IP fires both open+click). */
  openIpAddress?: string | null;
  linkUrl?: string | null;
  /** Other clicks from the same message in the last few seconds (for cluster detection). */
  recentClicksSameMessage?: Array<{ occurredAt: Date; linkUrl?: string | null }>;
}

export interface BotVerdict {
  isBot: boolean;
  score: number;
  reasons: string[];
}

const BOT_THRESHOLD = 0.6;

export function scoreEvent(evt: EventForScoring): BotVerdict {
  const reasons: string[] = [];
  let score = 0;
  const ua = (evt.userAgent ?? '').trim();

  if (!ua) {
    score += 0.4;
    reasons.push('ua-missing');
  } else {
    for (const p of BOT_UA_PATTERNS) {
      if (p.re.test(ua)) {
        score += 0.7;
        reasons.push(`ua:${p.id}`);
        break;
      }
    }
    if (ua.length < 16) {
      score += 0.2;
      reasons.push('ua-short');
    }
  }

  if (evt.eventType === 'click' && evt.openOccurredAt && evt.occurredAt) {
    const deltaMs = evt.occurredAt.getTime() - evt.openOccurredAt.getTime();
    if (deltaMs >= 0 && deltaMs < 2_000) {
      score += 0.5;
      reasons.push('click-too-fast');
    }
  }

  // Same IP fired both open and click — strong signal (security scanners follow
  // links from the same gateway IP that rendered the open pixel).
  // Humans typically open on a mail gateway (different IP) and click in a browser.
  if (
    evt.eventType === 'click' &&
    evt.ipAddress &&
    evt.openIpAddress &&
    evt.ipAddress === evt.openIpAddress
  ) {
    score += 0.4;
    reasons.push('open-click-same-ip');
  }

  if (evt.eventType === 'click' && evt.recentClicksSameMessage) {
    const cluster = evt.recentClicksSameMessage.filter((c) => {
      const t = evt.occurredAt?.getTime() ?? Date.now();
      return Math.abs(t - c.occurredAt.getTime()) < 1_000;
    });
    const distinctUrls = new Set(cluster.map((c) => c.linkUrl).filter(Boolean));
    if (distinctUrls.size >= 3) {
      score += 0.5;
      reasons.push('link-prefetch');
    }
  }

  if (score > 1) score = 1;
  return { isBot: score >= BOT_THRESHOLD, score, reasons };
}

/**
 * Convenience: score an event and update the row in place. Useful when the
 * write path already has the row id and we'd rather defer scoring than block
 * the ingest path.
 */
export async function scoreAndPersist(eventId: string, evt: EventForScoring): Promise<BotVerdict> {
  const verdict = scoreEvent(evt);
  await db
    .update(emailEvents)
    .set({
      isBot: verdict.isBot,
      botScore: verdict.score,
      botReason: verdict.reasons.join(',') || null,
    })
    .where(sql`${emailEvents.id} = ${eventId}::uuid`);
  return verdict;
}

/**
 * Backfill bot scores for events that don't have one yet. Returns count
 * processed. Designed to run as a periodic job after a deploy that introduces
 * new heuristics.
 */
export async function backfillScores(
  opts: { orgId?: string; limit?: number } = {},
): Promise<number> {
  const limit = Math.min(opts.limit ?? 1000, 10_000);
  const rows = (await db.execute(sql`
    SELECT id, event_type, user_agent, ip_address, campaign_id, contact_id, message_id, created_at
    FROM email_events
    WHERE bot_score IS NULL
      ${opts.orgId ? sql`AND org_id = ${opts.orgId}::uuid` : sql``}
      AND event_type IN ('open', 'click')
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    id: string;
    event_type: string;
    user_agent: string | null;
    ip_address: string | null;
    campaign_id: string | null;
    contact_id: string | null;
    message_id: string | null;
    created_at: Date;
  }>;

  for (const r of rows) {
    const v = scoreEvent({
      eventType: r.event_type,
      userAgent: r.user_agent,
      ipAddress: r.ip_address,
      campaignId: r.campaign_id,
      contactId: r.contact_id,
      messageId: r.message_id,
      occurredAt: r.created_at,
    });
    await db
      .update(emailEvents)
      .set({ isBot: v.isBot, botScore: v.score, botReason: v.reasons.join(',') || null })
      .where(sql`${emailEvents.id} = ${r.id}::uuid`);
  }
  return rows.length;
}

export const _internal = { BOT_UA_PATTERNS, BOT_THRESHOLD };
