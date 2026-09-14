/**
 * Phone numbers management routes (#250)
 *
 *  GET    /api/v1/phone/numbers            — list org numbers
 *  POST   /api/v1/phone/numbers/search     — search available numbers to provision
 *  POST   /api/v1/phone/numbers            — provision (buy) a number
 *  PATCH  /api/v1/phone/numbers/:id        — update label / assignment / routing
 *  DELETE /api/v1/phone/numbers/:id        — release number
 *
 *  GET    /api/v1/phone/port-requests      — list port requests
 *  POST   /api/v1/phone/port-requests      — submit a port request
 *  PATCH  /api/v1/phone/port-requests/:id  — update port request
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { phoneNumbers, phoneNumberPortRequests } from '../../../db/schema/phone-numbers.js';
import { AppError } from '../../../lib/app-error.js';
import { env } from '../../../config/env.js';

const phoneNumberRoutes: FastifyPluginAsync = async (app) => {
  // ── List numbers ──────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/phone/numbers',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const numbers = await db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.orgId, req.user!.orgId), eq(phoneNumbers.status, 'active')));
      return reply.send({ data: numbers });
    },
  );

  // ── Search available numbers (via Twilio/Telnyx) ───────────────────────────

  app.post(
    '/api/v1/phone/numbers/search',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          countryCode: z.string().length(2).default('US'),
          areaCode: z.string().max(10).optional(),
          contains: z.string().max(10).optional(),
          capabilities: z.array(z.enum(['voice', 'sms', 'fax'])).optional(),
          limit: z.number().int().min(1).max(20).default(10),
          provider: z.enum(['twilio', 'telnyx']).default('twilio'),
        })
        .parse(req.body ?? {});

      const results = await searchAvailableNumbers(body);
      return reply.send({ data: results });
    },
  );

  // ── Provision a number ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/phone/numbers',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          number: z.string().min(5).max(32),
          provider: z.enum(['twilio', 'telnyx']).default('twilio'),
          label: z.string().max(255).optional(),
          assignedUserId: z.string().uuid().optional(),
          routingTargetType: z.enum(['ivr', 'hunt-group', 'voicemail', 'user']).optional(),
          routingTargetId: z.string().uuid().optional(),
          recordCalls: z.boolean().optional(),
        })
        .parse(req.body);

      const { providerSid, monthlyRateUsd } = await provisionNumberWithProvider(
        body.provider,
        body.number,
      );

      const [row] = await db
        .insert(phoneNumbers)
        .values({
          orgId: req.user!.orgId,
          number: body.number,
          provider: body.provider,
          providerSid,
          label: body.label,
          assignedUserId: body.assignedUserId ?? null,
          routingTargetType: body.routingTargetType ?? null,
          routingTargetId: body.routingTargetId ?? null,
          recordCalls: body.recordCalls ?? false,
          monthlyRateUsd,
          provisionedAt: new Date(),
        })
        .returning();

      return reply.code(201).send({ data: row });
    },
  );

  // ── Update number ─────────────────────────────────────────────────────────────

  app.patch(
    '/api/v1/phone/numbers/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          label: z.string().max(255).optional(),
          assignedUserId: z.string().uuid().nullable().optional(),
          routingTargetType: z.string().max(32).nullable().optional(),
          routingTargetId: z.string().uuid().nullable().optional(),
          recordCalls: z.boolean().optional(),
        })
        .parse(req.body);

      const [row] = await db
        .update(phoneNumbers)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(phoneNumbers.id, id), eq(phoneNumbers.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('Phone number');
      return reply.send({ data: row });
    },
  );

  // ── Release number ────────────────────────────────────────────────────────────

  app.delete(
    '/api/v1/phone/numbers/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [num] = await db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.id, id), eq(phoneNumbers.orgId, req.user!.orgId)))
        .limit(1);
      if (!num) throw AppError.notFound('Phone number');

      // Provider first, row second, and the row only if the provider agreed.
      // The other order is what shipped: the number stayed on the Twilio
      // account, billed, while this table said it was gone — and a row that
      // says `released` drops out of the listing above, so the only place the
      // charge was visible was the Twilio invoice. A number left `active` after
      // a failed release is the lesser wrong: it is true (we still hold it),
      // the operator can see it, and the delete can be retried.
      await releaseNumberWithProvider(num.provider, num.providerSid);
      await db
        .update(phoneNumbers)
        .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(phoneNumbers.id, id));

      return reply.send({ data: { released: true } });
    },
  );

  // ── Port requests ─────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/phone/port-requests',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const rows = await db
        .select()
        .from(phoneNumberPortRequests)
        .where(eq(phoneNumberPortRequests.orgId, req.user!.orgId));
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/api/v1/phone/port-requests',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          numbers: z.array(z.string().min(5).max(32)).min(1),
          losingCarrier: z.string().max(255).optional(),
          accountNumber: z.string().max(255).optional(),
          targetDate: z.string().datetime().optional(),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);

      const [row] = await db
        .insert(phoneNumberPortRequests)
        .values({
          orgId: req.user!.orgId,
          numbers: body.numbers,
          losingCarrier: body.losingCarrier ?? null,
          accountNumber: body.accountNumber ?? null,
          targetDate: body.targetDate ? new Date(body.targetDate) : null,
          notes: body.notes ?? null,
        })
        .returning();

      return reply.code(201).send({ data: row });
    },
  );

  app.patch(
    '/api/v1/phone/port-requests/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['Phone Numbers'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          status: z.enum(['pending', 'submitted', 'approved', 'rejected', 'completed']).optional(),
          notes: z.string().max(2000).optional(),
          targetDate: z.string().datetime().optional(),
        })
        .parse(req.body);

      const [row] = await db
        .update(phoneNumberPortRequests)
        .set({
          ...body,
          targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(phoneNumberPortRequests.id, id),
            eq(phoneNumberPortRequests.orgId, req.user!.orgId),
          ),
        )
        .returning();
      if (!row) throw AppError.notFound('Port request');
      return reply.send({ data: row });
    },
  );
};

// ─── Provider helpers (thin stubs calling Twilio / Telnyx REST APIs) ──────────

async function searchAvailableNumbers(opts: {
  provider: string;
  countryCode: string;
  areaCode?: string;
  contains?: string;
  capabilities?: string[];
  limit: number;
}): Promise<Array<{ number: string; monthlyRate: string; capabilities: string[] }>> {
  if (opts.provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return [];

    const params = new URLSearchParams({ VoiceEnabled: 'true', Limit: String(opts.limit) });
    if (opts.areaCode) params.set('AreaCode', opts.areaCode);
    if (opts.contains) params.set('Contains', opts.contains);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/${opts.countryCode}/Local.json?${params}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` } },
    ).catch(() => null);

    if (!res?.ok) return [];
    const data = (await res.json()) as {
      available_phone_numbers?: Array<{ phone_number: string; monthly_rental_rate?: string }>;
    };
    return (data.available_phone_numbers ?? []).map((n) => ({
      number: n.phone_number,
      monthlyRate: n.monthly_rental_rate ?? '1.00',
      capabilities: ['voice', 'sms'],
    }));
  }
  return [];
}

/** Seam so the tests can buy a number without asking Twilio for one. */
export interface ProvisionDeps {
  fetchImpl?: typeof fetch;
}

