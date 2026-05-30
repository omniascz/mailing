import { describe, it, expect } from 'vitest';
import {
  routeSignal,
  initialStatus,
  buildIncidentTitle,
  buildIncidentBody,
  buildResolveBody,
  formatDuration,
  dedupKey,
  pickIncidentToUpdate,
  sanitiseMetrics,
  type SignalKind,
} from './pure.js';

describe('routeSignal', () => {
  it('routes DB outage to database component with CRITICAL impact', () => {
    expect(routeSignal('db_down')).toEqual({ component: 'database', impact: 'CRITICAL' });
  });

  it('routes queue backlog to job-queue with MINOROUTAGE', () => {
    expect(routeSignal('queue_backlog').impact).toBe('MINOROUTAGE');
  });

  it('every SignalKind is exhaustively routed (no undefined)', () => {
    const all: SignalKind[] = [
      'db_down',
      'redis_down',
      'queue_backlog',
      'high_bounce_rate',
      'high_complaint_rate',
      'engine_unreachable',
      'webhook_failures',
      'auth_outage',
      'tracking_pixel_down',
      'sms_provider_outage',
    ];
    for (const k of all) {
      const r = routeSignal(k);
      expect(r.component, k).toBeTruthy();
      expect(r.impact, k).toBeTruthy();
    }
  });
});

describe('initialStatus', () => {
  it('opens CRITICAL incidents as IDENTIFIED', () => {
    expect(initialStatus('CRITICAL')).toBe('IDENTIFIED');
  });
  it('opens everything else as INVESTIGATING', () => {
    expect(initialStatus('MAJOROUTAGE')).toBe('INVESTIGATING');
    expect(initialStatus('MINOROUTAGE')).toBe('INVESTIGATING');
    expect(initialStatus('OPERATIONAL')).toBe('INVESTIGATING');
  });
});

describe('buildIncidentTitle', () => {
  it('prefixes by impact level', () => {
    const title = buildIncidentTitle('db_down');
    expect(title.startsWith('Critical:')).toBe(true);
    expect(title).toContain('Primary database unreachable');
  });

  it('includes region suffix in parens', () => {
    const title = buildIncidentTitle('high_bounce_rate', { region: 'EU-Frankfurt' });
    expect(title).toContain('(EU-Frankfurt)');
  });

  it('appends a summary after an em dash', () => {
    const title = buildIncidentTitle('queue_backlog', { summary: 'mta-default 25K pending' });
    expect(title).toMatch(/—\s+mta-default 25K pending$/);
  });

  it('caps title length at 140 chars', () => {
    const title = buildIncidentTitle('webhook_failures', { summary: 'x'.repeat(500) });
    expect(title.length).toBeLessThanOrEqual(140);
  });
});

describe('buildIncidentBody', () => {
  it('includes detection timestamp', () => {
    const body = buildIncidentBody('redis_down');
    expect(body).toMatch(/Detected at:.+T.+Z/);
  });

  it('renders metrics block when provided', () => {
    const body = buildIncidentBody('high_bounce_rate', {
      metrics: { bounceRatePct: 7.4, sample: 10_000 },
    });
    expect(body).toContain('Metrics at detection');
    expect(body).toContain('bounceRatePct: 7.4');
    expect(body).toContain('sample: 10000');
  });

  it('omits region line when not provided', () => {
    const body = buildIncidentBody('webhook_failures');
    expect(body).not.toMatch(/Region:/);
  });

  it('includes region line when provided', () => {
    const body = buildIncidentBody('webhook_failures', { region: 'EU-1' });
    expect(body).toContain('**Region:** EU-1');
  });
});

describe('formatDuration', () => {
  it('seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45 seconds');
  });
  it('minutes under an hour', () => {
    expect(formatDuration(600)).toBe('10 minutes');
  });
  it('hours under a day', () => {
    expect(formatDuration(7200)).toBe('2.0 hours');
  });
  it('days', () => {
    expect(formatDuration(86_400 * 2.5)).toBe('2.5 days');
  });
});

describe('buildResolveBody', () => {
  it('mentions resolution duration', () => {
    const body = buildResolveBody(900);
    expect(body).toContain('15 minutes');
  });
  it('appends post-mortem link when provided', () => {
    const body = buildResolveBody(600, 'https://mailforge.io/incidents/2026-05-30');
    expect(body).toContain('Post-mortem');
    expect(body).toContain('mailforge.io/incidents/2026-05-30');
  });
});

describe('dedupKey', () => {
  it('returns kind alone without region', () => {
    expect(dedupKey('db_down')).toBe('db_down');
  });
  it('appends region with colon', () => {
    expect(dedupKey('db_down', { region: 'EU-1' })).toBe('db_down:EU-1');
  });
});

describe('pickIncidentToUpdate', () => {
  it('returns null when no open incidents match', () => {
    expect(pickIncidentToUpdate('db_down', {}, [])).toBeNull();
  });

  it('finds an existing incident with matching dedup key', () => {
    const match = pickIncidentToUpdate(
      'queue_backlog',
      { region: 'EU-1' },
      [
        { id: 'inc-1', dedupKey: 'redis_down', status: 'INVESTIGATING' },
        { id: 'inc-2', dedupKey: 'queue_backlog:EU-1', status: 'INVESTIGATING' },
      ],
    );
    expect(match).toBe('inc-2');
  });

  it('skips resolved incidents even with matching key', () => {
    const match = pickIncidentToUpdate(
      'db_down',
      {},
      [{ id: 'inc-1', dedupKey: 'db_down', status: 'RESOLVED' }],
    );
    expect(match).toBeNull();
  });
});

describe('sanitiseMetrics', () => {
  it('returns empty object for undefined input', () => {
    expect(sanitiseMetrics(undefined)).toEqual({});
  });

  it('rounds numeric values to 2 decimals', () => {
    expect(sanitiseMetrics({ rate: 0.12345 })).toEqual({ rate: 0.12 });
  });

  it('drops common PII keys', () => {
    const out = sanitiseMetrics({
      email: 'leak@example.com',
      password: 'p',
      ip: '1.2.3.4',
      queue: 'mta',
    });
    expect(out).toEqual({ queue: 'mta' });
  });

  it('trims strings over 80 chars', () => {
    const out = sanitiseMetrics({ note: 'x'.repeat(200) });
    expect((out.note as string).length).toBe(80);
  });

  it('coerces infinite numbers to 0', () => {
    expect(sanitiseMetrics({ rate: Infinity })).toEqual({ rate: 0 });
  });
});
