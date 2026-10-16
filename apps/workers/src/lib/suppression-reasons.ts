/**
 * Which suppression reasons and which contact statuses stop a message — the
 * one definition both e-mail senders read: mta-sender at the moment of sending
 * (reasonsFor) and batch-sender before it renders a batch (reasonsFor and
 * refusedByStatus).
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
 * The reasons that stop a list double opt-in confirmation: the transactional
 * ones without 'manual'.
 *
 * 'manual' is what a GDPR erasure leaves (by hash), what an operator adds by
 * hand (POST /suppressions, and the MCP suppress_contact tool through it) and
 * what graymail writes. For this one mail it is
 * not a refusal: the person asked for it by submitting the form, it carries
 * only the confirmation link, and that link is the only way an erased person
 * comes back (resubscribe.ts lifts the erasure on the confirmation, and on
 * nothing else). Nothing else is lifted by sending it — marketing stays
 * blocked until the link is clicked. Owner's decision, 14 Oct 2026 (Z148).
 *
 * A bounce, a complaint, a block or an invalid address still stop it: the
 * address does not work, or its owner reported us.
 *
 * The third purpose, 'workflow_marketing', has no list of its own: it is a
 * flow's inline-HTML e-mail, marketing on the transactional stream, and every
 * reason stops it — 'unsubscribe' too, as for broadcast and triggered (Z152;
 * see the inline branch of the API's workflow-dispatch.ts).
 */
const SUPPRESSES_DOI_CONFIRMATION = SUPPRESSES_TRANSACTIONAL.filter((r) => r !== 'manual');

/**
 * The reasons that count for this job; undefined means every reason.
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
  if (data.purpose === 'doi_confirmation') return SUPPRESSES_DOI_CONFIRMATION;
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
