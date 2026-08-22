/**
 * Auto-create meeting video links (#259).
 *
 * Supported providers:
 *   - zoom         — Zoom Meetings API (OAuth)
 *   - teams        — Microsoft Graph API (createOnlineMeeting)
 *   - custom       — static URL pass-through
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

export interface VideoLinkInput {
  title: string;
  startAt: Date;
  endAt: Date;
  hostUserId: string;
  inviteeEmail: string;
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
    default:
      return null;
  }
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

async function createZoomMeeting(input: VideoLinkInput): Promise<string | null> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return null;

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
  if (!tenantId || !clientId || !clientSecret) return null;

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
