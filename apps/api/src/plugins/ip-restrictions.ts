import fp from 'fastify-plugin';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ipRestrictions, organizations } from '../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';

const CACHE_TTL = 300; // 5 min

export async function getOrgAllowedCidrs(orgId: string): Promise<string[]> {
  const cacheKey = `ip_restrictions:${orgId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as string[];

  const rules = await db
    .select({ cidr: ipRestrictions.cidr })
    .from(ipRestrictions)
    .where(and(eq(ipRestrictions.orgId, orgId), eq(ipRestrictions.enabled, true)));

  const cidrs = rules.map((r) => r.cidr);
  await redis.set(cacheKey, JSON.stringify(cidrs), 'EX', CACHE_TTL);
  return cidrs;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  // simple CIDR check — IPv4 only
  const [range, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits ?? '32', 10))) - 1);
  const toInt = (addr: string) =>
    addr.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
  return (toInt(ip) & mask) >>> 0 === (toInt(range ?? '') & mask) >>> 0;
}

function extractClientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = typeof forwarded === 'string' ? forwarded : forwarded[0];
    return raw?.split(',')[0]?.trim() ?? req.ip;
  }
  return req.ip;
}

const ipRestrictionsPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook('preHandler', async (request, reply) => {
    // Only check authenticated requests with an orgId
    const orgId: string | undefined =
      (request as unknown as { orgId?: string }).orgId ?? request.user?.orgId;
    if (!orgId) return;

    const org = await db
      .select({ ipRestrictionsEnabled: organizations.ipRestrictionsEnabled })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .then((r) => r[0]);

    if (!org?.ipRestrictionsEnabled) return;

    const cidrs = await getOrgAllowedCidrs(orgId);
    if (cidrs.length === 0) return; // no rules = allow all

    const clientIp = extractClientIp(request);
    const allowed = cidrs.some((cidr) => isIpInCidr(clientIp, cidr));

    if (!allowed) {
      return reply.code(403).send({
        code: 'IP_RESTRICTED',
        message: 'Access denied: IP not in allowlist',
        statusCode: 403,
      });
    }
  });
  done();
};

export default fp(ipRestrictionsPlugin, { name: 'ip-restrictions', dependencies: ['auth'] });
