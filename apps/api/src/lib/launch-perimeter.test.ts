/**
 * The hook that refuses a direct API send outside the launch perimeter (Z168).
 *
 * The HTTP side — every registered direct-send route answers 403 with nothing
 * queued, written or sent, before authentication and validation — is measured
 * in integration/channel-not-in-launch.integration.test.ts against the real
 * app. This file pins the hook itself: what it answers, and that it reads and
 * writes nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';
import {
  CHANNEL_NOT_IN_LAUNCH,
  MESSAGING_CHANNELS_NOT_IN_LAUNCH,
  channelNotInLaunch,
  channelNotInLaunchError,
} from './launch-perimeter.js';

/** A request whose every property read throws: the hook may not look at it. */
const untouchable = new Proxy(
  {},
  {
    get(_t, key) {
      throw new Error(`the hook read request.${String(key)}`);
    },
  },
) as FastifyRequest;

describe('channelNotInLaunch', () => {
  it('refuses with 403 CHANNEL_NOT_IN_LAUNCH, in the shape every API error has', async () => {
    const err = await channelNotInLaunch(untouchable).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).toJSON()).toEqual({
      code: 'CHANNEL_NOT_IN_LAUNCH',
      message: 'Sending this channel through the API is not available at launch.',
      statusCode: 403,
    });
  });

  it('names the channel when there is one (/messaging/send)', () => {
    expect(channelNotInLaunchError('sms').toJSON()).toEqual({
      code: CHANNEL_NOT_IN_LAUNCH,
      message: "Sending 'sms' through the API is not available at launch.",
      statusCode: 403,
    });
  });

  it('/messaging/send refuses sms, whatsapp and push — not email, not in_app', () => {
    expect([...MESSAGING_CHANNELS_NOT_IN_LAUNCH].sort()).toEqual(['push', 'sms', 'whatsapp']);
    expect(MESSAGING_CHANNELS_NOT_IN_LAUNCH.has('email')).toBe(false);
    expect(MESSAGING_CHANNELS_NOT_IN_LAUNCH.has('in_app')).toBe(false);
  });

  it('has no switch and no way to the database, a queue or a provider', () => {
    const source = readFileSync(new URL('./launch-perimeter.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['fastify', './app-error.js']);
    // No environment variable, flag or exemption can turn a channel back on.
    expect(source).not.toMatch(/process\.env|\benv\b|request\.(user|headers)/);
  });
});
