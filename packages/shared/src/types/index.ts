// Common types used across all packages

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'system_admin';

/** Every value of the contact_status enum (apps/api db/schema/enums.ts). */
export type ContactStatus =
  | 'active'
  | 'unsubscribed'
  | 'bounced'
  | 'complained'
  | 'pending'
  | 'non_subscribed'
  | 'archived';

/**
 * The contact statuses that get no marketing e-mail, whatever the suppression
 * list says: they opted out, the address bounced, they complained, they have
 * not confirmed the double opt-in yet (no consent, zákon 480/2004 Sb.), or
 * they were archived.
 *
 * 'archived' is "Removed from marketing" in the enum, and every campaign
 * audience already leaves it out (listAudienceWhere,
 * services/campaigns/auto-resend.ts). A flow e-mail still reached it, on the
 * inline branch of the dispatch and on the template branch alike (measured,
 * Z152 MIMO 1); listing it here closes both. Z153.
 *
 * 'non_subscribed' is NOT here, although the campaign audience leaves it out
 * too: this list is also read by sends that are not a flow's marketing node.
 * A flow's marketing node refuses it through FLOW_MARKETING_REFUSED_CONTACT_STATUSES
 * below (Michal, 14. 10. 22:10, point 3; Z166).
 *
 * One list for both readers: the workers batch-sender (every broadcast and
 * triggered send) and the API's inline-HTML branch of the workflow dispatch
 * (routes/v1/internal/workflow-dispatch.ts), which sends a flow's e-mail on
 * the transactional stream and so never meets the batch-sender's check (Z152).
 */
export const MARKETING_REFUSED_CONTACT_STATUSES: readonly ContactStatus[] = [
  'unsubscribed',
  'bounced',
  'complained',
  'pending',
  'archived',
];

