/**
 * Subscribing to a stock or price alert from a shop's own product page.
 *
 * The two subscribe endpoints required a `contactId`, which a shopper standing
 * on a product page does not have and cannot obtain, so the only caller that
 * could ever reach them was the merchant's own backend holding a secret key.
 * The send half was repaired in #133; this is the half that lets a person ask.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO — and it is the load-bearing caveat.
 *
 * A public endpoint that accepts an arbitrary address is a way to sign someone
 * else up: when the product restocks, that address receives a real message. The
 * `triggered` stream this ends in is filtered for suppressions and for
 * `unsubscribed`; since Z166 a flow's marketing node also skips a
 * `non_subscribed` contact, which is what an address first seen here is
 * (Michal, 14. 10. 22:10, point 3: "marketingové uzly flow ho vynechají jako
 * kampaň"), so only a flow's transactional exception reaches it.
 *
 * Double opt-in is the correct answer to that and is out of scope here. What
 * bounds the harm without it:
 *
 *   1. A publishable key may not name a `contactId` — only an address. A key
 *      embedded in page JS must not be able to attach a subscription to a
 *      contact id it guessed or enumerated.
 *   2. One PENDING subscription per (org, sku, contact), enforced by a partial
 *      unique index rather than by a read-then-write. Submitting the form a
 *      thousand times produces one row and therefore at most one message.
 *   3. A contact that gets no marketing is refused — a status of
 *      MARKETING_REFUSED_CONTACT_STATUSES (unsubscribed, complained, bounced,
 *      pending, archived) — and so is an address with any suppression row in
 *      the org, by the address or by an erasure's fingerprint (Z172). Someone
 *      who told this shop to stop, an address that bounces and a double
 *      opt-in nobody confirmed are not enrolled by a form.
 *   4. A tight per-route rate limit, keyed at the route.
 *
 * So the residual exposure is: at most one message, about one product, from one
 * shop, per address — and only for an address nothing refuses. That is
 * the industry norm for back-in-stock forms, but it is NOT consent, and the
 * confirmation step remains the honest follow-up.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { MARKETING_REFUSED_CONTACT_STATUSES } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import { findOrCreateContact } from '../contacts/by-email.js';
import {
  contacts,
  suppressions,
  backInStockSubscriptions,
  priceDropSubscriptions,
  products,
  type BackInStockSubscription,
  type PriceDropSubscription,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { suppressionBlocks } from '../suppressions/email.js';

/**
 * Find the person behind an address, or create them.
 *
 * Same decision as #131's `findOrCreateBuyer`, for the same reason: a contact
 * created here is `non_subscribed` — they handed over an address for one
 * specific notification, which is not a marketing opt-in. `resolveAudience`
 * excludes that status in SQL and the contact belongs to no list, so asking to
 * be told about a restock cannot turn into a newsletter.
 */
async function findOrCreateSubscriber(orgId: string, email: string): Promise<string> {
  // One address, one contact (../contacts/by-email.ts); the unique index
  // settles two submissions arriving together.
  const { contact } = await findOrCreateContact(orgId, email, {
    status: 'non_subscribed',
    source: 'stock_alert_form',
  });
  return contact.id;
}

/**
 * Does something refuse an alert to this contact?
 *
 * Checked before the subscription is created rather than at send time: the
 * row is what reads as "they asked for this". Two things refuse it (Z172,
 * ZADAVATEL.md item 5):
 *
 *   - the contact's status is one of MARKETING_REFUSED_CONTACT_STATUSES. Before
 *     Z172 only unsubscribed and complained were refused, so the form enrolled
 *     a pending contact (a double opt-in nobody confirmed), a bounced one and
 *     an archived one (Z146 MIMO 4). non_subscribed and active pass;
 *   - the address has any suppression row in the org, by the address or by an
 *     erasure's fingerprint (suppressionBlocks). Before Z172 the lookup was by
 *     the address alone, so an erased address typed into the form again was
 *     enrolled.
 *
 * The status is checked whether or not the contact has an address; the row
 * only when it has one.
 */
async function refusesAlert(orgId: string, contactId: string, email: string): Promise<boolean> {
  const [contact] = await db
    .select({ status: contacts.status })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (contact && MARKETING_REFUSED_CONTACT_STATUSES.includes(contact.status)) return true;
  if (!email) return false;

  const [supp] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), suppressionBlocks(email)))
    .limit(1);
  return !!supp;
}

