/**
 * Email open and click tracking — pure utility re-export.
 *
 * Implementation lives in @forgemsg/shared so apps/workers can produce
 * compatible tokens at send time without importing apps/api source.
 * Both sides share the TRACKING_SECRET env var → HMAC-SHA256 produces
 * identical signatures.
 *
 * This shim keeps existing API imports valid; nothing in this directory
 * needs to know the move happened.
 */

export {
  createTrackingToken,
  verifyTrackingToken,
  isAppleMpp,
  injectOpenPixel,
  wrapLinks,
  type OpenTrackingPayload,
  type ClickTrackingPayload,
  type TrackingPayload,
} from '@forgemsg/shared';
