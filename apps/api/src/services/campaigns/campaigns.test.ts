/**
 * Campaign service tests — state machine transitions and validation.
 */

import { describe, it, expect } from 'vitest';
import { validateTransition } from './index.js';

describe('Campaign State Machine', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  it('allows draft → scheduled', () => {
    expect(() => validateTransition('draft', 'scheduled')).not.toThrow();
  });

  // Pressing Send now lands in `queueing`, not `sending`: the splitter has not
  // run, so there is no audience, no batches and no mail. `sending` is what the
  // splitter writes once every batch is on the queue.
  it('allows draft → queueing', () => {
    expect(() => validateTransition('draft', 'queueing')).not.toThrow();
  });

  it('rejects draft → sending — a send does not start already sending', () => {
    expect(() => validateTransition('draft', 'sending')).toThrow();
  });

  it('allows scheduled → queueing', () => {
    expect(() => validateTransition('scheduled', 'queueing')).not.toThrow();
  });

  it('allows queueing → sending, which is the splitter finishing', () => {
    expect(() => validateTransition('queueing', 'sending')).not.toThrow();
  });

  it('allows sending → failed, the other end of the same finish line', () => {
    expect(() => validateTransition('sending', 'failed')).not.toThrow();
  });

  it('treats failed as terminal', () => {
    expect(() => validateTransition('failed', 'sending')).toThrow();
  });

  it('allows scheduled → cancelled', () => {
    expect(() => validateTransition('scheduled', 'cancelled')).not.toThrow();
  });

  it('allows sending → sent', () => {
    expect(() => validateTransition('sending', 'sent')).not.toThrow();
  });

  it('allows sending → paused', () => {
    expect(() => validateTransition('sending', 'paused')).not.toThrow();
  });

  it('allows paused → sending (resume)', () => {
    expect(() => validateTransition('paused', 'sending')).not.toThrow();
  });

  it('allows paused → cancelled', () => {
    expect(() => validateTransition('paused', 'cancelled')).not.toThrow();
  });

  // ─── Invalid transitions ───────────────────────────────────────────────────

  it('rejects draft → sent', () => {
    expect(() => validateTransition('draft', 'sent')).toThrow(/Invalid campaign status transition/);
  });

  it('rejects draft → paused', () => {
    expect(() => validateTransition('draft', 'paused')).toThrow(
      /Invalid campaign status transition/,
    );
  });

  it('rejects sent → draft', () => {
    expect(() => validateTransition('sent', 'draft')).toThrow(/Invalid campaign status transition/);
  });

  it('rejects sent → sending (terminal state)', () => {
    expect(() => validateTransition('sent', 'sending')).toThrow(/terminal state/);
  });

  it('rejects cancelled → draft (terminal state)', () => {
    expect(() => validateTransition('cancelled', 'draft')).toThrow(/terminal state/);
  });

  it('rejects cancelled → sending (terminal state)', () => {
    expect(() => validateTransition('cancelled', 'sending')).toThrow(/terminal state/);
  });

  it('rejects sending → scheduled', () => {
    expect(() => validateTransition('sending', 'scheduled')).toThrow(
      /Invalid campaign status transition/,
    );
  });

  it('rejects sending → draft', () => {
    expect(() => validateTransition('sending', 'draft')).toThrow(
      /Invalid campaign status transition/,
    );
  });

  it('rejects scheduled → draft', () => {
    expect(() => validateTransition('scheduled', 'draft')).toThrow(
      /Invalid campaign status transition/,
    );
  });

  it('rejects paused → draft', () => {
    expect(() => validateTransition('paused', 'draft')).toThrow(
      /Invalid campaign status transition/,
    );
  });

  it('rejects paused → scheduled', () => {
    expect(() => validateTransition('paused', 'scheduled')).toThrow(
      /Invalid campaign status transition/,
    );
  });
});
