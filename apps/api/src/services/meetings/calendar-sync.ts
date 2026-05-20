/**
 * Calendar sync — Google Calendar + Microsoft Outlook (#258)
 *
 * Connects a ForgeMsg user's external calendar via OAuth so we can:
 *   - Read their free/busy to present non-conflicting slots to invitees
 *   - Write events back when an invitee confirms a booking
 *   - Optionally push/pull via CalDAV for self-hosted setups
 *
 * Everything is provider-agnostic behind the ICalendarProvider interface.
 * Tokens are refreshed lazily on access.
 */

import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  calendarIntegrations,
  calendarEvents,
  bookings,
  type CalendarIntegration,
  type Booking,
} from '../../db/schema/calendar.js';
import { AppError } from '../../lib/app-error.js';

// ─── Provider interface ──────────────────────────────────────────────────────

export interface ICalendarProvider {
  readonly id: 'google' | 'microsoft' | 'caldav';
  exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet>;
  refreshToken(refreshToken: string): Promise<OAuthTokenSet>;
  listCalendars(
    accessToken: string,
  ): Promise<Array<{ id: string; name: string; primary?: boolean }>>;
  fetchEvents(
    accessToken: string,
    calendarId: string,
    opts: {
      timeMin: Date;
      timeMax: Date;
      syncToken?: string;
    },
  ): Promise<{ events: NormalizedEvent[]; nextSyncToken?: string }>;
  createEvent(accessToken: string, calendarId: string, input: CreateEventInput): Promise<string>;
  deleteEvent(accessToken: string, calendarId: string, externalEventId: string): Promise<void>;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
  externalAccountId: string;
  externalAccountEmail?: string;
}

export interface NormalizedEvent {
  externalEventId: string;
  title?: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status: string;
  busy: boolean;
  attendees: Array<{ email: string; responseStatus?: string }>;
  raw?: Record<string, unknown>;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  location?: string;
  attendees?: Array<{ email: string; name?: string }>;
  conferencing?: 'google-meet' | 'teams' | 'none';
}

// ─── Google Calendar ─────────────────────────────────────────────────────────

class GoogleCalendarProvider implements ICalendarProvider {
  readonly id = 'google' as const;
  private clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';

  async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    this.assertCreds();
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!resp.ok) throw AppError.unauthorized(`Google token exchange failed: ${await resp.text()}`);
    const token = (await resp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    const userInfo = await this.fetchUserInfo(token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(' '),
      externalAccountId: userInfo.sub,
      externalAccountEmail: userInfo.email,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    this.assertCreds();
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!resp.ok) throw AppError.unauthorized(`Google refresh failed: ${await resp.text()}`);
    const token = (await resp.json()) as {
      access_token: string;
      expires_in: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope?.split(' ') ?? [],
      externalAccountId: '', // unchanged — filled by caller from stored row
    };
  }

  private async fetchUserInfo(accessToken: string): Promise<{ sub: string; email: string }> {
    const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error('Google userinfo failed');
    return resp.json() as Promise<{ sub: string; email: string }>;
  }

  async listCalendars(
    accessToken: string,
  ): Promise<Array<{ id: string; name: string; primary?: boolean }>> {
    const resp = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error(`Google calendarList failed: ${resp.status}`);
    const data = (await resp.json()) as {
      items: Array<{ id: string; summary: string; primary?: boolean }>;
    };
    return data.items.map((c) => ({ id: c.id, name: c.summary, primary: c.primary }));
  }

  async fetchEvents(
    accessToken: string,
    calendarId: string,
    opts: { timeMin: Date; timeMax: Date; syncToken?: string },
  ): Promise<{ events: NormalizedEvent[]; nextSyncToken?: string }> {
    const params = new URLSearchParams({
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    if (opts.syncToken) params.set('syncToken', opts.syncToken);
    else {
      params.set('timeMin', opts.timeMin.toISOString());
      params.set('timeMax', opts.timeMax.toISOString());
    }
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) throw new Error(`Google fetchEvents failed: ${resp.status}`);
    const data = (await resp.json()) as {
      items: Array<{
        id: string;
        summary?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
        status?: string;
        transparency?: string;
        attendees?: Array<{ email: string; responseStatus?: string }>;
      }>;
      nextSyncToken?: string;
    };
    const events: NormalizedEvent[] = data.items.map((e) => {
      const allDay = !!(e.start.date && !e.start.dateTime);
      const startAt = new Date(e.start.dateTime ?? e.start.date ?? 0);
      const endAt = new Date(e.end.dateTime ?? e.end.date ?? 0);
      return {
        externalEventId: e.id,
        title: e.summary,
        startAt,
        endAt,
        allDay,
        status: e.status ?? 'confirmed',
        busy: e.transparency !== 'transparent',
        attendees: e.attendees ?? [],
      };
    });
    return { events, nextSyncToken: data.nextSyncToken };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    input: CreateEventInput,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone ?? 'UTC' },
      end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone ?? 'UTC' },
      location: input.location,
      attendees: input.attendees?.map((a) => ({ email: a.email, displayName: a.name })),
    };
    if (input.conferencing === 'google-meet') {
      body.conferenceData = { createRequest: { requestId: `fg-${Date.now()}` } };
    }
    const params = input.conferencing === 'google-meet' ? '?conferenceDataVersion=1' : '';
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${params}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) throw new Error(`Google createEvent failed: ${await resp.text()}`);
    const data = (await resp.json()) as { id: string };
    return data.id;
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${externalEventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  private assertCreds(): void {
    if (!this.clientId || !this.clientSecret)
      throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');
  }
}

