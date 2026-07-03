import { describe, it, expect, beforeEach } from 'vitest';
import { parseSinkAddress, sinkEventChain } from './sink-addresses.js';

describe('parseSinkAddress', () => {
  beforeEach(() => {
    delete process.env.SINK_DOMAIN; // default sink.forgemsg.test
  });

  it('recognises each outcome on the default sink domain', () => {
    expect(parseSinkAddress('delivered@sink.forgemsg.test')).toBe('delivered');
    expect(parseSinkAddress('bounced@sink.forgemsg.test')).toBe('bounced');
    expect(parseSinkAddress('complained@sink.forgemsg.test')).toBe('complained');
    expect(parseSinkAddress('opened@sink.forgemsg.test')).toBe('opened');
    expect(parseSinkAddress('clicked@sink.forgemsg.test')).toBe('clicked');
  });

  it('recognises resend.dev sinks (migration aid)', () => {
    expect(parseSinkAddress('bounced@resend.dev')).toBe('bounced');
  });

  it('allows a +tag suffix', () => {
    expect(parseSinkAddress('delivered+run7@sink.forgemsg.test')).toBe('delivered');
  });

  it('honours a configured SINK_DOMAIN (and stops matching the default)', () => {
    process.env.SINK_DOMAIN = 'sink.acme.io';
    expect(parseSinkAddress('delivered@sink.acme.io')).toBe('delivered');
    expect(parseSinkAddress('delivered@sink.forgemsg.test')).toBeNull();
    expect(parseSinkAddress('bounced@resend.dev')).toBe('bounced'); // resend.dev always on
  });

  it('returns null for real addresses + unknown outcomes', () => {
    expect(parseSinkAddress('jan@gmail.com')).toBeNull();
    expect(parseSinkAddress('whatever@sink.forgemsg.test')).toBeNull();
    expect(parseSinkAddress('bounced@gmail.com')).toBeNull();
    expect(parseSinkAddress('nope')).toBeNull();
  });
});

describe('sinkEventChain', () => {
  it('expands outcomes into ordered lifecycle events', () => {
    expect(sinkEventChain('delivered')).toEqual(['delivered']);
    expect(sinkEventChain('bounced')).toEqual(['bounced']);
    expect(sinkEventChain('complained')).toEqual(['delivered', 'complained']);
    expect(sinkEventChain('opened')).toEqual(['delivered', 'opened']);
    expect(sinkEventChain('clicked')).toEqual(['delivered', 'clicked']);
  });
});
