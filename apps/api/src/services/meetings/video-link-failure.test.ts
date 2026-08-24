/**
 * A video-link failure must leave a trace.
 *
 * `createBooking` falls back to the event type's static location when the
 * video provider cannot be reached, and that fallback stays — a booking whose
 * Zoom integration is misconfigured is still a booking, and changing that is a
 * separate decision. What changed is that the reason survives: the call used
 * to end in `.catch(() => et.locationValue ?? null)`, which discarded the
 * error, so a broken integration produced confirmed bookings with no link and
 * nothing anywhere explaining why.
 *
 * This test pins the log, not the booking state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createVideoLink = vi.fn();
vi.mock('./video-links.js', () => ({ createVideoLink }));
vi.mock('./workflows.js', () => ({ triggerMeetingEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./round-robin.js', () => ({ pickNextHost: vi.fn().mockResolvedValue('user-1') }));

const eventType = {
  id: 'et-1',
  orgId: 'org-1',
  name: 'Intro call',
  isActive: true,
  durationMinutes: 30,
  schedulingType: 'single',
  ownerUserId: 'user-1',
  teamMemberIds: [] as string[],
  locationType: 'zoom',
  locationValue: 'https://example.test/fallback',
  description: null,
  timezone: 'Europe/Prague',
};

const booking = { id: 'b-1', orgId: 'org-1' };

const mockDb: Record<string, unknown> = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([eventType]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([booking]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};
vi.mock('../../db/client.js', () => ({ db: mockDb }));
vi.mock('../../db/schema/booking-pages.js', () => ({
  eventTypes: { id: 'id', orgId: 'org_id' },
  bookingAvailability: {},
}));
vi.mock('../../db/schema/calendar.js', () => ({ bookings: {}, calendarEvents: {} }));
class FakeAppError extends Error {
  code: string;
  constructor(init: { code: string; message: string }) {
    super(init.message);
    this.code = init.code;
  }
}
vi.mock('../../lib/app-error.js', () => ({
  AppError: Object.assign(FakeAppError, {
    notFound: (r = 'Resource') => new Error(`${r} not found`),
  }),
}));

describe('createBooking when the video provider fails', () => {
  beforeEach(() => {
    createVideoLink.mockReset();
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([eventType]);
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValue([booking]);
  });

  it('logs the reason instead of swallowing it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createVideoLink.mockRejectedValue(new Error('Zoom credentials not configured'));

    const { createBooking } = await import('./index.js');
    await createBooking('org-1', {
      eventTypeId: 'et-1',
      startAt: new Date('2026-09-01T10:00:00Z'),
      inviteeEmail: 'guest@example.test',
    } as never);

    expect(spy, 'the failure left no trace').toHaveBeenCalled();
    const logged = spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toContain('[meetings]');
    expect(logged).toContain('zoom');
    expect(logged).toContain('Zoom credentials not configured');
    spy.mockRestore();
  });

  it('still books, using the event type location as before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createVideoLink.mockRejectedValue(new Error('boom'));

    const { createBooking } = await import('./index.js');
    await createBooking('org-1', {
      eventTypeId: 'et-1',
      startAt: new Date('2026-09-01T10:00:00Z'),
      inviteeEmail: 'guest@example.test',
    } as never);

    const values = (mockDb.values as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(values.location).toBe('https://example.test/fallback');
    expect(values.status).toBe('confirmed');
  });
});

describe('a booking with nowhere to be is refused, not confirmed', () => {
  beforeEach(() => {
    createVideoLink.mockReset();
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([eventType]);
    (mockDb.returning as ReturnType<typeof vi.fn>).mockResolvedValue([booking]);
    (mockDb.values as ReturnType<typeof vi.fn>).mockClear();
  });

  it('refuses when an unconfigured provider leaves no link and there is no fallback', async () => {
    // The shape that shipped: Zoom answers nothing because ZOOM_* is unset,
    // the event type has no static location, and the booking is stored
    // confirmed with meetingUrl null and location null — a confirmation for a
    // meeting that is nowhere. The slot is blocked and the invitee finds out
    // at the start of the call.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...eventType, locationValue: null },
    ]);
    createVideoLink.mockRejectedValue(new Error('Zoom is not configured'));

    const { createBooking } = await import('./index.js');
    await expect(
      createBooking('org-1', {
        eventTypeId: 'et-1',
        startAt: new Date('2026-09-01T10:00:00Z'),
        inviteeEmail: 'guest@example.test',
      } as never),
    ).rejects.toThrow(/not available right now/);

    expect(
      (mockDb.values as ReturnType<typeof vi.fn>).mock.calls,
      'a row was written for a booking that was refused',
    ).toHaveLength(0);
  });

  it('a physical event type is unaffected — it never needed a link', async () => {
    (mockDb.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...eventType, locationType: 'physical', locationValue: 'Kavárna Slavia, Praha' },
    ]);
    createVideoLink.mockResolvedValue(null);

    const { createBooking } = await import('./index.js');
    await createBooking('org-1', {
      eventTypeId: 'et-1',
      startAt: new Date('2026-09-01T10:00:00Z'),
      inviteeEmail: 'guest@example.test',
    } as never);

    const values = (mockDb.values as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(values.location).toBe('Kavárna Slavia, Praha');
    expect(values.status).toBe('confirmed');
  });
});
