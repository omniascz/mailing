/**
 * What the "Create campaign" button sends, and where it lands.
 *
 * Tested as pure functions rather than by rendering the button: apps/web runs
 * vitest with `environment: 'node'` and no DOM, and the decision worth pinning
 * is not that a button paints — it is that an untouched name field does not
 * become a 400, and that the user ends up in the editor rather than on a list
 * hunting for what they just made. Both of those are in the payload and the
 * href, which is why they are functions and not literals inside a handler.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCreateFromTemplatePayload,
  createFromTemplatePayloadKeys,
  createdCampaignHref,
} from './create-campaign-payload';

describe('buildCreateFromTemplatePayload', () => {
  it('omits the name entirely when the field is untouched', () => {
    // The route's schema is `.min(1)`, so '' is a validation error rather than
    // a way of saying "you choose". Sending one would turn the ordinary case —
    // click the button, keep the template's name — into a 400.
    expect(buildCreateFromTemplatePayload({ name: '' })).toEqual({});
  });

  it('omits it for whitespace too, which is the same thing typed differently', () => {
    expect(buildCreateFromTemplatePayload({ name: '   ' })).toEqual({});
  });

  it('sends a real name, trimmed', () => {
    expect(buildCreateFromTemplatePayload({ name: '  Spring sale  ' })).toEqual({
      name: 'Spring sale',
    });
  });

  it('can produce exactly one key, and the guard can see it', () => {
    expect(createFromTemplatePayloadKeys()).toEqual(['name']);
  });
});

describe('createdCampaignHref', () => {
  it('goes to the editor for that campaign', () => {
    expect(createdCampaignHref('abc-123')).toBe('/editor/campaigns/abc-123');
  });

  it('is the id it was given, not a list', () => {
    // Landing on /campaigns would make someone find the campaign they created
    // one second ago.
    const href = createdCampaignHref('11111111-2222-3333-4444-555555555555');
    expect(href).toContain('11111111-2222-3333-4444-555555555555');
    expect(href.endsWith('/campaigns')).toBe(false);
  });
});
