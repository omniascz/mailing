/**
 * Which suppression reasons and which contact statuses stop a message — the
 * one definition both e-mail senders read: mta-sender at the moment of sending
 * (reasonsFor, exceptErasureFor) and batch-sender before it renders a batch
 * (reasonsFor and refusedByStatus).
 *
 * Its own module because mta-sender.ts opens Redis and gRPC on import, and
 * batch-sender must not. Moved here from mta-sender.ts in Z158, which added
 * 'flow_transactional' and refusedByStatus; mta-sender re-exports reasonsFor.
 */
import {
  liftedByFlowTransactional,
  refusesFlowMarketing,
  refusesMarketing,
} from '@forgemsg/shared';
import type { MtaSendJobData } from '../queues/index.js';

/**
 * Suppression reasons that stop a transactional message.
 *
 * Every reason except `unsubscribe`. An unsubscribe is a refusal of marketing
 * (services/contacts/unsubscribe.ts writes it for every opt-out), not of the
 * contract: a person who left the newsletter still gets the receipt, the
 * password reset, and the confirmation mail when they subscribe again — that
 * confirmation goes out through this same transactional path, so suppressing
 * it here would make an unsubscribe impossible to undo. The other reasons say
 * the address itself must not be mailed (it bounced, complained, was blocked,
 * does not exist, or the org said so), and those hold for any message.
 *
 * Broadcast and triggered mail check every reason — except a triggered flow
 * e-mail under the flow's transactional exception ('flow_transactional'
 * below), which checks these.
 */
export const SUPPRESSES_TRANSACTIONAL = [
  'hard_bounce',
  'complaint',
  'manual',
  'block',
  'invalid_email',
] as const;

/**
 * Does this job skip the row a GDPR erasure leaves? Only a list double opt-in
 * confirmation does: mta-sender then sends `exceptErasure` to check-batch,
 * which leaves out exactly the erasure row — reason 'manual', no address, the
 * keyed fingerprint in email_hash (services/contacts/gdpr.ts in the API). Every
 * reason of SUPPRESSES_TRANSACTIONAL still counts for it, 'manual' included.
 *
 * Výjimka jen pro výmaz GDPR — Michal 14. 10., varianta (a). Z148 let the
 * confirmation through every 'manual' row, and 'manual' is also what an
 * operator adds by hand (POST /suppressions, the MCP suppress_contact tool
 * through it) and what graymail writes: a confirmation went to an address the
 * organisation had blocked, and its link lifts none of those rows anyway. The
 * erased person is the case the exception is for: the person asked for the
 * mail by submitting the form, it carries only the confirmation link, and that
 * link is the only way back (resubscribe.ts lifts the erasure on the
 * confirmation, and on nothing else). An erased address that also has an
 * ordinary 'manual' row by its address stays stopped.
 *
 * A bounce, a complaint, a block or an invalid address stop it too: the
 * address does not work, or its owner reported us.
 *
 * The third purpose, 'workflow_marketing', has no list of its own: it is a
 * flow's inline-HTML e-mail, marketing on the transactional stream, and every
 * reason stops it — 'unsubscribe' too, as for broadcast and triggered (Z152;
 * see the inline branch of the API's workflow-dispatch.ts). Nothing but the
 * list confirmation skips the erasure row; batch-sender never asks.
 */
export function exceptErasureFor(data: Pick<MtaSendJobData, 'stream' | 'purpose'>): boolean {
  return data.stream === 'transactional' && data.purpose === 'doi_confirmation';
}

/**
 * The reasons that count for this job; undefined means every reason. A list
 * double opt-in confirmation counts SUPPRESSES_TRANSACTIONAL, as any
 * transactional message does; only the erasure row is set aside for it
 * (exceptErasureFor).
 *
 * 'flow_transactional' is the flow's transactional exception on the template
 * branch (Z158 — Michal, 15. 10. 6:10, point 1b): a triggered e-mail the API's
 * workflow dispatch marked from the database. It is stopped by exactly what
 * stops the same exception on the inline branch, which travels on the
 * transactional stream with no purpose — SUPPRESSES_TRANSACTIONAL — whatever
 * its own stream. The 'complaint', 'manual' and 'block' rows staying in that
 * list waits on Michal and is unchanged.
 */
export function reasonsFor(
  data: Pick<MtaSendJobData, 'stream' | 'purpose'>,
): readonly string[] | undefined {
  if (data.purpose === 'flow_transactional') return SUPPRESSES_TRANSACTIONAL;
  if (data.stream !== 'transactional') return undefined;
  if (data.purpose === 'workflow_marketing') return undefined;
  return SUPPRESSES_TRANSACTIONAL;
}

/**
 * Does batch-sender refuse a contact of this status?
 *
 * Marketing refuses MARKETING_REFUSED_CONTACT_STATUSES (@forgemsg/shared).
 * Under the flow's transactional exception the statuses of
 * FLOW_TRANSACTIONAL_LIFTED_STATUSES pass — the same shared test the inline
 * branch and the SMS gate apply (Z158); 'bounced' does not.
 *
 * A flow's marketing node (flowMarketing, Z166 — Michal, 14. 10. 22:10, point
 * 3) refuses FLOW_MARKETING_REFUSED_CONTACT_STATUSES, which adds
 * 'non_subscribed'. It is never read under the exception.
 */
export function refusedByStatus(
  status: string | null | undefined,
  flowTransactional: boolean,
  flowMarketing = false,
): boolean {
  if (flowTransactional) return refusesMarketing(status) && !liftedByFlowTransactional(status);
  if (flowMarketing) return refusesFlowMarketing(status);
  return refusesMarketing(status);
}
