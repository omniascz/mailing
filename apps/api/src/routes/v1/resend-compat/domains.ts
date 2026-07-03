/**
 * Resend-compatible Domains API.
 *
 * Mirrors Resend's domain endpoints. Mounted under `/api/v1/domains/resend`
 * to keep the existing camelCase domains routes untouched.
 *
 *   GET    /api/v1/domains/resend           list
 *   POST   /api/v1/domains/resend           create
 *   GET    /api/v1/domains/resend/:id       retrieve (with dns_records array)
 *   PATCH  /api/v1/domains/resend/:id       update (open_tracking / click_tracking)
 *   DELETE /api/v1/domains/resend/:id       remove
 *   POST   /api/v1/domains/resend/:id/verify  trigger verify
 *
 * Resend's response includes a `records` array with `record`, `name`,
 * `value`, `type`, `ttl`, `priority`, `status` fields. We map our
 * `buildDnsRecords()` output to that shape so the Resend SDK's DNS
 * helpers + Vercel marketplace integration render correctly.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { sendingDomains } from '../../../db/schema/index.js';
import { AppError } from '../../../lib/app-error.js';
import {
  buildDnsRecords,
  verifyDnsRecords,
} from '../../../services/domains/dns-records.js';
import {
  generateDkimKeyPair,
  verifyDkimDns,
} from '../../../services/domains/dkim.js';

const DMARC_REPORT_EMAIL = process.env.DMARC_REPORT_EMAIL ?? 'dmarc@forgemsg.com';

type DnsType = 'TXT' | 'CNAME' | 'MX';

interface ResendDnsRecord {
  record: 'SPF' | 'DKIM' | 'DMARC' | 'MX' | string;
  name: string;
  value: string;
  type: DnsType;
  ttl: 'Auto' | number;
  priority?: number;
  status: 'pending' | 'verified' | 'failed';
}

function statusFromVerified(verified: boolean | null | undefined): ResendDnsRecord['status'] {
  if (verified === true) return 'verified';
  if (verified === false) return 'pending';
  return 'pending';
}

function recordLabel(purpose: string): ResendDnsRecord['record'] {
  if (purpose.startsWith('SPF')) return 'SPF';
  if (purpose.startsWith('DKIM')) return 'DKIM';
  if (purpose.startsWith('DMARC')) return 'DMARC';
  if (purpose.startsWith('Return-Path')) return 'MX';
  return purpose;
}

function domainShape(d: typeof sendingDomains.$inferSelect, records: ResendDnsRecord[]) {
  return {
    object: 'domain' as const,
    id: d.id,
    name: d.domain,
    status: d.isVerified ? 'verified' : 'pending',
    region: 'eu-fra-1',
    open_tracking: d.openTracking,
    click_tracking: d.clickTracking,
    created_at: d.createdAt.toISOString(),
    records,
  };
}

function rowToRecords(d: typeof sendingDomains.$inferSelect): ResendDnsRecord[] {
  if (!d.dkimPublicKey) return [];
  const recs = buildDnsRecords({
    domain: d.domain,
    mailSubdomain: d.mailSubdomain ?? `mail.${d.domain}`,
    dkimSelector: d.dkimSelector,
    dkimPublicKey: d.dkimPublicKey,
    dmarcEmail: DMARC_REPORT_EMAIL,
  });

  return recs.map((r): ResendDnsRecord => {
    let status: ResendDnsRecord['status'] = 'pending';
    if (r.purpose.startsWith('SPF')) status = statusFromVerified(d.spfVerified);
    else if (r.purpose.startsWith('DKIM')) status = statusFromVerified(d.dkimVerified);
    else if (r.purpose.startsWith('DMARC')) status = statusFromVerified(d.dmarcVerified);
    else if (r.purpose.startsWith('Return-Path'))
      status = statusFromVerified(d.returnPathVerified);

    return {
      record: recordLabel(r.purpose),
      name: r.hostname,
      value: r.value,
      type: r.type,
      ttl: 'Auto',
      status,
    };
  });
}

const domainsResendRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/domains/resend',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'List domains (Resend shape)' },
    },
    async (req, reply) => {
      const rows = await db
        .select()
        .from(sendingDomains)
        .where(eq(sendingDomains.orgId, req.user!.orgId))
        .orderBy(desc(sendingDomains.createdAt));
      return reply.send({
        data: rows.map((r) => domainShape(r, rowToRecords(r))),
      });
    },
  );

  app.post(
    '/api/v1/domains/resend',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Add domain' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z
            .string()
            .min(4)
            .max(253)
            .regex(/^[a-z0-9.-]+$/i, 'Invalid domain'),
          region: z.string().max(64).optional(), // accepted but mapped to eu-fra-1
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply
          .code(422)
          .send({ statusCode: 422, name: 'validation_error', message: body.error.message });
      }

      const sub = `mail.${body.data.name}`;
      const keyPair = await generateDkimKeyPair();

      const [row] = await db
        .insert(sendingDomains)
        .values({
          orgId: req.user!.orgId,
          domain: body.data.name,
          mailSubdomain: sub,
          dkimSelector: 'fm1',
          dkimPrivateKey: keyPair.privateKeyPem,
          dkimPublicKey: keyPair.publicKeyBase64,
        })
        .returning()
        .catch((err: Error) => {
          if (err.message.includes('sending_domains_org_domain_idx')) {
            throw AppError.conflict(
              `Domain "${body.data.name}" already registered for this org`,
            );
          }
          throw err;
        });

      return reply.code(200).send(domainShape(row!, rowToRecords(row!)));
    },
  );

  app.get(
    '/api/v1/domains/resend/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Retrieve a domain' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [row] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!row)
        return reply
          .code(404)
          .send({ statusCode: 404, name: 'not_found', message: `Domain ${id} not found` });
      return reply.send(domainShape(row, rowToRecords(row)));
    },
  );

  app.patch(
    '/api/v1/domains/resend/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Update a domain' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          open_tracking: z.boolean().optional(),
          click_tracking: z.boolean().optional(),
        })
        .parse(req.body);
      // Persist the per-domain tracking toggles; honored on the campaign send
      // path (pixel/link injection is gated on these).
      const patch: Record<string, unknown> = {};
      if (body.open_tracking !== undefined) patch.openTracking = body.open_tracking;
      if (body.click_tracking !== undefined) patch.clickTracking = body.click_tracking;

      const [row] = Object.keys(patch).length
        ? await db
            .update(sendingDomains)
            .set(patch)
            .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
            .returning()
        : await db
            .select()
            .from(sendingDomains)
            .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
            .limit(1);
      if (!row)
        return reply
          .code(404)
          .send({ statusCode: 404, name: 'not_found', message: `Domain ${id} not found` });
      return reply.send(domainShape(row, rowToRecords(row)));
    },
  );

  app.delete(
    '/api/v1/domains/resend/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Delete a domain' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [row] = await db
        .delete(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .returning();
      if (!row)
        return reply
          .code(404)
          .send({ statusCode: 404, name: 'not_found', message: `Domain ${id} not found` });
      return reply.send({ object: 'domain', id, deleted: true });
    },
  );

  app.post(
    '/api/v1/domains/resend/:id/verify',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Verify a domain' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [domain] = await db
        .select()
        .from(sendingDomains)
        .where(and(eq(sendingDomains.id, id), eq(sendingDomains.orgId, req.user!.orgId)))
        .limit(1);
      if (!domain || !domain.dkimPublicKey) {
        return reply.code(404).send({
          statusCode: 404,
          name: 'not_found',
          message: `Domain ${id} not found or has no DKIM keys`,
        });
      }

      const records = buildDnsRecords({
        domain: domain.domain,
        mailSubdomain: domain.mailSubdomain ?? `mail.${domain.domain}`,
        dkimSelector: domain.dkimSelector,
        dkimPublicKey: domain.dkimPublicKey,
        dmarcEmail: DMARC_REPORT_EMAIL,
      });

      const { records: checked, allVerified } = await verifyDnsRecords(records);
      const dkimOk = await verifyDkimDns(
        domain.dkimSelector,
        domain.domain,
        domain.dkimPublicKey,
      );

      const spfRec = checked.find((r) => r.purpose.startsWith('SPF'));
      const dmarcRec = checked.find((r) => r.purpose.startsWith('DMARC'));
      const rpRec = checked.find((r) => r.purpose.startsWith('Return-Path'));

      const now = new Date();
      const nowOrNull = (ok: boolean | undefined) => (ok ? now : null);

      await db
        .update(sendingDomains)
        .set({
          spfVerified: spfRec?.verified ?? false,
          spfVerifiedAt: nowOrNull(spfRec?.verified),
          dkimVerified: dkimOk,
          dkimVerifiedAt: dkimOk ? now : null,
          dmarcVerified: dmarcRec?.verified ?? false,
          dmarcVerifiedAt: nowOrNull(dmarcRec?.verified),
          returnPathVerified: rpRec?.verified ?? false,
          returnPathVerifiedAt: nowOrNull(rpRec?.verified),
          isVerified: allVerified && dkimOk,
          updatedAt: now,
        })
        .where(eq(sendingDomains.id, id));

      const [refreshed] = await db
        .select()
        .from(sendingDomains)
        .where(eq(sendingDomains.id, id))
        .limit(1);

      return reply.send(domainShape(refreshed!, rowToRecords(refreshed!)));
    },
  );
};

export default domainsResendRoutes;
