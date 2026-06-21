/**
 * BIMI (Brand Indicators for Message Identification) publishing flow.
 *
 *  GET    /api/v1/domains/:domain/bimi        — get BIMI config + DNS record to publish
 *  POST   /api/v1/domains/:domain/bimi        — create/update BIMI config
 *  DELETE /api/v1/domains/:domain/bimi        — remove BIMI config
 *  POST   /api/v1/domains/:domain/bimi/verify — trigger DNS verification check
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import dns from 'node:dns/promises';
import { db } from '../../db/client.js';
import { bimiConfigs } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const domainParam = z.object({ domain: z.string().min(3).max(255) });

const bimiUpsertSchema = z.object({
  /** HTTPS URL to a Tiny 1.2 SVG logo (required) */
  svgLogoUrl: z.string().url().startsWith('https://'),
  /** HTTPS URL to a VMC file (required for Gmail; optional otherwise) */
  vmcUrl: z.string().url().startsWith('https://').optional(),
});

function buildDnsRecord(svgLogoUrl: string, vmcUrl?: string | null): string {
  const base = `v=BIMI1; l=${svgLogoUrl}`;
  return vmcUrl ? `${base}; a=${vmcUrl}` : base;
}

function buildDnsRecordName(domain: string): string {
  return `default._bimi.${domain}`;
}

export default async function bimiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/domains/:domain/bimi
   * Return the BIMI config for a domain plus the DNS TXT record to publish.
   */
  app.get(
    '/api/v1/domains/:domain/bimi',
    { schema: { tags: ['BIMI'], summary: 'Get BIMI config for domain' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { domain } = domainParam.parse(req.params);

      const [row] = await db
        .select()
        .from(bimiConfigs)
        .where(and(eq(bimiConfigs.orgId, orgId), eq(bimiConfigs.domain, domain)))
        .limit(1);

      if (!row) throw AppError.notFound('BIMI config');

      return {
        data: {
          ...row,
          dnsRecordName: buildDnsRecordName(domain),
          publishInstructions: {
            type: 'TXT',
            name: buildDnsRecordName(domain),
            value: row.dnsRecordValue,
            note: 'Add this TXT record in your DNS provider. TTL: 3600. Propagation may take up to 48 hours.',
          },
        },
      };
    },
  );

  /**
   * POST /api/v1/domains/:domain/bimi
   * Create or update BIMI configuration for a domain.
   * Returns the DNS record to publish.
   */
  app.post(
    '/api/v1/domains/:domain/bimi',
    { schema: { tags: ['BIMI'], summary: 'Configure BIMI for domain' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const { domain } = domainParam.parse(req.params);
      const body = bimiUpsertSchema.parse(req.body);

      const dnsRecordValue = buildDnsRecord(body.svgLogoUrl, body.vmcUrl);

      const [row] = await db
        .insert(bimiConfigs)
        .values({
          orgId,
          domain,
          svgLogoUrl: body.svgLogoUrl,
          vmcUrl: body.vmcUrl,
          dnsRecordValue,
          isVerified: false,
        })
        .onConflictDoUpdate({
          target: [bimiConfigs.orgId, bimiConfigs.domain],
          set: {
            svgLogoUrl: body.svgLogoUrl,
            vmcUrl: body.vmcUrl ?? null,
            dnsRecordValue,
            isVerified: false,
            verifiedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return reply.code(201).send({
        data: {
          ...row,
          dnsRecordName: buildDnsRecordName(domain),
          publishInstructions: {
            type: 'TXT',
            name: buildDnsRecordName(domain),
            value: dnsRecordValue,
            note: 'Add this TXT record in your DNS provider. TTL: 3600. Propagation may take up to 48 hours.',
          },
        },
      });
    },
  );

  /**
   * DELETE /api/v1/domains/:domain/bimi
   * Remove BIMI configuration.
   */
  app.delete(
    '/api/v1/domains/:domain/bimi',
    { schema: { tags: ['BIMI'], summary: 'Remove BIMI config' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const { domain } = domainParam.parse(req.params);

      await db
        .delete(bimiConfigs)
        .where(and(eq(bimiConfigs.orgId, orgId), eq(bimiConfigs.domain, domain)));

      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/domains/:domain/bimi/verify
   * Perform a live DNS TXT lookup to check if the BIMI record is published.
   * Updates isVerified and lastCheckAt.
   */
  app.post(
    '/api/v1/domains/:domain/bimi/verify',
    { schema: { tags: ['BIMI'], summary: 'Verify BIMI DNS record is live' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { domain } = domainParam.parse(req.params);

      const [row] = await db
        .select()
        .from(bimiConfigs)
        .where(and(eq(bimiConfigs.orgId, orgId), eq(bimiConfigs.domain, domain)))
        .limit(1);

      if (!row) throw AppError.notFound('BIMI config');

      const recordName = buildDnsRecordName(domain);
      let found = false;
      let checkResult = 'not_found';

      try {
        const txtRecords = await dns.resolveTxt(recordName);
        const flat = txtRecords.map((parts) => parts.join('')).join('\n');
        // BIMI record must start with "v=BIMI1"
        found = flat.includes('v=BIMI1');
        checkResult = found ? 'verified' : 'wrong_value';
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        checkResult = code === 'ENOTFOUND' || code === 'ENODATA' ? 'not_found' : 'dns_error';
      }

      await db
        .update(bimiConfigs)
        .set({
          isVerified: found,
          verifiedAt: found ? new Date() : null,
          lastCheckAt: new Date(),
          lastCheckResult: checkResult,
          updatedAt: new Date(),
        })
        .where(and(eq(bimiConfigs.orgId, orgId), eq(bimiConfigs.domain, domain)));

      return {
        data: {
          domain,
          recordName,
          isVerified: found,
          checkResult,
          checkedAt: new Date().toISOString(),
          ...(found
            ? { message: 'BIMI record verified. Your logo will appear in supporting email clients.' }
            : {
                message: `Record not found or incorrect. Publish: ${buildDnsRecordName(domain)} TXT "${row.dnsRecordValue}"`,
              }),
        },
      };
    },
  );
}
