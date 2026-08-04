import { describe, it, expect } from 'vitest';
import { resolveEffectiveSendOptions } from './index.js';
import { DEFAULT_CONFIG_SET_OPTIONS } from '../../db/schema/configuration-sets.js';

describe('resolveEffectiveSendOptions', () => {
  it('returns account defaults + allowed when no set', () => {
    const eff = resolveEffectiveSendOptions(null);
    expect(eff.allowed).toBe(true);
    expect(eff.trackingEnabled).toBe(true);
    expect(eff.tlsPolicy).toBe('optional');
    expect(eff.webhookDestinations).toEqual([]);
  });

  it('blocks when the set sending is paused', () => {
    const eff = resolveEffectiveSendOptions({
      sendingEnabled: false,
      options: DEFAULT_CONFIG_SET_OPTIONS,
    });
    expect(eff.allowed).toBe(false);
    expect(eff.blockReason).toMatch(/paused/);
  });

  it('surfaces enabled webhook destinations only', () => {
    const eff = resolveEffectiveSendOptions({
      sendingEnabled: true,
      options: {
        ...DEFAULT_CONFIG_SET_OPTIONS,
        tlsPolicy: 'require',
        trackingEnabled: false,
        eventDestinations: [
          {
            name: 'a',
            type: 'webhook',
            enabled: true,
            matchingEventTypes: ['bounce'],
            url: 'https://x/hook',
          },
          {
            name: 'b',
            type: 'webhook',
            enabled: false,
            matchingEventTypes: ['open'],
            url: 'https://y',
          },
          { name: 'c', type: 'sns', enabled: true, matchingEventTypes: ['delivery'] },
          { name: 'd', type: 'webhook', enabled: true, matchingEventTypes: ['click'] }, // no url
        ],
      },
    });
    expect(eff.allowed).toBe(true);
    expect(eff.tlsPolicy).toBe('require');
    expect(eff.trackingEnabled).toBe(false);
    expect(eff.webhookDestinations.map((d) => d.name)).toEqual(['a']);
  });
});