/**
 * The URL Twilio must call when this number receives an SMS.
 *
 * It has to match, byte for byte, the URL #184 rebuilds to verify the
 * signature: `API_PUBLIC_URL` + the route path. Twilio signs the URL it was
 * configured with, so a number registered against a different host, scheme or
 * port produces a signature we compute differently and refuse — the number goes
 * quiet and the log says INVALID_SIGNATURE. One expression, used by both sides,
 * is the only way those two stay equal.
 */
function smsWebhookUrl(): string | null {
  const base = (env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/api/v1/sms/webhooks/twilio/inbound` : null;
}

export async function provisionNumberWithProvider(
  provider: string,
  number: string,
  deps: ProvisionDeps = {},
): Promise<{ providerSid: string | null; monthlyRateUsd: string | null }> {
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return { providerSid: null, monthlyRateUsd: null };

    // Refused before the purchase, not after: buying a number we cannot point
    // at ourselves leaves a number that costs money every month and receives
    // nothing, and the customer has no way to tell.
    const smsUrl = smsWebhookUrl();
    if (!smsUrl) {
      throw AppError.badRequest(
        'API_PUBLIC_URL is not set, so the inbound SMS webhook cannot be configured on the ' +
          'number. Set it to the public base of this API — the same origin the Twilio ' +
          'signature is verified against — and buy the number again.',
      );
    }

    // SmsUrl is what makes the number receive: without it Twilio has nowhere to
    // deliver an inbound message and answers the sender with its default. Every
    // number bought before this line was bought without it.
    //
    // Only the SMS webhook is set here. The number-level StatusCallback is
    // documented on the IncomingPhoneNumber resource beside the voice
    // properties, not as an SMS delivery callback, and SMS delivery receipts
    // already come from the per-message StatusCallback the adapter sets
    // (channels/sms/twilio-adapter.ts:126-131). Pointing a voice status
    // callback at a handler that reads MessageSid/MessageStatus would be worse
    // than leaving it unset.
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          PhoneNumber: number,
          SmsUrl: smsUrl,
          SmsMethod: 'POST',
        }),
      },
    ).catch(() => null);

    // Was `return { providerSid: null, monthlyRateUsd: null }`, and the caller
    // then wrote the row anyway — a number in phone_numbers that Twilio never
    // sold us, indistinguishable from one it did. A failure here has to reach
    // the caller, so that no row is written and the operator sees why.
    if (!res?.ok) {
      throw AppError.badRequest(
        `Twilio refused to provision ${number}` +
          (res ? ` (HTTP ${res.status})` : ' (the request did not complete)') +
          '. The number was not saved.',
      );
    }
    const data = (await res.json()) as { sid?: string };
    return { providerSid: data.sid ?? null, monthlyRateUsd: '1.00' };
  }
  return { providerSid: null, monthlyRateUsd: null };
}

/**
 * Gives the number back to the provider. Throws if it did not happen.
 *
 * It used to swallow everything: `.catch(() => {})` around the request and no
 * look at `res.ok`, so a 401, a 404 or a network outage were indistinguishable
 * from success — and the caller marked the row `released` regardless. The
 * number stayed on the account, Twilio kept charging the monthly fee, and it
 * disappeared from the listing (which filters status = 'active'), so nobody
 * could see what they were paying for.
 *
 * Deleting really is the way to stop the charge:
 * <https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource>
 * — DELETE on `/IncomingPhoneNumbers/{Sid}.json` releases the number from the
 * account and Twilio stops charging the monthly fee for it. Which makes a
 * failure here expensive rather than cosmetic.
 *
 * `!providerSid` stays a no-op on purpose: that is a row the operator brought
 * themselves, never bought through us, so there is nothing at the provider to
 * give back and the release is pure bookkeeping. Missing credentials with a
 * providerSid present is the opposite — we did buy it and now cannot return it.
 */
async function releaseNumberWithProvider(
  provider: string,
  providerSid: string | null,
  deps: ProvisionDeps = {},
): Promise<void> {
  if (!providerSid) return;
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw AppError.badRequest(
        `${providerSid} was provisioned through Twilio, but no Twilio credentials are ` +
          'configured, so it cannot be released. The number is still on the account and still ' +
          'billed; it has been left active rather than marked returned.',
      );
    }
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${providerSid}.json`,
      {
        method: 'DELETE',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
      },
    ).catch(() => null);

    if (!res?.ok) {
      throw AppError.badRequest(
        `Twilio did not release ${providerSid}` +
          (res ? ` (HTTP ${res.status})` : ' (the request did not complete)') +
          '. The number is still on the account and still billed, so it has been left active.',
      );
    }
  }
}

export default phoneNumberRoutes;