// ─── Microsoft Graph (Outlook) ───────────────────────────────────────────────

class MicrosoftCalendarProvider implements ICalendarProvider {
  readonly id = 'microsoft' as const;
  private clientId = process.env.MS_CLIENT_ID ?? '';
  private clientSecret = process.env.MS_CLIENT_SECRET ?? '';
  private tenant = process.env.MS_TENANT ?? 'common';

  async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    this.assertCreds();
    const resp = await fetch(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!resp.ok)
      throw AppError.unauthorized(`Microsoft token exchange failed: ${await resp.text()}`);
    const token = (await resp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    const me = await this.fetchMe(token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope.split(' '),
      externalAccountId: me.id,
      externalAccountEmail: me.userPrincipalName ?? me.mail,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    this.assertCreds();
    const resp = await fetch(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!resp.ok) throw AppError.unauthorized(`Microsoft refresh failed: ${await resp.text()}`);
    const token = (await resp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope?.split(' ') ?? [],
      externalAccountId: '',
    };
  }

  private async fetchMe(
    accessToken: string,
  ): Promise<{ id: string; userPrincipalName?: string; mail?: string }> {
    const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error('Microsoft /me failed');
    return resp.json() as Promise<{ id: string; userPrincipalName?: string; mail?: string }>;
  }

  async listCalendars(
    accessToken: string,
  ): Promise<Array<{ id: string; name: string; primary?: boolean }>> {
    const resp = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error(`Microsoft listCalendars failed: ${resp.status}`);
    const data = (await resp.json()) as {
      value: Array<{ id: string; name: string; isDefaultCalendar?: boolean }>;
    };
    return data.value.map((c) => ({ id: c.id, name: c.name, primary: c.isDefaultCalendar }));
  }

  async fetchEvents(
    accessToken: string,
    calendarId: string,
    opts: { timeMin: Date; timeMax: Date; syncToken?: string },
  ): Promise<{ events: NormalizedEvent[]; nextSyncToken?: string }> {
    const url = opts.syncToken
      ? opts.syncToken
      : `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/calendarView` +
        `?startDateTime=${opts.timeMin.toISOString()}&endDateTime=${opts.timeMax.toISOString()}&$top=250`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'odata.track-changes',
      },
    });
    if (!resp.ok) throw new Error(`Microsoft fetchEvents failed: ${resp.status}`);
    const data = (await resp.json()) as {
      value: Array<{
        id: string;
        subject?: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
        showAs?: string;
        isAllDay?: boolean;
        attendees?: Array<{ emailAddress: { address: string }; status?: { response?: string } }>;
      }>;
      '@odata.deltaLink'?: string;
    };
    const events: NormalizedEvent[] = data.value.map((e) => ({
      externalEventId: e.id,
      title: e.subject,
      startAt: new Date(e.start.dateTime + 'Z'),
      endAt: new Date(e.end.dateTime + 'Z'),
      allDay: !!e.isAllDay,
      status: 'confirmed',
      busy: e.showAs !== 'free',
      attendees: (e.attendees ?? []).map((a) => ({
        email: a.emailAddress.address,
        responseStatus: a.status?.response,
      })),
    }));
    return { events, nextSyncToken: data['@odata.deltaLink'] };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    input: CreateEventInput,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      subject: input.title,
      body: input.description ? { contentType: 'text', content: input.description } : undefined,
      start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone ?? 'UTC' },
      end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone ?? 'UTC' },
      location: input.location ? { displayName: input.location } : undefined,
      attendees: input.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: 'required',
      })),
      isOnlineMeeting: input.conferencing === 'teams',
      onlineMeetingProvider: input.conferencing === 'teams' ? 'teamsForBusiness' : undefined,
    };
    const resp = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Microsoft createEvent failed: ${await resp.text()}`);
    const data = (await resp.json()) as { id: string };
    return data.id;
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    void calendarId;
  }

  private assertCreds(): void {
    if (!this.clientId || !this.clientSecret) throw new Error('MS_CLIENT_ID/SECRET not configured');
  }
}

// ─── Provider registry ───────────────────────────────────────────────────────

const providers = {
  google: new GoogleCalendarProvider(),
  microsoft: new MicrosoftCalendarProvider(),
};

export function getCalendarProvider(id: 'google' | 'microsoft'): ICalendarProvider {
  return providers[id];
}

// ─── OAuth URL builders ──────────────────────────────────────────────────────

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function buildMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) throw new Error('MS_CLIENT_ID not configured');
  const tenant = process.env.MS_TENANT ?? 'common';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'offline_access User.Read Calendars.ReadWrite',
    state,
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

// ─── Connect / disconnect ────────────────────────────────────────────────────

export async function connectCalendar(input: {
  orgId: string;
  userId: string;
  provider: 'google' | 'microsoft';
  code: string;
  redirectUri: string;
}): Promise<CalendarIntegration> {
  const p = getCalendarProvider(input.provider);
  const tokens = await p.exchangeAuthCode(input.code, input.redirectUri);

  // Pick the user's primary calendar as the default booking target
  const calendars = await p.listCalendars(tokens.accessToken);
  const primary = calendars.find((c) => c.primary) ?? calendars[0];

  const existing = await db
    .select()
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, input.userId),
        eq(calendarIntegrations.provider, input.provider),
        eq(calendarIntegrations.externalAccountId, tokens.externalAccountId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(calendarIntegrations)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? existing[0].refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        primaryCalendarId: primary?.id ?? existing[0].primaryCalendarId,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegrations.id, existing[0].id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(calendarIntegrations)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      provider: input.provider,
      externalAccountId: tokens.externalAccountId,
      externalAccountEmail: tokens.externalAccountEmail ?? null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      primaryCalendarId: primary?.id ?? null,
    })
    .returning();
  return row!;
}

export async function disconnectCalendar(orgId: string, integrationId: string): Promise<void> {
  await db
    .delete(calendarIntegrations)
    .where(and(eq(calendarIntegrations.id, integrationId), eq(calendarIntegrations.orgId, orgId)));
}

export async function listIntegrations(
  orgId: string,
  userId?: string,
): Promise<CalendarIntegration[]> {
  const conds = [eq(calendarIntegrations.orgId, orgId)];
  if (userId) conds.push(eq(calendarIntegrations.userId, userId));
  return db
    .select()
    .from(calendarIntegrations)
    .where(and(...conds));
}

// ─── Token refresh ───────────────────────────────────────────────────────────

async function getFreshAccessToken(integration: CalendarIntegration): Promise<string> {
  const skewMs = 60_000;
  if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() - Date.now() > skewMs) {
    return integration.accessToken;
  }
  if (!integration.refreshToken) {
    throw AppError.unauthorized('Calendar integration requires reconnect (no refresh token)');
  }
  const provider = integration.provider as 'google' | 'microsoft';
  if (provider !== 'google' && provider !== 'microsoft') {
    return integration.accessToken;
  }
  const fresh = await getCalendarProvider(provider).refreshToken(integration.refreshToken);
  await db
    .update(calendarIntegrations)
    .set({
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? integration.refreshToken,
      tokenExpiresAt: fresh.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, integration.id));
  return fresh.accessToken;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncIntegration(
  integrationId: string,
  window: { daysBack?: number; daysForward?: number } = {},
): Promise<{ imported: number; nextSyncToken: string | null }> {
  const [integration] = await db
    .select()
    .from(calendarIntegrations)
    .where(eq(calendarIntegrations.id, integrationId))
    .limit(1);
  if (!integration) throw AppError.notFound('Calendar integration');
  if (integration.provider !== 'google' && integration.provider !== 'microsoft') {
    throw AppError.badRequest('Unsupported provider for sync');
  }
  if (!integration.primaryCalendarId) {
    throw AppError.badRequest('No primary calendar selected');
  }

  const accessToken = await getFreshAccessToken(integration);
  const p = getCalendarProvider(integration.provider as 'google' | 'microsoft');
  const timeMin = new Date(Date.now() - (window.daysBack ?? 1) * 86_400_000);
  const timeMax = new Date(Date.now() + (window.daysForward ?? 60) * 86_400_000);

  const { events, nextSyncToken } = await p.fetchEvents(
    accessToken,
    integration.primaryCalendarId,
    {
      timeMin,
      timeMax,
      syncToken: integration.syncToken ?? undefined,
    },
  );

  let imported = 0;
  for (const e of events) {
    await db
      .insert(calendarEvents)
      .values({
        orgId: integration.orgId,
        integrationId: integration.id,
        externalEventId: e.externalEventId,
        calendarId: integration.primaryCalendarId,
        title: e.title ?? null,
        startAt: e.startAt,
        endAt: e.endAt,
        allDay: e.allDay,
        status: e.status,
        busy: e.busy,
        attendees: e.attendees,
      })
      .onConflictDoUpdate({
        target: [calendarEvents.integrationId, calendarEvents.externalEventId],
        set: {
          title: e.title ?? null,
          startAt: e.startAt,
          endAt: e.endAt,
          allDay: e.allDay,
          status: e.status,
          busy: e.busy,
          attendees: e.attendees,
          updatedAt: new Date(),
        },
      });
    imported++;
  }

  await db
    .update(calendarIntegrations)
    .set({
      syncToken: nextSyncToken ?? integration.syncToken,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, integration.id));

  return { imported, nextSyncToken: nextSyncToken ?? null };
}

// ─── Free/busy ───────────────────────────────────────────────────────────────

export async function getBusyIntervals(
  userId: string,
  from: Date,
  to: Date,
): Promise<Array<{ startAt: Date; endAt: Date }>> {
  const integrations = await db
    .select({ id: calendarIntegrations.id })
    .from(calendarIntegrations)
    .where(and(eq(calendarIntegrations.userId, userId), eq(calendarIntegrations.status, 'active')));
  if (integrations.length === 0) return [];

  const rows = await db
    .select({
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.busy, true),
        gte(calendarEvents.endAt, from),
        lte(calendarEvents.startAt, to),
      ),
    );

  return rows;
}

// ─── Bookings — create + push to provider ────────────────────────────────────

export async function createBooking(input: {
  orgId: string;
  hostUserId: string;
  inviteeEmail: string;
  inviteeName?: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  location?: string;
  conferencing?: 'google-meet' | 'teams' | 'none';
}): Promise<Booking> {
  const [integration] = await db
    .select()
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, input.hostUserId),
        eq(calendarIntegrations.orgId, input.orgId),
        eq(calendarIntegrations.status, 'active'),
      ),
    )
    .limit(1);

  let externalEventId: string | null = null;
  if (
    integration &&
    integration.primaryCalendarId &&
    (integration.provider === 'google' || integration.provider === 'microsoft')
  ) {
    const accessToken = await getFreshAccessToken(integration);
    externalEventId = await getCalendarProvider(integration.provider).createEvent(
      accessToken,
      integration.primaryCalendarId,
      {
        title: input.title,
        description: input.description,
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        location: input.location,
        attendees: [{ email: input.inviteeEmail, name: input.inviteeName }],
        conferencing: input.conferencing,
      },
    );
  }

  const [row] = await db
    .insert(bookings)
    .values({
      orgId: input.orgId,
      hostUserId: input.hostUserId,
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName ?? null,
      title: input.title,
      description: input.description ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone ?? null,
      location: input.location ?? null,
      externalEventId,
      integrationId: integration?.id ?? null,
    })
    .returning();
  return row!;
}

export async function cancelBooking(orgId: string, bookingId: string): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!booking) throw AppError.notFound('Booking');
  if (booking.integrationId && booking.externalEventId) {
    const [integration] = await db
      .select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.id, booking.integrationId))
      .limit(1);
    if (
      integration &&
      integration.primaryCalendarId &&
      (integration.provider === 'google' || integration.provider === 'microsoft')
    ) {
      const accessToken = await getFreshAccessToken(integration);
      await getCalendarProvider(integration.provider)
        .deleteEvent(accessToken, integration.primaryCalendarId, booking.externalEventId)
        .catch(() => null);
    }
  }
  await db
    .update(bookings)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
}
