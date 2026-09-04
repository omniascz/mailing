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
 * `unsubscribed`, but NOT for a stranger we have never seen — that is exactly
 * how a behaviour-triggered message is supposed to reach a `non_subscribed`
 * contact, and it is the mechanism abandoned checkout relies on.
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
 *   3. An address that unsubscribed or is suppressed is refused. Someone who
 *      told this shop to stop does not get restarted by a form.
 *   4. A tight per-route rate limit, keyed at the route.
 *
 * So the residual exposure is: at most one message, about one product, from one
 * shop, per address — and only for an address that has not opted out. That is
 * the industry norm for back-in-stock forms, but it is NOT consent, and the
 * confirmation step remains the honest follow-up.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
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

/**
 * Find the person behind an address, or create them.
 *
 * Same decision as #131's `findOrCreateBuyer`, for the same reason: a contact
 * created here is `non_subscribed` — they handed over an address for one
 * specific notification, which is not a marketing opt-in. `resolveAudience`
 * excludes that status in SQL and the contact belongs to no list, so asking to
 * be told about a restock cannot turn into a newsletter.
 *
 * The advisory lock is there for the same reason too: `contacts` has no unique
 * index on (org_id, email), so two submissions arriving together would each
 * insert.
 */
async function findOrCreateSubscriber(orgId: string, email: string): Promise<string> {
  const find = async (tx: typeof db) =>
    (
      await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)))
        .limit(1)
    )[0]?.id;

  const found = await find(db);
  if (found) return found;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${orgId}:${email}`}, 0))`,
    );
    const raced = await find(tx as unknown as typeof db);
    if (raced) return raced;

    const [created] = await tx
      .insert(contacts)
      .values({
        orgId,
        email,
        status: 'non_subscribed',
        source: 'stock_alert_form',
      })
      .returning({ id: contacts.id });
    return created!.id;
  });
}

/**
 * Has this address asked this shop to stop?
 *
 * Checked before the subscription is created rather than at send time. A person
 * who unsubscribed should not find that a form has quietly re-enrolled them,
 * even if the message would later have been filtered — the row itself is the
 * thing that reads as "they asked for this".
 */
async function hasOptedOut(orgId: string, contactId: string, email: string): Promise<boolean> {
  const [contact] = await db
    .select({ status: contacts.status })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (contact && (contact.status === 'unsubscribed' || contact.status === 'complained')) {
    return true;
  }

  const [supp] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email)))
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
  /** false when the address opted out — reported without saying which. */
  subscribed: boolean;
  id?: string;
}

/**
 * Resolve the subscriber, refuse an opt-out, and return the contact id.
 * Shared by both alert kinds so the consent decision is made in one place.
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

  if (email && (await hasOptedOut(orgId, contactId, email))) return null;
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
