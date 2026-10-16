import type { FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';

/**
 * Channels outside the launch perimeter.
 *
 * Michal, 14. 10. 22:10, bod 5 (Z168): mimo perimetr spuštění, obchází brány
 * souhlasu. A direct API send of an SMS, a WhatsApp message, a web or mobile
 * push, a Viber or an RCS message goes to a number or a device the caller
 * names, with none of the consent and contact-state gates an SMS, WhatsApp or
 * push from a flow or a campaign passes (Z155–Z167). So those routes refuse,
 * and flows and campaigns keep sending through their gates.
 *
 * The routes stay registered: a client gets a code it can read, not a 404.
 * There is no switch, flag, role or org exemption — turning a channel back on
 * is a code change after Michal decides it.
 */
export const CHANNEL_NOT_IN_LAUNCH = 'CHANNEL_NOT_IN_LAUNCH';

/** The /messaging/send channels refused; email and in_app are not affected. */
export const MESSAGING_CHANNELS_NOT_IN_LAUNCH: ReadonlySet<string> = new Set([
  'sms',
  'whatsapp',
  'push',
]);

export function channelNotInLaunchError(channel?: string): AppError {
  return new AppError({
    code: CHANNEL_NOT_IN_LAUNCH,
    message: channel
      ? `Sending '${channel}' through the API is not available at launch.`
      : 'Sending this channel through the API is not available at launch.',
    statusCode: 403,
  });
}

/**
 * The hook on every disabled route, first in its chain: `onRequest`, so it
 * runs before the route's authentication check, its body validation and the
 * rate limiter (which appends its own onRequest hook after this one). Only the
 * app-wide onRequest hooks run earlier — among them the one that reads the
 * caller's key or session — because Fastify runs those before any route's.
 *
 * It reads nothing and writes nothing: no database, no queue, no provider.
 */
export async function channelNotInLaunch(_request: FastifyRequest): Promise<void> {
  throw channelNotInLaunchError();
}
