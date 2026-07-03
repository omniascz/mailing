import { describe, it, expect } from 'vitest';
import { mergeMailSettings, DEFAULT_MAIL_SETTINGS } from './mail-settings.js';

describe('mergeMailSettings', () => {
  it('returns defaults for empty/undefined input', () => {
    expect(mergeMailSettings(undefined)).toEqual(DEFAULT_MAIL_SETTINGS);
    expect(mergeMailSettings({})).toEqual(DEFAULT_MAIL_SETTINGS);
  });

  it('overlays a partial footer without dropping other footer fields', () => {
    const out = mergeMailSettings({ footer: { enabled: true, html: '<p>bye</p>' } });
    expect(out.footer).toEqual({ enabled: true, html: '<p>bye</p>', text: '' });
    expect(out.clickTracking).toBe(true);
  });

  it('overlays top-level toggles', () => {
    const out = mergeMailSettings({ openTracking: false, subscriptionTracking: false });
    expect(out.openTracking).toBe(false);
    expect(out.subscriptionTracking).toBe(false);
    expect(out.clickTracking).toBe(true);
  });
});
