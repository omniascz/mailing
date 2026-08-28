/**
 * What this deployment can actually do, derived from configuration.
 *
 * Several features answer a request whether or not the integration behind them
 * exists. Unconfigured, they did not fail — they produced something that looked
 * like a result: a booking confirmed with no meeting link, an inbox preview
 * "completed" against preview.mock.local, a geo panel that is permanently
 * empty. The user cannot tell those from a real answer.
 *
 * The fix is not to remove the features. It is to stop offering them when they
 * cannot work, and to offer them again the moment they can. So availability is
 * read from the environment on every call rather than captured at boot: setting
 * the variable brings the feature back with a restart and no code change.
 *
 * The frontend gets this from GET /api/v1/capabilities. It must not keep its
 * own copy of the environment — a second copy is a second thing to be wrong.
 */

import { AppError } from './app-error.js';

const configured = (...vars: Array<string | undefined>): boolean =>
  vars.every((v) => (v ?? '').trim() !== '');

/** Video providers a booking event type may be created with, in this deployment. */
export function availableVideoProviders(): string[] {
  const out: string[] = [];
  if (
    configured(
      process.env.ZOOM_ACCOUNT_ID,
      process.env.ZOOM_CLIENT_ID,
      process.env.ZOOM_CLIENT_SECRET,
    )
  ) {
    out.push('zoom');
  }
  if (
    configured(
      process.env.MICROSOFT_TENANT_ID,
      process.env.MICROSOFT_CLIENT_ID,
      process.env.MICROSOFT_CLIENT_SECRET,
    )
  ) {
    out.push('teams');
  }
  return out;
}

/** Location types an event type may be created with. The non-video ones always work. */
export function availableLocationTypes(): string[] {
  return ['physical', 'custom', ...availableVideoProviders()];
}

/** True when a location type needs a video provider we may not have. */
export function isVideoLocationType(locationType: string): boolean {
  return locationType === 'zoom' || locationType === 'teams';
}

/**
 * Inbox preview. Without a Litmus key `selectProvider()` falls back to a mock
 * that reports status:'completed' with screenshot URLs on preview.mock.local —
 * a finished-looking preview of broken images.
 *
 * INBOX_PREVIEW_PROVIDER=mock is an explicit opt-in and counts as available:
 * somebody asked for the mock by name, which is not the same as getting it
 * because nothing else was configured.
 */
export function inboxPreviewAvailable(): boolean {
  return configured(process.env.LITMUS_API_KEY) || process.env.INBOX_PREVIEW_PROVIDER === 'mock';
}

/** Geo analytics. lib/geo.ts resolves nothing without GEOIP_API_URL. */
export function geoAnalyticsAvailable(): boolean {
  return configured(process.env.GEOIP_API_URL);
}

/**
 * Multivariate tests. Always false, and not from configuration — unlike every
 * other capability here, this one is not waiting on a key.
 *
 * The feature is half-built. What exists is the half that runs AFTER the
 * numbers are in: a test can be created, started, and scored, and the scoring
 * picks the right winner when given real figures. What does not exist is
 * everything that would produce those figures — nothing assigns a variant when
 * a campaign is sent, nothing writes the per-variant counters, and nothing
 * rolls the winner out to the remaining audience. `test_audience_percent` and
 * `auto_send_winner` are stored on create and read by nothing.
 *
 * Measured end to end against a real database: a test created, started, and
 * processed after its window closes ends `completed` with winner_variant_id
 * NULL — every time, for every test, because every variant scores zero. Fill
 * the counters in by hand and the same code picks the winner correctly. So the
 * defect is not the arithmetic; it is that no figure ever reaches it.
 *
 * There is therefore nothing to switch on, which is why this takes no
 * environment variable. When the missing three layers are built, this becomes a
 * real check — or goes away.
 */
export function multivariateTestsAvailable(): boolean {
  return false;
}

/**
 * Refuse a video provider this deployment cannot reach.
 *
 * Without credentials createVideoLink returns null and the booking used to be
 * stored confirmed with meetingUrl: null — a confirmed meeting with nowhere to
 * go and no error anywhere. Rejecting when the event type is created puts the
 * message in front of the person who can fix it rather than the invitee who
 * cannot.
 */
export function assertLocationTypeAvailable(locationType: string | undefined): void {
  if (!locationType || !isVideoLocationType(locationType)) return;
  if (availableVideoProviders().includes(locationType)) return;
  throw new AppError({
    code: 'VIDEO_PROVIDER_NOT_CONFIGURED',
    statusCode: 400,
    message:
      `${locationType} is not configured in this deployment, so a booking made with it ` +
      `would be confirmed without a working link. Available: ` +
      `${availableLocationTypes().join(', ')}.`,
  });
}

/**
 * Whether a booking must be refused rather than stored.
 *
 * True only when a video event type produced no link AND the host set no
 * fallback location: that booking would be confirmed with meetingUrl null and
 * location null, a confirmation for a meeting that is nowhere. With a
 * locationValue the meeting still has somewhere to be, so it is saved — it
 * simply has no video link, which is true rather than invented.
 */
export function bookingWouldBeEmpty(
  locationType: string,
  meetingUrl: string | null,
  locationValue: string | null | undefined,
): boolean {
  return !meetingUrl && !locationValue && isVideoLocationType(locationType);
}

export interface Capabilities {
  /** Location types offerable when creating a booking event type. */
  meetingLocationTypes: string[];
  /** Video providers specifically — a subset of the above. */
  videoProviders: string[];
  /** Inbox preview (Litmus) can produce a real render. */
  inboxPreview: boolean;
  /** Campaign geo breakdown can produce rows. */
  geoAnalytics: boolean;
  /** Multivariate tests can run end to end. Currently never. */
  multivariateTests: boolean;
}

export function capabilities(): Capabilities {
  return {
    meetingLocationTypes: availableLocationTypes(),
    videoProviders: availableVideoProviders(),
    inboxPreview: inboxPreviewAvailable(),
    geoAnalytics: geoAnalyticsAvailable(),
    multivariateTests: multivariateTestsAvailable(),
  };
}