/** Does this contact status refuse marketing e-mail (MARKETING_REFUSED_CONTACT_STATUSES)? */
export function refusesMarketing(status: string | null | undefined): boolean {
  return (MARKETING_REFUSED_CONTACT_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * The consent statuses a merge carries over, strictest first. A merge of two
 * contacts (POST /identity-graph/merge, the automatic merge of ingestSignals,
 * POST /duplicates/merge) joins two records of one person, so the winner may
 * not keep a permission the loser's refusal took back. Before Z174 the winner
 * kept its own status: an active winner merged with an unsubscribed,
 * complained or pending loser got the next campaign (measured, Z173).
 *
 * 'bounced' is not here: a bounce belongs to the loser's ADDRESS, not to the
 * person's consent, and carrying it would stop the flow's transactional node
 * to the winner's working address (Z173, measured 1 → 0). A bounced winner
 * stays bounced. 'archived' is not a consent status: an archived loser counts
 * by its archived_from.
 */
const MERGE_STATUS_ORDER: readonly ContactStatus[] = [
  'complained',
  'unsubscribed',
  'pending',
  'non_subscribed',
  'active',
];

/** A contact as a merge reads it: its status and what an archive replaced. */
export interface MergeStatusInput {
  status: ContactStatus;
  archivedFrom: ContactStatus | null;
}

/**
 * The status the winner of a merge gets: the strictest of the winner's and
 * the losers' by MERGE_STATUS_ORDER, never a more permissive one than the
 * winner has (Z174, položka 6).
 *
 *  - A loser's 'bounced' is ignored, and so is an archived loser whose
 *    archived_from is 'bounced' or NULL; any other archived loser counts as
 *    its archived_from.
 *  - A 'bounced' winner, or a winner whose status is outside the order, is
 *    returned unchanged.
 *  - An archived winner stays archived; its archived_from becomes the
 *    strictest of its own and the losers'. An archived_from of 'bounced' is
 *    not changed, and neither is a NULL one: what such an archive replaced is
 *    read from the suppression rows (consent-hold heldStatus), so a caller
 *    that wants it merged passes the status read there instead of NULL.
 */
export function strictestMergeStatus(
  winner: MergeStatusInput,
  losers: readonly MergeStatusInput[],
): MergeStatusInput {
  const rank = (s: ContactStatus | null) => (s ? MERGE_STATUS_ORDER.indexOf(s) : -1);
  const own = winner.status === 'archived' ? winner.archivedFrom : winner.status;
  if (rank(own) < 0) return winner;
  let strictest = own as ContactStatus;
  for (const l of losers) {
    const s = l.status === 'archived' ? l.archivedFrom : l.status;
    if (rank(s) >= 0 && rank(s) < rank(strictest)) strictest = s as ContactStatus;
  }
  return winner.status === 'archived'
    ? { status: 'archived', archivedFrom: strictest }
    : { status: strictest, archivedFrom: winner.archivedFrom };
}

/**
 * The contact statuses a flow's MARKETING node reaches no one in: the shared
 * list above plus 'non_subscribed'.
 *
 * Michal, 14. 10. 22:10, point 3: "non_subscribed: marketingové uzly flow ho
 * vynechají jako kampaň; transakční výjimka z bodu 1 platí." A contact with an
 * address and no marketing opt-in — a shop's buyer, a shopper the checkout
 * script reported, an address from a restock or price-drop form — gets no
 * marketing node of a flow, on any channel, exactly as no campaign reaches it.
 * Z166.
 *
 * Read only for a flow's marketing node: the template branch (batch-sender,
 * for a job the dispatch marked flowMarketing), the inline-HTML branch of the
 * workflow dispatch, the SMS routing gate for a flow's SMS and the WhatsApp /
 * web push workers for a flow's job. Never under the flow's transactional
 * exception: that node is not a marketing node, and as nothing else refuses
 * 'non_subscribed', FLOW_TRANSACTIONAL_LIFTED_STATUSES needs no change for it.
 * Every other send reads MARKETING_REFUSED_CONTACT_STATUSES as before.
 */
export const FLOW_MARKETING_REFUSED_CONTACT_STATUSES: readonly ContactStatus[] = [
  ...MARKETING_REFUSED_CONTACT_STATUSES,
  'non_subscribed',
];

/** Does a flow's marketing node refuse this status (FLOW_MARKETING_REFUSED_CONTACT_STATUSES)? */
export function refusesFlowMarketing(status: string | null | undefined): boolean {
  return (FLOW_MARKETING_REFUSED_CONTACT_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * The refused statuses a flow's transactional exception lets through: a
 * send_sms or send_email node (inline HTML or a template) with priority
 * 'transactional', in a flow started by a trigger on the closed list
 * (TRANSACTIONAL_FLOW_TRIGGERS in the API's
 * services/workflows/transactional-exception.ts) — the ticket, the order, the
 * change or cancellation of an event.
 *
 * Michal, 15. 10. 6:10, point 1b ("of course he must get the informational
 * mail"), which overrides the commissioner's narrower reading of Z156 (only
 * unsubscribed and complained): such a message reaches a pending, archived,
 * unsubscribed, complained or non_subscribed contact. 'non_subscribed' is not
 * listed because nothing refuses it in the first place. What still stops it
 * is the GDPR fingerprint (an erased person) and a hard bounce / invalid
 * address (the address does not work) — suppression rows, not statuses. Z158.
 *
 * Three points wait on Michal and stay EXACTLY as before Z158:
 *  - the 'complaint', 'manual' and 'block' suppression rows still stop the
 *    exception (mta-sender SUPPRESSES_TRANSACTIONAL);
 *  - 'bounced' is not lifted, with or without a suppression row;
 *  - a soft-deleted contact gets nothing.
 *
 * One list for every reader: the SMS routing gate (routedSmsSend), the
 * inline-HTML branch of the flow e-mail dispatch and the template branch
 * (batch-sender, for a job the dispatch marked flowTransactional).
 */
export const FLOW_TRANSACTIONAL_LIFTED_STATUSES: readonly ContactStatus[] = [
  'unsubscribed',
  'complained',
  'pending',
  'archived',
];

/** Does the flow transactional exception lift this status (FLOW_TRANSACTIONAL_LIFTED_STATUSES)? */
export function liftedByFlowTransactional(status: string | null | undefined): boolean {
  return (FLOW_TRANSACTIONAL_LIFTED_STATUSES as readonly string[]).includes(status ?? '');
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

export type PhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';

export type PhoneStatus = 'active' | 'inactive' | 'unknown' | 'invalid';

export interface PhoneInfo {
  country: string;
  countryCode: string;
  type: PhoneType;
  originalOperator: string | null;
  region: string | null;
  district: string | null;
  isValid: boolean;
}
