/**
 * {{meeting_url}} resolves, or the button does not appear.
 *
 * The meeting triggers pass the booking's fields in camelCase — meetingUrl —
 * because that is the convention for a TypeScript payload object. Every merge
 * tag in this repo is snake_case: first_name, event_title, cart_url,
 * unsubscribe_url. So `{{meeting_url}}` in the seeded follow-up template
 * resolved to nothing.
 *
 * It did not render as nothing, either. The template wrote
 * `{{meeting_url|default:#}}`, so the button came out as `href="#"` — a link
 * that looks alive and goes nowhere, which in an email cannot be corrected
 * after sending. `#` is now treated as an unresolved destination alongside an
 * empty href and a literal tag; `#section` is left alone, since that is an
 * anchor and not a failure.
 *
 * The mapping lives in buildRunMergeData because that is where the two
 * conventions already meet — `eventTitle → event_title` has been done there
 * since the ticketing cron.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRunMergeData,
  substituteMergeTags,
  dropUnresolvedLinks,
} from '../workflows/actions.js';

const CONTACT = {
  id: 'c1',
  firstName: 'Jan',
  lastName: 'Novák',
  email: 'jan@example.test',
  phone: null,
  customFields: {},
  tags: [],
  listIds: [],
};

/** Exactly what triggerMeetingEvent puts on the run. */
const bookedRun = (meetingUrl: string | undefined) => ({
  data: {
    bookingId: 'b1',
    hostUserId: 'u1',
    startAt: '2026-09-01T10:00:00.000Z',
    endAt: '2026-09-01T10:30:00.000Z',
    title: 'Intro call',
    meetingUrl,
    timezone: 'Europe/Prague',
    status: 'confirmed',
  },
});

const BUTTON = '<p><a href="{{meeting_url}}">Join the call →</a></p>';
const BUTTON_WITH_DEFAULT = '<p><a href="{{meeting_url|default:#}}">Join the call →</a></p>';

describe('the meeting link reaches the template', () => {
  it('maps meetingUrl onto {{meeting_url}}', () => {
    const extra = buildRunMergeData(bookedRun('https://meet.example.test/room/abc'));
    expect(extra.meeting_url).toBe('https://meet.example.test/room/abc');
  });

  it('carries the rest of the booking too', () => {
    const extra = buildRunMergeData(bookedRun('https://meet.example.test/x'));
    expect(extra.booking_id).toBe('b1');
    expect(extra.meeting_starts_at).toBe('2026-09-01T10:00:00.000Z');
    expect(extra.meeting_timezone).toBe('Europe/Prague');
  });

  it('renders a real href when the booking has a link', () => {
    const extra = buildRunMergeData(bookedRun('https://meet.example.test/room/abc'));
    const html = dropUnresolvedLinks(substituteMergeTags(BUTTON, CONTACT, extra));
    expect(html).toContain('href="https://meet.example.test/room/abc"');
    expect(html).toContain('Join the call →');
  });
});

describe('a booking with no link renders no button', () => {
  it('drops the anchor when meetingUrl is absent', () => {
    const extra = buildRunMergeData(bookedRun(undefined));
    expect(extra.meeting_url).toBeUndefined();

    const html = dropUnresolvedLinks(substituteMergeTags(BUTTON, CONTACT, extra));
    expect(html).not.toContain('<a');
    // The sentence survives; only the promise goes.
    expect(html).toContain('Join the call →');
  });

  it('drops it through the |default:# form the seeded templates use', () => {
    const extra = buildRunMergeData(bookedRun(undefined));
    const html = dropUnresolvedLinks(substituteMergeTags(BUTTON_WITH_DEFAULT, CONTACT, extra));
    expect(html).not.toContain('href="#"');
    expect(html).not.toContain('<a');
  });

  it('leaves a real in-document anchor alone', () => {
    // `#` is not a destination in an email; `#section` is a different thing and
    // must not be swept up with it.
    const html = dropUnresolvedLinks('<a href="#terms">Terms</a>');
    expect(html).toBe('<a href="#terms">Terms</a>');
  });
});
