/**
 * Scheduling a campaign from the UI: the control is there, and what it sends
 * is an instant in the future.
 *
 * WHAT THIS TEST CANNOT SEE
 * -------------------------
 * - `environment: 'node'` has no DOM. The component is rendered for its initial
 *   markup only, so nothing here clicks "Schedule for later" and nothing proves
 *   the date input's onChange reaches buildSchedulePayload. What is proven is
 *   which buttons each status offers, and what the builder makes of a value.
 * - It does not talk to the API, and it does not run the cron. That a scheduled
 *   campaign is actually picked up and sent is
 *   apps/api/src/integration/campaign-scheduling.integration.test.ts.
 * - The timezone assertions below run in THIS machine's zone. They are written
 *   to hold in any zone (round trip, ordering) rather than to pin a UTC offset,
 *   which would pass here and fail on a CI runner set to UTC.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: () => {} }) }));

const { CampaignActions } = await import('./campaign-actions');
const { buildSchedulePayload, schedulePayloadKeys, toLocalInputValue } =
  await import('./schedule-payload');

type Status = 'draft' | 'scheduled' | 'queueing' | 'sending' | 'sent' | 'failed' | 'paused';

const markup = (status: Status) =>
  renderToStaticMarkup(<CampaignActions campaign={{ id: 'c1', status }} />);

const ok = (r: ReturnType<typeof buildSchedulePayload>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.payload;
};
const err = (r: ReturnType<typeof buildSchedulePayload>) => {
  if (r.ok) throw new Error('expected a refusal, got a payload');
  return r.error;
};

const NOW = new Date('2026-09-02T08:00:00.000Z');

describe('matcher self-test', () => {
  it('the component really renders and the statuses differ', () => {
    expect(markup('draft')).toContain('<button');
    // If every status rendered the same markup, every assertion below would
    // pass without meaning anything.
    expect(markup('draft')).not.toEqual(markup('scheduled'));
    expect(markup('sent')).not.toEqual(markup('draft'));
  });

  it('the builder really distinguishes its two outcomes', () => {
    expect(buildSchedulePayload('2999-01-01T09:00', NOW).ok).toBe(true);
    expect(buildSchedulePayload('', NOW).ok).toBe(false);
    expect(() => ok(buildSchedulePayload('', NOW))).toThrow();
    expect(() => err(buildSchedulePayload('2999-01-01T09:00', NOW))).toThrow();
  });
});

describe('the controls each status offers', () => {
  it('a draft can be sent now or scheduled for later', () => {
    const html = markup('draft');
    expect(html).toContain('Send now');
    expect(html).toContain('Schedule for later');
    // Closed to start with: the date field only appears once asked for.
    expect(html).not.toContain('datetime-local');
  });

  it('a scheduled campaign can be taken off the schedule, and still cancelled', () => {
    const html = markup('scheduled');
    expect(html).toContain('Unschedule');
    // Cancel stays. Unschedule is "not now"; cancel is "never" — and cancel is
    // terminal, which is exactly why it cannot serve as both.
    expect(html).toContain('Cancel');
    expect(html).not.toContain('Schedule for later');
  });

  it('offers no scheduling once the campaign has left draft or schedule', () => {
    for (const status of ['queueing', 'sending', 'sent', 'paused'] as Status[]) {
      const html = markup(status);
      expect(html, status).not.toContain('Schedule for later');
      expect(html, status).not.toContain('Unschedule');
    }
  });
});

describe('what the schedule control sends', () => {
  it('sends the picked time as an absolute instant', () => {
    const payload = ok(buildSchedulePayload('2026-09-03T09:00', NOW));
    expect(Object.keys(payload)).toEqual(['scheduledAt']);
    // An ISO instant, which is what the route's z.string().datetime() takes.
    expect(payload.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // The wall-clock text is read in the browser's zone, so it round-trips
    // back to the same local wall clock whatever zone that is.
    expect(toLocalInputValue(new Date(payload.scheduledAt))).toBe('2026-09-03T09:00');
  });

  it('refuses a time that has already passed instead of sending immediately', () => {
    // A mistyped past date turned into an immediate send to the whole audience
    // is the one mistake here that cannot be taken back.
    expect(err(buildSchedulePayload('2026-09-02T07:59', NOW))).toContain('already passed');
    expect(err(buildSchedulePayload('2020-01-01T09:00', NOW))).toContain('already passed');
  });

  it('treats the exact current instant as past, the same way the server does', () => {
    // scheduleCampaign refuses `scheduledAt <= new Date()`.
    const sameInstant = toLocalInputValue(NOW);
    expect(err(buildSchedulePayload(sameInstant, NOW))).toContain('already passed');
  });

  it('refuses an empty or unparseable value', () => {
    expect(err(buildSchedulePayload('', NOW))).toContain('Pick a date');
    expect(err(buildSchedulePayload('   ', NOW))).toContain('Pick a date');
    expect(err(buildSchedulePayload('not a date', NOW))).toContain('not a date this browser');
  });

  it('does not send campaigns.timezone, which nothing reads', () => {
    // Writing it would put a value in a dead column and make it look alive.
    expect(schedulePayloadKeys()).toEqual(['scheduledAt']);
    expect(schedulePayloadKeys()).not.toContain('timezone');
  });
});
