/**
 * SMS provider routing engine (task 7.3).
 *
 * Selects the appropriate SMS provider for a given phone number based on:
 *   1. Country code extracted from E.164 phone number
 *   2. org-level route configuration in sms_routes
 *   3. Priority order (lower number = higher priority)
 *   4. Active flag
 *
 * Failover: if the primary provider fails, the routing engine retries
 * with the next-priority provider for the same country.
 *
 * Cost tracking: every send is logged in sms_send_log.
 */

import { eq, and, asc, sql } from 'drizzle-orm';
import { emitWebhookEvent } from '../webhooks/emit.js';
import { db } from '../../db/client.js';
import { smsRoutes, smsSendLog } from '../../db/schema/sms.js';
import {
  BulkgateSmsAdapter,
  type BulkgateAdapterConfig,
} from '../../channels/sms/bulkgate-adapter.js';
import { TwilioSmsAdapter, type TwilioConfig } from '../../channels/sms/twilio-adapter.js';
import { checkSmsCompliance } from './compliance.js';
import { resolveCouponMergeTags } from './coupon-merge.js';
import { AppError } from '../../lib/app-error.js';
import type { UnifiedMessage, Recipient, DeliveryResult } from '@forgemsg/shared';

// ─── Phone → country code ─────────────────────────────────────────────────────

/** Map of E.164 prefix (up to 4 digits) → ISO 3166-1 alpha-2 */
const PREFIX_COUNTRY: [string, string][] = [
  // Length 4 first to match most-specific prefix
  ['1204', 'CA'],
  ['1226', 'CA'],
  ['1250', 'CA'],
  ['1289', 'CA'],
  ['1306', 'CA'],
  ['1403', 'CA'],
  ['1416', 'CA'],
  ['1418', 'CA'],
  ['1431', 'CA'],
  ['1437', 'CA'],
  ['1438', 'CA'],
  ['1450', 'CA'],
  ['1506', 'CA'],
  ['1514', 'CA'],
  ['1519', 'CA'],
  ['1604', 'CA'],
  ['1613', 'CA'],
  ['1647', 'CA'],
  ['1705', 'CA'],
  ['1709', 'CA'],
  ['1778', 'CA'],
  ['1780', 'CA'],
  ['1807', 'CA'],
  ['1819', 'CA'],
  ['1825', 'CA'],
  ['1902', 'CA'],
  ['1905', 'CA'],
  // Length 2
  ['20', 'EG'],
  ['27', 'ZA'],
  ['30', 'GR'],
  ['31', 'NL'],
  ['32', 'BE'],
  ['33', 'FR'],
  ['34', 'ES'],
  ['36', 'HU'],
  ['39', 'IT'],
  ['40', 'RO'],
  ['41', 'CH'],
  ['43', 'AT'],
  ['44', 'GB'],
  ['45', 'DK'],
  ['46', 'SE'],
  ['47', 'NO'],
  ['48', 'PL'],
  ['49', 'DE'],
  ['51', 'PE'],
  ['52', 'MX'],
  ['54', 'AR'],
  ['55', 'BR'],
  ['56', 'CL'],
  ['57', 'CO'],
  ['58', 'VE'],
  ['60', 'MY'],
  ['61', 'AU'],
  ['62', 'ID'],
  ['63', 'PH'],
  ['64', 'NZ'],
  ['65', 'SG'],
  ['66', 'TH'],
  ['7', 'RU'],
  ['81', 'JP'],
  ['82', 'KR'],
  ['84', 'VN'],
  ['86', 'CN'],
  ['90', 'TR'],
  ['91', 'IN'],
  ['92', 'PK'],
  ['93', 'AF'],
  ['94', 'LK'],
  ['95', 'MM'],
  ['98', 'IR'],
  // Length 3
  ['380', 'UA'],
  ['381', 'RS'],
  ['385', 'HR'],
  ['386', 'SI'],
  ['420', 'CZ'],
  ['421', 'SK'],
  ['370', 'LT'],
  ['371', 'LV'],
  ['372', 'EE'],
  ['351', 'PT'],
  ['353', 'IE'],
  ['358', 'FI'],
  ['359', 'BG'],
  ['357', 'CY'],
  ['352', 'LU'],
  // US/Canada catch-all
  ['1', 'US'],
];

