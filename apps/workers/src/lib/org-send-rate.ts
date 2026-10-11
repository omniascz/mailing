/**
 * The organisation's per-second send rate, taken when a message is SENT, not
 * when it is accepted (Z134).
 *
 * It used to be taken at acceptance (enforceSendRate in the API): a message
 * over the rate was refused with 429/451, so a customer had to retry what the
 * platform could simply have sent a moment later, and batches needed an
 * exemption because a batch larger than the rate could never be accepted.
 * Acceptance is only submission; pacing belongs where the message leaves.
 *
 * A slot, not a try-again token. Each message reserves the next free slot on
 * the organisation's timeline — `1000 / rate` ms apart — in one atomic step,
 * and is deferred to exactly that slot. A try-and-retry token would wake every
 * waiting message each second and let one win: a backlog of a thousand would
 * be a thousand wake-ups a second, and an unlucky message could lose forever.
 * A slot is first come, first served, costs one deferral per message, and
 * cannot be lost: the time it names always arrives.
 *
 * At most `rate` slots fall in any one second, so the plan's limit holds
 * exactly; the limit itself (PLAN_SEND_RATE in the API, or the org's
 * settings.maxSendRate) is unchanged and travels on the job as orgSendRate.
 */
import { redis } from '@forgemsg/shared/redis';

const SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local nxt = tonumber(redis.call('GET', KEYS[1]) or '0')
if nxt < now then nxt = now end
local after = nxt + interval
redis.call('SET', KEYS[1], after, 'PX', math.floor(after - now + 60000))
return nxt
`;

export const orgSendRateKey = (orgId: string) => `sendrate:slot:${orgId}`;

/**
 * Reserve this message's slot. Returns the epoch ms at which it may be sent:
 * `now` when the organisation's timeline is free, later when it is booked.
 */
export async function reserveOrgSendSlot(
  orgId: string,
  ratePerSecond: number,
  now: number = Date.now(),
): Promise<number> {
  // Rounded up: 1000 / 14 floored to 71 ms would fit 15 slots in 994 ms.
  const interval = Math.max(1, Math.ceil(1000 / ratePerSecond));
  const slot = await redis.eval(SLOT_SCRIPT, 1, orgSendRateKey(orgId), now, interval);
  return Number(slot);
}
