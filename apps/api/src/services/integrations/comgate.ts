/**
 * Comgate payment gateway integration.
 * REST API: https://apidoc.comgate.cz/
 * Simple form-encoded POST requests.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { czPaymentTransactions } from '../../db/schema/payment-gateways-cz.js';

const COMGATE_BASE = 'https://payments.comgate.cz/v1.0';

export interface ComgateSettings {
  merchant: string;
  secret: string;
  testMode?: boolean;
}

export interface ComgateCreateInput {
  orgId: string;
  contactId?: string;
  price: number; // in CZK haléře
  currency?: string;
  label: string;
  refId: string;
  email: string;
  returnUrl: string;
  notifyUrl: string;
  method?: string; // ALL | CARD_CZ_CSOB_2 | etc.
  country?: string;
}

async function comgatePost(
  endpoint: string,
  params: Record<string, string>,
): Promise<Record<string, string>> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${COMGATE_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  const result: Record<string, string> = {};
  for (const pair of text.split('&')) {
    const [k, v] = pair.split('=');
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return result;
}

export async function createComgatePayment(
  settings: ComgateSettings,
  input: ComgateCreateInput,
): Promise<{ transId: string; redirect: string }> {
  const params: Record<string, string> = {
    merchant: settings.merchant,
    test: settings.testMode ? 'true' : 'false',
    price: String(input.price),
    curr: input.currency ?? 'CZK',
    label: input.label.slice(0, 16),
    refId: input.refId,
    email: input.email,
    method: input.method ?? 'ALL',
    country: input.country ?? 'CZ',
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    secret: settings.secret,
    prepareOnly: 'true',
    lang: 'cs',
  };

  const result = await comgatePost('/create', params);
  if (result['code'] !== '0') throw new Error(`Comgate create error: ${result['message']}`);

  const transId = result['transId'] ?? '';
  const redirect = result['redirect'] ?? '';

  await db.insert(czPaymentTransactions).values({
    orgId: input.orgId,
    contactId: input.contactId ?? null,
    gateway: 'comgate',
    gatewayId: transId,
    amount: String(input.price),
    currency: input.currency ?? 'CZK',
    status: 'pending',
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    description: input.label,
    rawData: result as Record<string, unknown>,
  });

  return { transId, redirect };
}

export async function verifyComgatePayment(
  settings: ComgateSettings,
  orgId: string,
  transId: string,
): Promise<{ status: string; paid: boolean }> {
  const result = await comgatePost('/status', {
    merchant: settings.merchant,
    secret: settings.secret,
    transId,
  });
  if (result['code'] !== '0') throw new Error(`Comgate status error: ${result['message']}`);

  const status = result['status'] ?? 'UNKNOWN'; // PAID | PENDING | CANCELLED
  const paid = status === 'PAID';

  await db
    .update(czPaymentTransactions)
    .set({
      status: paid ? 'paid' : status.toLowerCase(),
      paidAt: paid ? new Date() : undefined,
      rawData: result as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(
      and(eq(czPaymentTransactions.gatewayId, transId), eq(czPaymentTransactions.orgId, orgId)),
    );

  return { status, paid };
}
