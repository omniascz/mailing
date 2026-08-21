/**
 * Payment processing (#312) — Stripe integration.
 * Creates payment intents for invoices and quotes, handles webhooks.
 */

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { invoices, quotes } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { unsignedWebhooksAllowed } from '../../lib/webhook-switches.js';

/**
 * Verify a Stripe webhook signature against the RAW request body.
 * Implements the same scheme as stripe.webhooks.constructEvent:
 *   header: `t=<unix>,v1=<hmac>,...`
 *   signed payload = `${t}.${rawBody}`
 *   expected = HMAC-SHA256(webhookSecret, signedPayload) hex
 * Constant-time compare + 5-minute replay tolerance.
 */
export function verifyStripeSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  toleranceSec = 300,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, kv) => {
    const [k, v] = kv.split('=');
    if (k && v) acc[k.trim()] ??= v.trim();
    return acc;
  }, {});
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  // Replay protection
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;

  const signedPayload = `${t}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw AppError.badRequest('Stripe not configured (STRIPE_SECRET_KEY missing)');
  return key;
}

type StripeFieldValue = string | number | undefined | Record<string, string | number | undefined>;

async function stripePost(path: string, body: Record<string, StripeFieldValue>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue;
    if (typeof v === 'object') {
      for (const [nk, nv] of Object.entries(v)) {
        if (nv != null) params.append(`${k}[${nk}]`, String(nv));
      }
    } else {
      params.append(k, String(v));
    }
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw AppError.badRequest(
      ((json.error as Record<string, unknown>)?.message as string) ?? 'Stripe error',
    );
  return json;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeKey()}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw AppError.badRequest(
      ((json.error as Record<string, unknown>)?.message as string) ?? 'Stripe error',
    );
  return json;
}

// ── Invoice payment ───────────────────────────────────────────────────────────

export async function createInvoicePaymentIntent(orgId: string, invoiceId: string) {
  const invoice = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .then((r) => r[0]);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === 'paid') throw AppError.badRequest('Invoice is already paid');

  const amountCents = Math.round(parseFloat(String(invoice.amountDue)) * 100);
  const pi = (await stripePost('/payment_intents', {
    amount: amountCents,
    currency: invoice.currency.toLowerCase(),
    metadata: { orgId, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    description: `Invoice ${invoice.invoiceNumber}`,
  })) as { id: string; client_secret: string };

  await db
    .update(invoices)
    .set({ stripePaymentIntentId: pi.id, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
  return {
    paymentIntentId: pi.id,
    clientSecret: pi.client_secret,
    amount: amountCents,
    currency: invoice.currency,
  };
}

// ── Quote payment (pay-to-sign flow) ─────────────────────────────────────────

export async function createQuotePaymentIntent(orgId: string, quoteId: string) {
  const quote = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .then((r) => r[0]);
  if (!quote) throw AppError.notFound('Quote not found');

  const amountCents = Math.round(parseFloat(String(quote.total)) * 100);
  const pi = (await stripePost('/payment_intents', {
    amount: amountCents,
    currency: quote.currency.toLowerCase(),
    metadata: { orgId, quoteId: quote.id, quoteNumber: quote.quoteNumber },
    description: `Quote ${quote.quoteNumber}: ${quote.title}`,
  })) as { id: string; client_secret: string };

  return {
    paymentIntentId: pi.id,
    clientSecret: pi.client_secret,
    amount: amountCents,
    currency: quote.currency,
  };
}

// ── Stripe Customer ───────────────────────────────────────────────────────────

export async function createOrGetStripeCustomer(email: string, name?: string) {
  // Search first
  const search = await stripeGet(`/customers/search?query=email%3A'${encodeURIComponent(email)}'`);
  const existing = (search.data as Array<{ id: string }>)?.[0];
  if (existing) return existing;

  return stripePost('/customers', { email, name });
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  // Verification is mandatory. This used to read `if (webhookSecret) { … }`,
  // so an unset or empty secret skipped the check entirely and a forged
  // payment_intent.succeeded marked an invoice paid. docker-compose.prod.yml
  // passed ${STRIPE_WEBHOOK_SECRET:-}, which substitutes on unset AND on
  // empty, so that was the configured state in production rather than a
  // theoretical one.
  //
  // The dev escape hatch is a separate, explicit flag. It is never inferred
  // from the secret being absent, and it cannot be set in production.
  if (!webhookSecret) {
    if (!unsignedWebhooksAllowed()) {
      throw AppError.unauthorized(
        'Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured.',
      );
    }
  } else if (!verifyStripeSignature(payload, signature, webhookSecret)) {
    throw AppError.unauthorized('Invalid Stripe webhook signature');
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload.toString());
  } catch {
    throw AppError.badRequest('Invalid webhook payload');
  }

  const obj = event.data.object;

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const piId = String(obj.id);
      const meta = obj.metadata as Record<string, string>;

      if (meta.invoiceId) {
        const { markInvoicePaid } = await import('./invoicing.js');
        const amountReceived = ((obj.amount_received as number) ?? 0) / 100;
        const invoice = await db
          .select()
          .from(invoices)
          .where(eq(invoices.stripePaymentIntentId, piId))
          .then((r) => r[0]);
        if (invoice) await markInvoicePaid(invoice.orgId, invoice.id, amountReceived);
      }
      if (meta.quoteId) {
        await db
          .update(quotes)
          .set({ status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
          .where(eq(quotes.id, meta.quoteId));
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const piId = String(obj.id);
      const invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.stripePaymentIntentId, piId))
        .then((r) => r[0]);
      if (invoice) {
        // Fire workflow event
        const { onApiEvent } = await import('../workflows/triggers.js');
        if (invoice.contactId) {
          await onApiEvent(invoice.orgId, invoice.contactId, 'payment_failed', {
            invoiceId: invoice.id,
          });
        }
      }
      break;
    }
  }
}

// ── Retry failed charge (#314 dunning) ────────────────────────────────────────

export async function retryStripeInvoice(orgId: string, invoiceId: string) {
  const invoice = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .then((r) => r[0]);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === 'paid') return { skipped: 'already_paid' };

  // If Stripe hosted invoice exists, use Stripe's native retry
  if (invoice.stripeInvoiceId) {
    try {
      return await stripePost(`/invoices/${invoice.stripeInvoiceId}/pay`, {});
    } catch (err) {
      return { retried: false, error: (err as Error).message };
    }
  }

  // Otherwise create a new PaymentIntent for the outstanding amount
  return createInvoicePaymentIntent(orgId, invoiceId);
}

// ── Refund ────────────────────────────────────────────────────────────────────

export async function refundInvoicePayment(orgId: string, invoiceId: string, amountCents?: number) {
  const invoice = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .then((r) => r[0]);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (!invoice.stripePaymentIntentId)
    throw AppError.badRequest('No Stripe payment found for this invoice');

  const refundBody: Record<string, string | number | undefined> = {
    payment_intent: invoice.stripePaymentIntentId,
  };
  if (amountCents) refundBody.amount = amountCents;

  const refund = await stripePost('/refunds', refundBody);
  return refund;
}
