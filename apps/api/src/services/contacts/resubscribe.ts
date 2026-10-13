/**
 * The recipient undoes their own unsubscribe — the reverse of
 * unsubscribeGlobally in ./unsubscribe.ts, and only of that.
 *
 * Two stores say "do not send marketing" and the send path reads both:
 * batch-sender refuses on contacts.status = 'unsubscribed', and the suppression
 * row stops the address at batch-sender and again at mta-sender. Lifting one of
 * the two is a promise of mail that never comes, which is what the preference
 * centre did: it deleted the row and left the status.
 *
 * What is lifted is the recipient's own refusal and nothing else:
 *
 *  - Only a suppression with reason 'unsubscribe'. A hard bounce, a complaint,
 *    a block, an invalid address or an org's manual entry is about the address
 *    or the sender's decision, not about this person's consent, and a click in
 *    an old email (or a fresh sign-up) is no evidence that the address now
 *    accepts mail or that the complaint is withdrawn. #225 drew the same line
 *    for transactional mail: only 'unsubscribe' lets it through.
 *  - Only from the statuses the caller names. A bounced or complained contact
 *    is never in that list — those are deliverability states, and a consent
 *    act cannot clear them.
 *  - The status becomes 'active' only when nothing else still suppresses the
 *    address, so the two stores never disagree in the direction that promises
 *    mail.
 *
 * Per-list rows are the caller's business: a global unsubscribe closed them all
 * on purpose, and each path decides which lists the recipient asked back into.
 *
 * The consent that lifts the refusal is recorded, in the same transaction, as a
 * consent_events row: what the recipient did, where, when, from which (hashed)
 * address and browser. Before Z142 nothing was kept — the suppression row was
 * the only record of the unsubscribe, and the resubscribe deleted it.
 */
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { consentEvents, contacts, suppressions } from '../../db/schema/index.js';

/** How the recipient gave the consent being acted on. Required: no proof, no resubscribe. */
export interface ConsentProof {
  eventType: 're_consent' | 'double_opt_in';
  /** 'preference_center', 'double_opt_in', … */
  source: string;
  ip?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  payload?: Record<string, unknown>;
}

/** The address is kept as a hash, as consent_events.ip_hash is documented. */
export function hashIp(ip: string | null | undefined): string | null {
  return ip ? createHash('sha256').update(ip).digest('hex') : null;
}

type ContactStatus = (typeof contacts.$inferSelect)['status'];

export interface ResubscribeResult {
  /** The contact's status after the call. */
  status: ContactStatus;
  /** True when the contact can now be sent marketing: active and unsuppressed. */
  reachable: boolean;
}

export async function resubscribeContact(
  orgId: string,
  contactId: string,
  opts: { from: readonly ContactStatus[]; proof: ConsentProof },
): Promise<ResubscribeResult | null> {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select({ status: contacts.status, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
      .limit(1);
    if (!contact) return null;

    const email = contact.email?.toLowerCase() ?? null;
    if (contact.status !== 'active' && !opts.from.includes(contact.status)) {
      return { status: contact.status, reachable: false };
    }

    let lifted = 0;
    if (email) {
      const removed = await tx
        .delete(suppressions)
        .where(
          and(
            eq(suppressions.orgId, orgId),
            eq(suppressions.email, email),
            eq(suppressions.reason, 'unsubscribe'),
          ),
        )
        .returning({ id: suppressions.id });
      lifted = removed.length;
    }
    const changesStatus = contact.status !== 'active';
    if (lifted > 0 || changesStatus) {
      await tx.insert(consentEvents).values({
        orgId,
        contactId,
        eventType: opts.proof.eventType,
        legalBasis: 'consent',
        channel: 'email',
        purposeCode: 'marketing_email',
        ipHash: hashIp(opts.proof.ip),
        userAgent: opts.proof.userAgent?.slice(0, 1000) ?? null,
        source: opts.proof.source,
        sourceUrl: opts.proof.sourceUrl ?? null,
        proofPayload: {
          ...opts.proof.payload,
          fromStatus: contact.status,
          liftedUnsubscribe: lifted > 0,
        },
      });
    }

    if (email) {
      const [still] = await tx
        .select({ id: suppressions.id })
        .from(suppressions)
        .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email)))
        .limit(1);
      if (still) return { status: contact.status, reachable: false };
    }

    if (changesStatus) {
      await tx
        .update(contacts)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
    }
    return { status: 'active', reachable: true };
  });
}
