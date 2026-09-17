import { describe, it, expect } from 'vitest';
import { DEFAULT_WAIT, readWait, waitPatch } from './wait-config';
import { buildStarterGraph } from './new/starter-graph';

/**
 * The wait shape the web app writes. That the executor times it correctly is
 * proved against a real database in apps/api
 * integration/workflow-wait-from-ui.integration.test.ts, which loads these
 * same modules; this file covers the conversions the editor relies on.
 */

describe('the starter graph', () => {
  it('seeds a one-day wait in the executor shape', () => {
    const wait = buildStarterGraph('manual').nodes.find((n) => n.type === 'wait');
    expect(wait?.config).toEqual({ duration: 1, unit: 'days' });
    expect(DEFAULT_WAIT).toEqual({ duration: 1, unit: 'days' });
  });
});

describe('readWait', () => {
  it('reads the executor shape as it is', () => {
    expect(readWait({ duration: 3, unit: 'hours' })).toEqual({ duration: 3, unit: 'hours' });
  });

  it('applies the executor defaults: 1, hours', () => {
    expect(readWait({})).toEqual({ duration: 1, unit: 'hours' });
  });

  it('reads the old { days, hours } object as the time it meant', () => {
    expect(readWait({ duration: { days: 1, hours: 0 } })).toEqual({ duration: 1, unit: 'days' });
    expect(readWait({ duration: { days: 1, hours: 6 } })).toEqual({ duration: 30, unit: 'hours' });
  });

  it('leaves an until wait alone', () => {
    expect(readWait({ until: { field: 'event.starts_at', offsetHours: -24 } })).toBeNull();
    expect(readWait({ until: '2030-01-01T00:00:00Z' })).toBeNull();
  });
});

describe('waitPatch', () => {
  it('writes a number and a unit', () => {
    expect(waitPatch(2, 'hours')).toEqual({ duration: 2, unit: 'hours' });
  });

  it('replaces the old object when merged the way the editor merges', () => {
    const config = { duration: { days: 1, hours: 0 } };
    expect({ ...config, ...waitPatch(4, 'days') }).toEqual({ duration: 4, unit: 'days' });
  });

  it('never writes a value the API refuses', () => {
    // An emptied number input is Number('') = 0; a pasted "abc" is NaN.
    expect(waitPatch(Number(''), 'hours')).toEqual({ duration: 0, unit: 'hours' });
    expect(waitPatch(Number('abc'), 'hours')).toEqual({ duration: 0, unit: 'hours' });
    expect(waitPatch(-5, 'minutes')).toEqual({ duration: 0, unit: 'minutes' });
  });
});
