/**
 * Auto-create meeting video links (#259).
 *
 * Supported providers:
 *   - zoom         — Zoom Meetings API (OAuth)
 *   - teams        — Microsoft Graph API (createOnlineMeeting)
 *   - custom       — static URL pass-through, validated (see customLink)
 *
 * google_meet is NOT supported and is not an option any more.
 *
 * It used to be, in the sense that this file answered the call. It did not talk
 * to Google: it built a Meet code out of Math.random() and returned
 * https://meet.google.com/<random>. The booking was then stored
 * status:'confirmed' with that URL, so an invitee got a confirmation for a
 * meeting with a link that has never existed and cannot be joined. A dead link
 * is worse than a missing one — the invitee blocks the slot and finds out at
 * the start of the call.
 *
 * Creating a real Meet link needs the Calendar API with a per-user OAuth token
 * (conferenceData.createRequest against the calendar integration). That is not
 * built, so the option is gone rather than faked.
 */

import { assertAllowedScheme, isPublicAddress } from '../../lib/safe-fetch.js';
import { AppError } from '../../lib/app-error.js';

export interface VideoLinkInput {
  title: string;
  startAt: Date;
  endAt: Date;
  hostUserId: string;
  inviteeEmail: string;
  /** For 'custom': the URL the host configured on the event type. */
  locationValue?: string | null;
}

export interface VideoLinkResult {
  url: string;
  provider: string;
  joinUrl?: string;
  hostUrl?: string;
  meetingId?: string;
  password?: string;
}

export async function createVideoLink(
  locationType: string,
  input: VideoLinkInput,
): Promise<string | null> {
  switch (locationType) {
    case 'zoom':
      return createZoomMeeting(input);
    case 'teams':
      return createTeamsMeeting(input);
    case 'custom':
      return customLink(input.locationValue);
    default:
      return null;
  }
}

// ─── custom ───────────────────────────────────────────────────────────────────

/**
 * The host's own URL, handed straight to the invitee.
 *
 * The docblock at the top of this file has promised 'custom' as a "static URL
 * pass-through" since it was written, the API's enum accepts it and
 * availableLocationTypes() offers it — but the switch had no case for it, so
 * every custom booking fell to `default: return null` and was stored with no
 * meeting URL at all. It is not a video provider, so bookingWouldBeEmpty let it
 * through: the booking was confirmed, and the link the host had configured was
 * simply dropped on the floor.
 *
 * Validated, not fetched. Nothing on our side ever requests this address — it
 * goes into a page and an email for a person to click — so the full
 * assertUrlIsFetchable, which resolves DNS to catch rebinding, buys nothing
 * here and would add a network round trip and a failure mode to the booking
 * path. What matters is what a browser would do with it:
 *
 *   - the scheme, because `javascript:` in an href is script execution in
 *     whatever renders it, and `data:` is a page we did not write;
 *   - a literal private or loopback address, because handing an invitee
 *     http://10.0.0.5/… or http://localhost/… is either a mistake or an
 *     attempt to make somebody else's browser reach inside a network.
 *
 * A hostname that merely resolves privately is out of scope on purpose: that is
 * a DNS question, it changes between now and the click, and this URL is never
 * fetched by us.
 */
export function customLink(locationValue: string | null | undefined): string {
  if (!locationValue || !locationValue.trim()) {
    throw new AppError({
      code: 'CUSTOM_LOCATION_MISSING',
      statusCode: 400,
      message:
        'This event type is set to a custom location but has no URL configured. ' +
        'Set one on the event type, or use a physical location.',
    });
  }

  let url: URL;
  try {
    url = new URL(locationValue.trim());
  } catch {
    throw new AppError({
      code: 'CUSTOM_LOCATION_INVALID',
      statusCode: 400,
      message: `The custom meeting location is not a URL: ${locationValue}`,
    });
  }

  try {
    assertAllowedScheme(url);
  } catch {
    throw new AppError({
      code: 'CUSTOM_LOCATION_INVALID',
      statusCode: 400,
      message: `The custom meeting location must be http or https, not ${url.protocol.replace(':', '')}.`,
    });
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isLiteralAddress = /^[0-9.]+$/.test(host) || host.includes(':');
  if (host === 'localhost' || (isLiteralAddress && !isPublicAddress(host))) {
    throw new AppError({
      code: 'CUSTOM_LOCATION_INVALID',
      statusCode: 400,
      message:
        `The custom meeting location points at a private or loopback address (${host}), ` +
        'which an invitee cannot reach.',
    });
  }

  return url.toString();
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

async function createZoomMeeting(input: VideoLinkInput): Promise<string | null> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  // Throw, not `return null`.
  //
  // The caller wraps this in a .catch() that logs the reason and falls back to
  // the event type's locationValue. Returning null skipped both: the catch
  // never ran, nothing was logged, and the fallback never applied. The booking
  // then either lost its location silently or was refused with a message that
  // could not say why. assertLocationTypeAvailable stops most of these at event
  // type creation, but not credentials removed afterwards, and not an event
  // type that predates the check.
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      'Zoom is not configured: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET are required.',
    );
  }

  // Server-to-server OAuth token
  const tokenRes = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  ).catch(() => null);
  if (!tokenRes?.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const body = {
    topic: input.title,
    type: 2, // scheduled
    start_time: input.startAt.toISOString(),
    duration: Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60000),
    settings: {
      join_before_host: false,
      waiting_room: true,
      meeting_invitees: [{ email: input.inviteeEmail }],
    },
  };

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!res?.ok) return null;
  const data = (await res.json()) as { join_url?: string };
  return data.join_url ?? null;
}

// ─── Microsoft Teams ──────────────────────────────────────────────────────────

async function createTeamsMeeting(input: VideoLinkInput): Promise<string | null> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  // Same reasoning as Zoom above: silence here disabled the caller's fallback.
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Teams is not configured: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and ' +
        'MICROSOFT_CLIENT_SECRET are required.',
    );
  }

  // Get app token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  }).catch(() => null);
  if (!tokenRes?.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${input.hostUserId}/onlineMeetings`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDateTime: input.startAt.toISOString(),
        endDateTime: input.endAt.toISOString(),
        subject: input.title,
      }),
    },
  ).catch(() => null);

  if (!res?.ok) return null;
  const data = (await res.json()) as { joinWebUrl?: string };
  return data.joinWebUrl ?? null;
}
