/**
 * LinkedIn InMail adapter for sales sequences (#328).
 *
 * Sends an InMail message via the LinkedIn Marketing Developer Platform API.
 * Requires the org to have a connected LinkedIn account with Message Ads
 * permissions (OAuth 2.0 scopes: r_emailaddress, w_member_social).
 *
 * OAuth tokens are stored in `oauth_apps` table (provider = 'linkedin').
 * Falls back gracefully: if no token → creates a task "Send LinkedIn InMail"
 * for manual follow-up.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialAccounts } from '../../db/schema/index.js';

export interface LinkedInInMailOptions {
  orgId: string;
  /** LinkedIn member URN of the recipient, e.g. "urn:li:person:ABC123" */
  recipientUrn: string;
  subject: string;
  body: string;
  /** Optional sender LinkedIn member URN (defaults to org's connected account) */
  senderUrn?: string;
}

export interface LinkedInSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** True when we fell back to creating a manual task (no token configured) */
  manualFallback?: boolean;
}

/**
 * Resolves the OAuth access token for LinkedIn for this org.
 * Returns null if no LinkedIn OAuth app is connected.
 */
async function resolveLinkedInToken(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ accessToken: socialAccounts.accessToken })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.platform, 'linkedin'),
        eq(socialAccounts.active, true),
      ),
    )
    .limit(1);
  return row?.accessToken ?? null;
}

/**
 * Sends a LinkedIn InMail message.
 * If no LinkedIn token is configured, returns manualFallback: true.
 */
export async function sendLinkedInInMail(opts: LinkedInInMailOptions): Promise<LinkedInSendResult> {
  const token = await resolveLinkedInToken(opts.orgId);

  if (!token) {
    return {
      success: false,
      manualFallback: true,
      error: 'No LinkedIn OAuth token configured. Please connect a LinkedIn account.',
    };
  }

  try {
    const payload = {
      recipients: {
        values: [
          {
            'com.linkedin.talk.MemberRecipient': {
              to: opts.recipientUrn,
            },
          },
        ],
      },
      subject: opts.subject,
      body: opts.body,
      messageType: 'INMAIL',
    };

    const resp = await fetch('https://api.linkedin.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, error: `LinkedIn API error ${resp.status}: ${errBody}` };
    }

    const location = resp.headers.get('x-restli-id') ?? resp.headers.get('Location') ?? '';
    return { success: true, messageId: location };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Resolves a contact's LinkedIn member URN from their enrichment data or
 * profile URL stored in custom fields / metadata.
 * Returns null if not resolvable.
 */
export function extractLinkedInUrn(linkedInProfileUrl: string | null | undefined): string | null {
  if (!linkedInProfileUrl) return null;
  // linkedin.com/in/username → we cannot derive URN without API lookup
  // Return the URL as a fallback identifier; the actual URN requires enrichment
  return linkedInProfileUrl.includes('urn:li:person:') ? linkedInProfileUrl : null;
}