export function phoneToCountry(e164: string): string {
  const digits = e164.replace(/^\+/, '');

  for (const [prefix, country] of PREFIX_COUNTRY) {
    if (digits.startsWith(prefix)) return country;
  }

  return 'XX'; // unknown
}

// ─── Adapter factory ──────────────────────────────────────────────────────────

function buildAdapter(provider: string, config: Record<string, unknown>) {
  switch (provider) {
    case 'bulkgate':
      return new BulkgateSmsAdapter(config as unknown as BulkgateAdapterConfig);
    case 'twilio':
      return new TwilioSmsAdapter(config as unknown as TwilioConfig);
    default:
      throw AppError.badRequest(`Unknown SMS provider: ${provider}`);
  }
}

// ─── Route CRUD ───────────────────────────────────────────────────────────────

export async function listSmsRoutes(orgId: string) {
  return db
    .select()
    .from(smsRoutes)
    .where(eq(smsRoutes.orgId, orgId))
    .orderBy(asc(smsRoutes.countryCode), asc(smsRoutes.priority));
}

export async function createSmsRoute(
  orgId: string,
  data: {
    countryCode: string;
    provider: string;
    priority?: number;
    active?: boolean;
    costPerSms?: string;
    config: Record<string, unknown>;
  },
) {
  const [route] = await db
    .insert(smsRoutes)
    .values({ orgId, ...data })
    .returning();
  return route;
}

export async function updateSmsRoute(
  id: string,
  orgId: string,
  data: Partial<{
    priority: number;
    active: boolean;
    costPerSms: string;
    config: Record<string, unknown>;
  }>,
) {
  const [route] = await db
    .update(smsRoutes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(smsRoutes.id, id), eq(smsRoutes.orgId, orgId)))
    .returning();

  if (!route) throw AppError.notFound('SmsRoute');
  return route;
}

export async function deleteSmsRoute(id: string, orgId: string) {
  const result = await db
    .delete(smsRoutes)
    .where(and(eq(smsRoutes.id, id), eq(smsRoutes.orgId, orgId)));

  return result;
}

// ─── Routing + send with failover ─────────────────────────────────────────────

