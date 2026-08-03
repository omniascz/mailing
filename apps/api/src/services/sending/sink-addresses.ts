/**
 * Sink (simulation) recipient addresses — a test harness for delivery events.
 *
 * Sending to a sink address does NOT hit the MTA; instead it records the
 * matching lifecycle events + fires the webhooks, so developers can rehearse
 * their event handling without producing real bounces/complaints. Recognised:
 *   delivered@ / bounced@ / complained@ / opened@ / clicked@  on the sink domain
 * (SINK_DOMAIN env, default `sink.forgemsg.test`) or `resend.dev` (migration aid).
 */

import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';

export type SinkOutcome = 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked';

const OUTCOMES = new Set<SinkOutcome>(['delivered', 'bounced', 'complained', 'opened', 'clicked']);

function sinkDomains(): Set<string> {
  const configured = (process.env.SINK_DOMAIN ?? 'sink.forgemsg.test').toLowerCase();
  return new Set([configured, 'resend.dev']);
}

/**
 * Pure: return the simulated outcome if `email` is a sink address, else null.
 * Local part is the outcome; a `+tag` suffix is allowed (delivered+x@…).
 */
export function parseSinkAddress(email: string): SinkOutcome | null {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return null;
  const local = email.slice(0, at).toLowerCase().split('+')[0]!;
  const domain = email.slice(at + 1).toLowerCase();
  if (!sinkDomains().has(domain)) return null;
  return OUTCOMES.has(local as SinkOutcome) ? (local as SinkOutcome) : null;
}

/** The lifecycle events (in order) a sink outcome expands into. */
export function sinkEventChain(
  outcome: SinkOutcome,
): Array<'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked'> {
  switch (outcome) {
    case 'delivered':
      return ['delivered'];
    case 'bounced':
      return ['bounced'];
    case 'complained':
      return ['delivered', 'complained'];
    case 'opened':
      return ['delivered', 'opened'];
    case 'clicked':
      return ['delivered', 'clicked'];
  }
}

/**
 * Simulate a send to a sink address: write the event rows + fire the webhooks
 * for the outcome chain. Never dispatches to the MTA.
 */
export async function simulateSink(
  orgId: string,
  messageId: string,
  email: string,
  outcome: SinkOutcome,
): Promise<void> {
  const { emitEmailEvent } = await import('../webhooks/email-events.js');
  // kind (webhook -ed form) → email_event_type enum value.
  const EVENT_TYPE = {
    delivered: 'deliver',
    opened: 'open',
    clicked: 'click',
    bounced: 'bounce',
    complained: 'complaint',
  } as const;
  for (const kind of sinkEventChain(outcome)) {
    await db
      .insert(emailEvents)
      .values({
        orgId,
        messageId,
        eventType: EVENT_TYPE[kind],
        ...(kind === 'bounced' ? { bounceType: 'hard' as const } : {}),
        metadata: { simulated: true, sink: email },
      })
      .catch(() => {});
    emitEmailEvent(orgId, kind, { messageId, email, simulated: true });
  }
}
