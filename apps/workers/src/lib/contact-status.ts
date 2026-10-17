/**
 * The contact's status as the channel senders read it — the one copy for the
 * WhatsApp, web push and mobile push workers (Z155).
 *
 * Read from /internal/contacts/batch, where batch-sender reads it. That route
 * scopes by org and leaves soft-deleted contacts out, so `null` means "no such
 * contact in this org, or deleted" — and such a contact gets nothing.
 *
 * Every job on those queues comes from a campaign or a flow, so every one is
 * marketing: Michal, 13. 10. — a contact who refuses marketing gets it on no
 * channel, and a flow is marketing.
 */
import { refusesFlowMarketing, refusesMarketing } from '@forgemsg/shared';
import { internalHeaders } from './internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function contactStatus(orgId: string, contactId: string): Promise<string | null> {
  return (await contactAndPhone(orgId, contactId)).status;
}

/**
 * The contact's status and, when `phone` is given, whether a GDPR erasure in
 * the org left that number's fingerprint (Z180). The API computes the
 * fingerprint — its key is not in the workers — from the optional `phone` of
 * the same request; without `phone` the request is exactly as before.
 */
async function contactAndPhone(
  orgId: string,
  contactId: string,
  phone?: string,
): Promise<{ status: string | null; phoneSuppressed: boolean }> {
  const res = await fetch(`${API_URL}/api/v1/internal/contacts/batch`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      orgId,
      contactIds: [contactId],
      ...(phone === undefined ? {} : { phone }),
    }),
  });
  // Unknown is not consent: throw, and BullMQ retries rather than sending.
  if (!res.ok) throw new Error(`/internal/contacts/batch → ${res.status}`);
  const body = (await res.json()) as {
    data: { id: string; status: string | null }[];
    phoneSuppressed?: boolean;
  };
  return {
    status: body.data.find((c) => c.id === contactId)?.status ?? null,
    phoneSuppressed: body.phoneSuppressed === true,
  };
}

export type ContactSkip = 'skipped_no_contact' | 'skipped_pending' | 'skipped_refused';

/**
 * Why a campaign or flow message must not reach this contact, or null when it
 * may. Not found / deleted → skipped_no_contact (the fixed rule of roadmap
 * point 1); pending → skipped_pending (Z143, kept); any other status in
 * MARKETING_REFUSED_CONTACT_STATUSES → skipped_refused. For a flow's job
 * (`fromFlow`: the job carries the workflowRunId the API's executor puts in
 * it, which no campaign job has) 'non_subscribed' is skipped_refused too —
 * FLOW_MARKETING_REFUSED_CONTACT_STATUSES (Michal, 14. 10. 22:10, point 3;
 * Z166). A campaign's job is unchanged.
 *
 * `phone` (the WhatsApp worker's, Z180): a number whose fingerprint a GDPR
 * erasure left in suppressions.phone_hash is skipped_refused too, whatever
 * contact holds it now. A caller that gives no `phone` asks as before.
 */
export async function marketingSkip(
  orgId: string,
  contactId: string,
  fromFlow = false,
  phone?: string,
): Promise<ContactSkip | null> {
  const { status, phoneSuppressed } = await contactAndPhone(orgId, contactId, phone);
  if (status === null) return 'skipped_no_contact';
  if (status === 'pending') return 'skipped_pending';
  if (fromFlow ? refusesFlowMarketing(status) : refusesMarketing(status)) return 'skipped_refused';
  if (phoneSuppressed) return 'skipped_refused';
  return null;
}