export async function routedSmsSend(
  orgId: string,
  message: UnifiedMessage,
  recipient: Recipient,
): Promise<DeliveryResult> {
  const phone = recipient.phone ?? '';
  const country = phoneToCountry(phone);

  // Resolve unique-coupon merge tags ({{coupon_code:batchId}}) for this
  // recipient. Runs BEFORE the compliance gate so opt-out text is appended
  // to the final coupon-substituted body (and length checks see real codes).
  // No-op (returns the same string, no DB hit) when the body has no tags.
  if (message.content.kind === 'sms' && recipient.contactId) {
    const withCoupons = await resolveCouponMergeTags(
      message.content.body,
      orgId,
      recipient.contactId,
    );
    if (withCoupons !== message.content.body) {
      message = { ...message, content: { ...message.content, body: withCoupons } };
    }
  }

  // Compliance gate for MARKETING SMS: consent, TCPA quiet hours (US), and
  // opt-out text appended. Transactional SMS (OTP/receipts — no campaign/workflow)
  // is exempt from consent + quiet hours. Throws AppError on block.
  // (Previously this lived in a helper that the send path never called.)
  const isMarketing = !!(message.campaignId || message.workflowId);
  if (message.content.kind === 'sms' && isMarketing) {
    const compliance = await checkSmsCompliance(orgId, phone, message.content.body, country, {
      requireConsent: true,
    });
    message = { ...message, content: { ...message.content, body: compliance.body } };
  }

  // Fetch routes: exact country match + catch-all '*', ordered by priority
  const routes = await db
    .select()
    .from(smsRoutes)
    .where(
      and(
        eq(smsRoutes.orgId, orgId),
        eq(smsRoutes.active, true),
        sql`(${smsRoutes.countryCode} = ${country} OR ${smsRoutes.countryCode} = '*')`,
      ),
    )
    .orderBy(
      // Exact match before wildcard
      sql`CASE WHEN ${smsRoutes.countryCode} = ${country} THEN 0 ELSE 1 END`,
      asc(smsRoutes.priority),
    );

  if (routes.length === 0) {
    throw AppError.badRequest(`No active SMS route for country ${country}`);
  }

  let lastError: Error | undefined;

  for (const route of routes) {
    const adapter = buildAdapter(route.provider, route.config as Record<string, unknown>);
    const logId = crypto.randomUUID();

    // Pre-insert send log row
    await db.insert(smsSendLog).values({
      id: logId,
      orgId,
      contactId: recipient.contactId,
      phone,
      provider: route.provider,
      status: 'queued',
      campaignId: message.campaignId,
      workflowId: message.workflowId,
    });

    try {
      const result = await adapter.send(message, recipient);

      await db
        .update(smsSendLog)
        .set({
          status: result.status,
          providerMessageId: result.messageId,
          costEur: result.cost != null ? String(result.cost) : null,
          sentAt: new Date(),
        })
        .where(eq(smsSendLog.id, logId));

      return result;
    } catch (err) {
      lastError = err as Error;

      await db
        .update(smsSendLog)
        .set({
          status: 'failed',
          errorCode: (err as { code?: string }).code ?? 'UNKNOWN',
          errorMessage: (err as Error).message,
        })
        .where(eq(smsSendLog.id, logId));

      // Only retry on retriable errors
      const retryable = (err as { retryable?: boolean }).retryable ?? true;
      if (!retryable) break;
    }
  }

  throw AppError.internal(`SMS send failed for ${phone}: ${lastError?.message}`);
}

// ─── Update delivery status from DLR webhook ─────────────────────────────────

export async function updateSmsDeliveryStatus(
  providerMessageId: string,
  status: string,
  deliveredAt?: Date,
  reason?: string,
) {
  const [row] = await db
    .update(smsSendLog)
    .set({
      status,
      ...(deliveredAt && { deliveredAt }),
    })
    .where(eq(smsSendLog.providerMessageId, providerMessageId))
    .returning();

  // Both provider webhooks (Bulkgate DLR, Twilio status callback) normalise
  // their vocabulary to 'delivered' / 'failed' before calling this, so this is
  // the one place both terminal outcomes are known. Intermediate states
  // ('queued', 'sent') are not events — the contract has no name for them.
  if (!row) return;
  if (status === 'delivered') {
    emitWebhookEvent(row.orgId, 'sms.delivered', {
      providerMessageId,
      provider: row.provider ?? null,
      to: row.phone ?? null,
      contactId: row.contactId ?? null,
      campaignId: row.campaignId ?? null,
    });
  } else if (status === 'failed') {
    emitWebhookEvent(row.orgId, 'sms.failed', {
      providerMessageId,
      provider: row.provider ?? null,
      to: row.phone ?? null,
      contactId: row.contactId ?? null,
      campaignId: row.campaignId ?? null,
      reason: reason ?? row.errorMessage ?? null,
    });
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getSmsSendStats(orgId: string) {
  const rows = await db
    .select({
      status: smsSendLog.status,
      count: sql<number>`cast(count(*) as int)`,
      totalCost: sql<number>`cast(coalesce(sum(${smsSendLog.costEur}), 0) as float)`,
    })
    .from(smsSendLog)
    .where(eq(smsSendLog.orgId, orgId))
    .groupBy(smsSendLog.status);

  return rows;
}
