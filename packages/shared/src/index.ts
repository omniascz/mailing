// @forgemsg/shared — Shared types, utils, and channel adapter interfaces

export * from './types/index.js';
export * from './types/channels.js';
export * from './channels/index.js';
export {
  t,
  resolveLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './i18n/index.js';
export {
  createTrackingToken,
  verifyTrackingToken,
  isAppleMpp,
  injectOpenPixel,
  wrapLinks,
  type OpenTrackingPayload,
  type ClickTrackingPayload,
  type PreferenceCenterPayload,
  type TrackingPayload,
} from './tracking/index.js';
