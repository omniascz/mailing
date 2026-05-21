import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { billingSubscriptions, contacts, organizations } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// Plan catalogue — kept in sync with Stripe product catalogue.
export const PLANS = {
  free: { name: 'Free', contacts: 500, sends: 2_500, priceUsd: 0 },
  starter: { name: 'Starter', contacts: 2_500, sends: 12_500, priceUsd: 15 },
  pro: { name: 'Pro', contacts: 10_000, sends: 50_000, priceUsd: 49 },
  business: { name: 'Business', contacts: 50_000, sends: 250_000, priceUsd: 149 },
  enterprise: { name: 'Enterprise', contacts: -1, sends: -1, priceUsd: -1 },
} as const;

export type PlanTier = keyof typeof PLANS;

export function listPlans() {
  return Object.entries(PLANS).map(([tier, info]) => ({ tier, ...info }));
}

// ── Subscription helpers ──────────────────────────────────────────────────────

export async function getOrCreateSubscription(orgId: string) {
  const [existing] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.orgId, orgId));

  if (existing) return existing;

  const [created] = await db
    .insert(billingSubscriptions)
    .values({ orgId, plan: 'free' })
    .returning();
  return created!;
}

export async function getSubscription(orgId: string) {
  return getOrCreateSubscription(orgId);
}

// ── Stripe Checkout ───────────────────────────────────────────────────────────

export async function createCheckoutSession(
  orgId: string,
  opts: {
    tier: Exclude<PlanTier, 'free'>;
    successUrl: string;
    cancelUrl: string;
  },
) {
  if (!process.env.STRIPE_SECRET_KEY) throw AppError.badRequest('Stripe not configured');

  const priceMap: Partial<Record<PlanTier, string | undefined>> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  };

  const priceId = priceMap[opts.tier];
  if (!priceId) throw AppError.badRequest(`No Stripe price ID configured for tier: ${opts.tier}`);

  const sub = await getOrCreateSubscription(orgId);
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    'metadata[orgId]': orgId,
    'metadata[tier]': opts.tier,
  });
  if (sub.stripeCustomerId) params.set('customer', sub.stripeCustomerId);

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw AppError.badRequest(err.error?.message ?? 'Stripe checkout failed');
  }

  const session = (await resp.json()) as { id: string; url: string };
  return { sessionId: session.id, url: session.url };
}

// ── Customer Portal ───────────────────────────────────────────────────────────

export async function createPortalSession(orgId: string, returnUrl: string) {
  if (!process.env.STRIPE_SECRET_KEY) throw AppError.badRequest('Stripe not configured');

  const sub = await getOrCreateSubscription(orgId);
  if (!sub.stripeCustomerId)
    throw AppError.badRequest('No Stripe customer associated with this org');

  const resp = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ customer: sub.stripeCustomerId, return_url: returnUrl }).toString(),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw AppError.badRequest(err.error?.message ?? 'Stripe portal failed');
  }

  const session = (await resp.json()) as { url: string };
  return { url: session.url };
}

// ── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelSubscription(orgId: string) {
  if (!process.env.STRIPE_SECRET_KEY) throw AppError.badRequest('Stripe not configured');

  const sub = await getOrCreateSubscription(orgId);
  if (!sub.stripeSubscriptionId) throw AppError.badRequest('No active Stripe subscription');

  const resp = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripeSubscriptionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw AppError.badRequest(err.error?.message ?? 'Stripe cancel failed');
  }

  const [updated] = await db
    .update(billingSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(billingSubscriptions.orgId, orgId))
    .returning();
  return updated!;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export async function handleStripeWebhook(rawBody: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

  // Verify Stripe-Signature header (format: t=ts,v1=sig)
  const ts = signature
    .split(',')
    .find((p) => p.startsWith('t='))
    ?.slice(2);
  const v1 = signature
    .split(',')
    .find((p) => p.startsWith('v1='))
    ?.slice(3);
  if (!ts || !v1) throw new Error('Invalid Stripe-Signature header');

  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`, 'utf8').digest('hex');

  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
    throw new Error('Stripe signature verification failed');
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  await dispatchEvent(event.type, event.data.object);
  return { received: true };
}

async function dispatchEvent(type: string, obj: Record<string, unknown>) {
  if (type === 'checkout.session.completed') {
    const customerId = obj['customer'] as string;
    const metadata = (obj['metadata'] as Record<string, string>) ?? {};
    const orgId = metadata['orgId'];
    if (orgId && customerId) {
      await db
        .update(billingSubscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(billingSubscriptions.orgId, orgId));
      // Mirror onto organizations table — that's the column read by
      // plan-enforcement middleware and superadmin UIs.
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizations.id, orgId));
    }
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.created') {
    const customerId = obj['customer'] as string;
    const metadata = (obj['metadata'] as Record<string, string>) ?? {};
    const tier = (metadata['tier'] ?? 'pro') as PlanTier;

    await db
      .update(billingSubscriptions)
      .set({
        stripeSubscriptionId: obj['id'] as string,
        stripeStatus: obj['status'] as string,
        plan: tier,
        currentPeriodStart: new Date((obj['current_period_start'] as number) * 1000),
        currentPeriodEnd: new Date((obj['current_period_end'] as number) * 1000),
        cancelAtPeriodEnd: (obj['cancel_at_period_end'] as boolean) ?? false,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.stripeCustomerId, customerId));

    // Mirror tier + stripeSubscriptionId to organizations table.
    await db
      .update(organizations)
      .set({ plan: tier, stripeSubscriptionId: obj['id'] as string })
      .where(eq(organizations.stripeCustomerId, customerId));
  }

  if (type === 'customer.subscription.deleted') {
    const customerId = obj['customer'] as string;
    await db
      .update(billingSubscriptions)
      .set({
        stripeSubscriptionId: null,
        stripeStatus: 'canceled',
        plan: 'free',
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.stripeCustomerId, customerId));

    // Downgrade plan on organizations table.
    await db
      .update(organizations)
      .set({ plan: 'free', stripeSubscriptionId: null })
      .where(eq(organizations.stripeCustomerId, customerId));
  }

  // ── E-commerce events (#228) ──────────────────────────────────────────────

  if (type === 'payment_intent.succeeded') {
    await handlePaymentIntentSucceeded(obj);
  }

  if (type === 'charge.succeeded') {
    await handleChargeSucceeded(obj);
  }

  if (type === 'customer.created' || type === 'customer.updated') {
    await handleCustomerUpsert(obj);
  }
}

async function handlePaymentIntentSucceeded(obj: Record<string, unknown>) {
  const metadata = (obj['metadata'] as Record<string, string>) ?? {};
  const orgId = metadata['orgId'];
  const contactEmail = metadata['email'] ?? (obj['receipt_email'] as string | undefined);
  const amountCents = (obj['amount_received'] as number) ?? (obj['amount'] as number) ?? 0;
  if (!orgId || !contactEmail) return;

  await upsertContactWithPurchase(
    orgId,
    contactEmail,
    amountCents / 100,
    'payment_intent',
    obj['id'] as string,
  );
}

async function handleChargeSucceeded(obj: Record<string, unknown>) {
  const metadata = (obj['metadata'] as Record<string, string>) ?? {};
  const orgId = metadata['orgId'];
  const billingDetails = obj['billing_details'] as Record<string, unknown> | undefined;
  const contactEmail = (billingDetails?.['email'] as string | undefined) ?? metadata['email'];
  const amountCents = (obj['amount'] as number) ?? 0;
  if (!orgId || !contactEmail) return;

  await upsertContactWithPurchase(
    orgId,
    contactEmail,
    amountCents / 100,
    'charge',
    obj['id'] as string,
  );
}

async function handleCustomerUpsert(obj: Record<string, unknown>) {
  const metadata = (obj['metadata'] as Record<string, string>) ?? {};
  const orgId = metadata['orgId'];
  const email = obj['email'] as string | undefined;
  if (!orgId || !email) return;

  const name = (obj['name'] as string | undefined) ?? '';
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ') || null;

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, email))
    .limit(1);

  if (!existing) {
    await db
      .insert(contacts)
      .values({
        orgId,
        email,
        firstName: firstName || null,
        lastName,
        source: 'stripe',
      } as typeof contacts.$inferInsert)
      .onConflictDoNothing();
  }
}

async function upsertContactWithPurchase(
  orgId: string,
  email: string,
  amount: number,
  source: string,
  externalId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, email))
    .limit(1);

  let contactId: string;
  if (existing) {
    contactId = existing.id;
  } else {
    const [created] = await db
      .insert(contacts)
      .values({
        orgId,
        email,
        source: 'stripe',
      } as typeof contacts.$inferInsert)
      .returning({ id: contacts.id });
    contactId = created!.id;
  }

  // Fire internal workflow trigger for stripe_purchase event
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
  await fetch(`${apiUrl}/api/v1/internal/workflows/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgId,
      trigger: 'stripe_purchase',
      contactId,
      metadata: { amount, source, externalId },
    }),
  }).catch(() => {
    /* non-critical */
  });
}
