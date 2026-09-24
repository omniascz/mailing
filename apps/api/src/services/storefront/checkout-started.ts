/**
 * A cart reported by the shop's own page, rather than by a connector.
 *
 * Shoptet delivers no cart webhook — its event code list has orders, customers,
 * products and stock, and nothing about a basket — and its abandoned-cart
 * export carries no cart identifier and no recovery URL, so a poller could
 * neither deduplicate nor link back (probe Z75). What Shoptet does allow is a
 * script in the template: HTML codes can be inserted from the e-shop
 * administration, and the dataLayer exposes the cart's contents on the basket
 * page. So the page reports the cart itself, the same way the web SDK already
 * reports every other custom event.
 *
 * This is the server half. It exists separately from POST /api/v1/events
 * because that route takes a `contactId`, and a shop page has none: it holds a
 * publishable key that is visible in the page source, so the identifier it may
 * send is an address and nothing else (the rule stock-alerts states and this
 * follows).
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, workflowEvents } from '../../db/schema/index.js';
import { onCheckoutStarted } from '../workflows/triggers.js';

/**
 * How long one shopper's basket counts as the same basket.
 *
 * The page fires on every load of the cart, and a shopper who adds three items
 * over ten minutes loads it three times. Without this they would enrol three
 * times and — once the waits elapse — be reminded three times about one cart.
 *
 * Thirty minutes, and the decision is HERE rather than in the script: the page
 * cannot be trusted with it. sessionStorage forgets on a new tab, a reload in a
 * private window starts again, and anybody holding the publishable key can call
 * the endpoint directly. A rule that only holds when the client cooperates is
 * not a rule.
 *
 * It is deliberately shorter than the recipes' first touch (one hour, the
 * `wait` in abandoned-cart-cs), so a genuinely new visit later in the day still
 * enrols.
 */
export const CHECKOUT_DEDUPE_MINUTES = 30;

export interface CheckoutStartedInput {
  email: string;
  /** The shop's own identifier for the basket, when it has one. */
  cartId?: string;
  amount?: number;
  currency?: string;
  itemCount?: number;
  /** Where to send the shopper back to — the shop's cart page. */
  recoveryUrl?: string;
}

export interface CheckoutStartedResult {
  /** False when the same shopper already reported this basket. */
  started: boolean;
  reason?: 'duplicate';
}

/**
 * The shopper behind the address, created if we have never seen them.
 *
 * `non_subscribed` and no list, for the reason the connector path states at
 * length: somebody who reaches a checkout has handed over an address in order
 * to buy, which is a contractual basis for transactional mail and NOT a
 * marketing opt-in. An address we already know is only looked up — reaching a
 * checkout must not rewrite an existing contact's status, which would
 * unsubscribe a subscriber or resurrect somebody who left.
 *
 * The advisory lock is the same guard as findOrCreateBuyer: `contacts` has no
 * unique index on (org_id, email), and two tabs reporting one basket would
 * otherwise each insert.
 */
async function findOrCreateShopper(orgId: string, email: string): Promise<string | undefined> {
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
        lifecycleStage: 'lead',
        source: 'storefront_script',
      })
      .returning({ id: contacts.id });
    return created?.id;
  });
}

/** Has this shopper already reported a basket inside the window? */
async function reportedRecently(orgId: string, contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - CHECKOUT_DEDUPE_MINUTES * 60_000);
  const [row] = await db
    .select({ id: workflowEvents.id })
    .from(workflowEvents)
    .where(
      and(
        eq(workflowEvents.orgId, orgId),
        eq(workflowEvents.contactId, contactId),
        eq(workflowEvents.eventName, 'checkout_started'),
        gte(workflowEvents.createdAt, since),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Record a basket the shop's page reported, and start whatever waits for it.
 *
 * The payload mirrors what the Shopify connector sends (services/ecommerce
 * ingestCheckout → onCheckoutStarted), so one recipe reads both: a shop wired
 * through OAuth and a shop with a script in its template produce the same
 * merge tags.
 */
export async function recordCheckoutStarted(
  orgId: string,
  input: CheckoutStartedInput,
): Promise<CheckoutStartedResult> {
  const contactId = await findOrCreateShopper(orgId, input.email.toLowerCase().trim());
  if (!contactId) return { started: false, reason: 'duplicate' };

  if (await reportedRecently(orgId, contactId)) {
    return { started: false, reason: 'duplicate' };
  }

  await onCheckoutStarted(orgId, contactId, {
    checkoutId: input.cartId,
    checkoutToken: input.cartId,
    amount: input.amount,
    currency: input.currency,
    itemCount: input.itemCount,
    recoveryUrl: input.recoveryUrl,
    // Named so a merge tag can say where it came from, and so the event row is
    // distinguishable from a connector's in the audit.
    source: 'storefront_script',
  });

  return { started: true };
}
