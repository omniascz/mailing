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

async function provisionNumberWithProvider(
  provider: string,
  number: string,
): Promise<{ providerSid: string | null; monthlyRateUsd: string | null }> {
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return { providerSid: null, monthlyRateUsd: null };

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ PhoneNumber: number }),
      },
    ).catch(() => null);

    if (!res?.ok) return { providerSid: null, monthlyRateUsd: null };
    const data = (await res.json()) as { sid?: string };
    return { providerSid: data.sid ?? null, monthlyRateUsd: '1.00' };
  }
  return { providerSid: null, monthlyRateUsd: null };
}

async function releaseNumberWithProvider(
  provider: string,
  providerSid: string | null,
): Promise<void> {
  if (!providerSid) return;
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return;
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${providerSid}.json`,
      {
        method: 'DELETE',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
      },
    ).catch(() => {});
  }
}

export default phoneNumberRoutes;