export interface PublicSubscribeInput {
  /** Present only for a secret-key or session caller. */
  contactId?: string;
  /** Present for a publishable-key caller; the only identifier it may send. */
  email?: string;
  sku: string;
  channel?: string;
}

export interface PublicSubscribeOutcome {
  /**
   * false when refusesAlert refused it. Only a secret-key or session caller
   * sees this; a publishable-key caller is answered the same either way
   * (routes/v1/stock-alerts.ts).
   */
  subscribed: boolean;
  id?: string;
}

/**
 * Resolve the subscriber, refuse what refusesAlert refuses, and return the
 * contact id. Shared by both alert kinds and by every caller (publishable key,
 * secret key, session) so the decision is made in one place.
 */
async function resolveSubscriber(
  orgId: string,
  input: PublicSubscribeInput,
): Promise<{ contactId: string; email: string } | null> {
  if (!input.contactId && !input.email) {
    throw AppError.badRequest('Either contactId or email is required');
  }

  let contactId: string;
  let email: string;

  if (input.contactId) {
    const [row] = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, orgId)))
      .limit(1);
    // Scoped to the org, so a contact id belonging to another tenant reads as
    // absent rather than as somebody else's contact.
    if (!row) throw AppError.notFound('Contact');
    contactId = row.id;
    email = row.email ?? '';
  } else {
    email = input.email!.toLowerCase();
    contactId = await findOrCreateSubscriber(orgId, email);
  }

  if (await refusesAlert(orgId, contactId, email)) return null;
  return { contactId, email };
}

export async function subscribeBackInStock(
  orgId: string,
  input: PublicSubscribeInput,
): Promise<PublicSubscribeOutcome> {
  const who = await resolveSubscriber(orgId, input);
  if (!who) return { subscribed: false };

  const [row] = await db
    .insert(backInStockSubscriptions)
    .values({
      orgId,
      contactId: who.contactId,
      sku: input.sku,
      channel: input.channel ?? 'email',
    })
    // Idempotent by the partial unique index: asking twice is one subscription
    // and therefore one message. `DO NOTHING` returns no row, so the existing
    // one is read back below rather than reported as a failure.
    .onConflictDoNothing()
    .returning({ id: backInStockSubscriptions.id });

  if (row) return { subscribed: true, id: row.id };

  const [existing] = await db
    .select({ id: backInStockSubscriptions.id })
    .from(backInStockSubscriptions)
    .where(
      and(
        eq(backInStockSubscriptions.orgId, orgId),
        eq(backInStockSubscriptions.sku, input.sku),
        eq(backInStockSubscriptions.contactId, who.contactId),
        isNull(backInStockSubscriptions.notifiedAt),
      ),
    )
    .limit(1);
  return { subscribed: true, id: existing?.id };
}

export async function subscribePriceDrop(
  orgId: string,
  input: PublicSubscribeInput,
): Promise<PublicSubscribeOutcome> {
  // The price to watch is the one on the product now, so the product has to
  // exist — unlike back-in-stock, where a SKU that is not in the catalogue yet
  // is still a thing a person can wait for.
  const [prod] = await db
    .select({ price: products.price })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, input.sku)))
    .limit(1);
  if (!prod) throw AppError.notFound('Product');

  const who = await resolveSubscriber(orgId, input);
  if (!who) return { subscribed: false };

  const [row] = await db
    .insert(priceDropSubscriptions)
    .values({
      orgId,
      contactId: who.contactId,
      sku: input.sku,
      channel: input.channel ?? 'email',
      priceAtSubscribe: prod.price,
    })
    .onConflictDoNothing()
    .returning({ id: priceDropSubscriptions.id });

  if (row) return { subscribed: true, id: row.id };

  const [existing] = await db
    .select({ id: priceDropSubscriptions.id })
    .from(priceDropSubscriptions)
    .where(
      and(
        eq(priceDropSubscriptions.orgId, orgId),
        eq(priceDropSubscriptions.sku, input.sku),
        eq(priceDropSubscriptions.contactId, who.contactId),
        isNull(priceDropSubscriptions.notifiedAt),
      ),
    )
    .limit(1);
  return { subscribed: true, id: existing?.id };
}

export type { BackInStockSubscription, PriceDropSubscription };
