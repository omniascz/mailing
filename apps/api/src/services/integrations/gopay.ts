/**
 * GoPay payment gateway integration.
 * REST API: https://doc.gopay.com/
 * OAuth2: client_credentials flow
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { czPaymentTransactions } from '../../db/schema/payment-gateways-cz.js';

const GOPAY_BASE = 'https://gw.gopay.cz/api';
const GOPAY_TEST_BASE = 'https://gw.sandbox.gopay.com/api';

export interface GopaySettings {
  clientId: string;
  clientSecret: string;
  goId: string;
  testMode?: boolean;
}

interface GopayToken {
  access_token: string;
  expires_in: number;
}

async function getToken(settings: GopaySettings): Promise<string> {
  const base = settings.testMode ? GOPAY_TEST_BASE : GOPAY_BASE;
  const creds = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
  const res = await fetch(`${base}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=payment-create',
  });
  if (!res.ok) throw new Error(`GoPay auth error ${res.status}`);
  const data = (await res.json()) as GopayToken;
  return data.access_token;
}

export interface GopayCreateInput {
  orgId: string;
  contactId?: string;
  amount: number; // in CZK haléře (100 CZK = 10000)
  currency?: string;
  description: string;
  returnUrl: string;
  notifyUrl: string;
  email?: string;
  phone?: string;
}

export async function createGoPayPayment(
  settings: GopaySettings,
  input: GopayCreateInput,
): Promise<{ paymentId: string; gwUrl: string }> {
  const base = settings.testMode ? GOPAY_TEST_BASE : GOPAY_BASE;
  const token = await getToken(settings);

  const body = {
    payer: {
      contact: {
        email: input.email,
        phone_number: input.phone,
      },
    },
    amount: input.amount,
    currency: input.currency ?? 'CZK',
    order_number: crypto.randomUUID().slice(0, 16),
    order_description: input.description,
    callback: {
      return_url: input.returnUrl,
      notification_url: input.notifyUrl,
    },
    target: { type: 'ACCOUNT', goid: settings.goId },
    lang: 'CS',
  };

  const res = await fetch(`${base}/payments/payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GoPay create error ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { id: number; gw_url: string };

  await db.insert(czPaymentTransactions).values({
    orgId: input.orgId,
    contactId: input.contactId ?? null,
    gateway: 'gopay',
    gatewayId: String(data.id),
    amount: String(input.amount),
    currency: input.currency ?? 'CZK',
    status: 'pending',
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    description: input.description,
    rawData: data as Record<string, unknown>,
  });

  return { paymentId: String(data.id), gwUrl: data.gw_url };
}

export async function verifyGoPayPayment(
  settings: GopaySettings,
  orgId: string,
  paymentId: string,
): Promise<{ status: string; paid: boolean }> {
  const base = settings.testMode ? GOPAY_TEST_BASE : GOPAY_BASE;
  const token = await getToken(settings);
  const res = await fetch(`${base}/payments/payment/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GoPay status error ${res.status}`);
  const data = (await res.json()) as { state: string };
  const paid = data.state === 'PAID';

  await db
    .update(czPaymentTransactions)
    .set({
      status: paid ? 'paid' : data.state.toLowerCase(),
      paidAt: paid ? new Date() : undefined,
      rawData: data as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(
      and(eq(czPaymentTransactions.gatewayId, paymentId), eq(czPaymentTransactions.orgId, orgId)),
    );

  return { status: data.state, paid };
}
