/**
 * Platform-level (cross-org) routes for the system_admin role.
 *
 * Every endpoint here is gated by requireSystemAdmin — regular org
 * users get 403. These routes intentionally bypass the per-org scoping
 * that the rest of the API enforces, so they're isolated behind a
 * single namespace + middleware that's easy to audit.
 *
 *   GET  /api/v1/superadmin/orgs                — list every org
 *   GET  /api/v1/superadmin/orgs/:id            — org overview + stats
 *   PATCH /api/v1/superadmin/orgs/:id/plan      — change plan
 *   POST /api/v1/superadmin/orgs/:id/suspend    — block sending
 *   POST /api/v1/superadmin/orgs/:id/resume     — unblock sending
 *   GET  /api/v1/superadmin/queues              — BullMQ depth + failed
 *   GET  /api/v1/superadmin/queues/:name/failed — recent failed jobs
 *   GET  /api/v1/superadmin/stats               — platform-wide metrics
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  organizations,
  users,
  contacts,
  campaigns,
  emailEvents,
  billingSubscriptions,
  abuseEvents,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';
import { planEnum } from '../../db/schema/enums.js';
import { logAuditEvent } from '../../services/audit-log/index.js';

const PLAN_VALUES = planEnum.enumValues;

export default async function superadminRoutes(app: FastifyInstance) {
  // Every route in this scope requires system_admin role.
  app.addHook('preHandler', app.requireSystemAdmin);

  // ── Org listing ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/superadmin/orgs',
    { schema: { tags: ['SuperAdmin'], summary: 'List every organization on the platform' } },
    async () => {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          plan: organizations.plan,
          dataRegion: organizations.dataRegion,
          onboardingCompletedAt: organizations.onboardingCompletedAt,
          createdAt: organizations.createdAt,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .orderBy(sql`${organizations.createdAt} DESC`);

      // Counts in a single query — avoids N+1 over orgs.
      const contactCounts = await db
        .select({
          orgId: contacts.orgId,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(contacts)
        .where(sql`${contacts.deletedAt} IS NULL`)
        .groupBy(contacts.orgId);
      const contactMap = new Map(contactCounts.map((r) => [r.orgId, r.n]));

      const campaignCounts = await db
        .select({
          orgId: campaigns.orgId,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(campaigns)
        .groupBy(campaigns.orgId);
      const campaignMap = new Map(campaignCounts.map((r) => [r.orgId, r.n]));

      // Sent emails in the last 30 days — used as engagement signal in UI.
      const sentLast30 = await db
        .select({
          orgId: emailEvents.orgId,
          n: sql<number>`COUNT(*)::int`,
        })
        .from(emailEvents)
        .where(
          sql`${emailEvents.eventType} = 'send' AND ${emailEvents.createdAt} > NOW() - INTERVAL '30 days'`,
        )
        .groupBy(emailEvents.orgId);
      const sentMap = new Map(sentLast30.map((r) => [r.orgId, r.n]));

      return {
        data: rows.map((r) => ({
          ...r,
          stats: {
            contacts: contactMap.get(r.id) ?? 0,
            campaigns: campaignMap.get(r.id) ?? 0,
            sentLast30d: sentMap.get(r.id) ?? 0,
          },
        })),
      };
    },
  );

  // ── Org detail ─────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/superadmin/orgs/:id',
    { schema: { tags: ['SuperAdmin'], summary: 'Org overview + stats' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!org) throw AppError.notFound('Organization');

      const orgUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          emailVerified: users.emailVerified,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.orgId, id));

      const [counts] = await db
        .select({
          contacts: sql<number>`(SELECT COUNT(*)::int FROM contacts WHERE org_id = ${id} AND deleted_at IS NULL)`,
          campaigns: sql<number>`(SELECT COUNT(*)::int FROM campaigns WHERE org_id = ${id})`,
          sent7d: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE org_id = ${id} AND event_type = 'send' AND created_at > NOW() - INTERVAL '7 days')`,
          sent30d: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE org_id = ${id} AND event_type = 'send' AND created_at > NOW() - INTERVAL '30 days')`,
          bounced30d: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE org_id = ${id} AND event_type = 'bounce' AND created_at > NOW() - INTERVAL '30 days')`,
          complained30d: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE org_id = ${id} AND event_type = 'complaint' AND created_at > NOW() - INTERVAL '30 days')`,
        })
        .from(sql`(SELECT 1) AS dummy`);

      // Complaint rate — Postmaster Tools and our own abuse policy care about
      // this. >0.1% is risky territory; >0.3% gets you blacklisted.
      const sent30 = counts?.sent30d ?? 0;
      const complained30 = counts?.complained30d ?? 0;
      const complaintRate = sent30 > 0 ? complained30 / sent30 : 0;

      const [subscription] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.orgId, id))
        .limit(1);

      return {
        data: {
          org,
          users: orgUsers,
          stats: {
            contacts: counts?.contacts ?? 0,
            campaigns: counts?.campaigns ?? 0,
            sent7d: counts?.sent7d ?? 0,
            sent30d: sent30,
            bounced30d: counts?.bounced30d ?? 0,
            complained30d: complained30,
            complaintRate,
          },
          billing: subscription ?? null,
        },
      };
    },
  );

  // ── Org plan change ────────────────────────────────────────────────────────

  app.patch(
    '/api/v1/superadmin/orgs/:id/plan',
    { schema: { tags: ['SuperAdmin'], summary: 'Manually change an org plan' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { plan } = z.object({ plan: z.enum(PLAN_VALUES) }).parse(req.body);

      const [before] = await db
        .select({ plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      await db.update(organizations).set({ plan }).where(eq(organizations.id, id));
      await db
        .insert(billingSubscriptions)
        .values({ orgId: id, plan })
        .onConflictDoUpdate({
          target: billingSubscriptions.orgId,
          set: { plan, updatedAt: new Date() },
        });

      await logAuditEvent({
        orgId: id,
        userId: req.user?.userId,
        action: 'superadmin.plan_changed',
        resource: 'organization',
        resourceId: id,
        changes: { plan: { from: before?.plan ?? null, to: plan } },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });

      return reply.send({ data: { id, plan, updated: true } });
    },
  );

  // ── Grant production sending access (leave sandbox) ────────────────────────
  app.post(
    '/api/v1/superadmin/orgs/:id/grant-production',
    { schema: { tags: ['SuperAdmin'], summary: 'Grant production sending access (leave sandbox)' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { grantProductionAccess } = await import('../../services/identities/index.js');
      await grantProductionAccess(id);
      await logAuditEvent({
        orgId: id,
        userId: req.user?.userId,
        action: 'superadmin.production_granted',
        resource: 'organization',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.send({ data: { id, sendingMode: 'production' } });
    },
  );

  // ── Suspend / resume an org ────────────────────────────────────────────────

  app.post(
    '/api/v1/superadmin/orgs/:id/suspend',
    { schema: { tags: ['SuperAdmin'], summary: 'Block all outbound sending for an org' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      // Marker in org.settings — checked by batch-sender + campaign worker
      // before enqueueing. Implementation note: workers consult this flag
      // to short-circuit dispatch.
      const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!org) throw AppError.notFound('Organization');
      const next = {
        ...(org.settings ?? {}),
        suspended: true,
        suspendedAt: new Date().toISOString(),
      };
      await db.update(organizations).set({ settings: next }).where(eq(organizations.id, id));
      await logAuditEvent({
        orgId: id,
        userId: req.user?.userId,
        action: 'superadmin.org_suspended',
        resource: 'organization',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.send({ data: { id, suspended: true } });
    },
  );

  app.post(
    '/api/v1/superadmin/orgs/:id/resume',
    { schema: { tags: ['SuperAdmin'], summary: 'Resume outbound sending for an org' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
      if (!org) throw AppError.notFound('Organization');
      const next = { ...(org.settings ?? {}), suspended: false };
      delete (next as Record<string, unknown>).suspendedAt;
      await db.update(organizations).set({ settings: next }).where(eq(organizations.id, id));
      await logAuditEvent({
        orgId: id,
        userId: req.user?.userId,
        action: 'superadmin.org_resumed',
        resource: 'organization',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.send({ data: { id, suspended: false } });
    },
  );

  // ── BullMQ queue inspection ────────────────────────────────────────────────
  //
  // Returns depth across the queues we care about. Names mirror
  // apps/workers/src/queues/index.ts QUEUE_NAMES.

  const TRACKED_QUEUES = [
    'campaign-splitter',
    'batch-sender',
    'batch-sender-transactional',
    'batch-sender-triggered',
    'mta-gmail',
    'mta-microsoft',
    'mta-yahoo',
    'mta-seznam',
    'mta-volny',
    'mta-centrum',
    'mta-other',
  ];

  app.get(
    '/api/v1/superadmin/queues',
    { schema: { tags: ['SuperAdmin'], summary: 'BullMQ queue depth across the platform' } },
    async () => {
      const data = await Promise.all(
        TRACKED_QUEUES.map(async (name) => {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            redis.llen(`bull:${name}:waiting`).catch(() => 0),
            redis.llen(`bull:${name}:active`).catch(() => 0),
            redis.zcard(`bull:${name}:completed`).catch(() => 0),
            redis.zcard(`bull:${name}:failed`).catch(() => 0),
            redis.zcard(`bull:${name}:delayed`).catch(() => 0),
          ]);
          return { name, waiting, active, completed, failed, delayed };
        }),
      );
      return { data };
    },
  );

  app.get(
    '/api/v1/superadmin/queues/:name/failed',
    { schema: { tags: ['SuperAdmin'], summary: 'Recent failed jobs in a queue' } },
    async (req) => {
      const { name } = z.object({ name: z.string().min(1).max(64) }).parse(req.params);
      const { limit } = z
        .object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
        .parse(req.query);

      const jobIds = await redis.zrange(`bull:${name}:failed`, 0, limit - 1);
      const jobs = await Promise.all(
        jobIds.map(async (id) => {
          const job = await redis.hgetall(`bull:${name}:${id}`);
          if (!job || Object.keys(job).length === 0) return null;
          return {
            id,
            name: job.name,
            failedReason: job.failedReason,
            attemptsMade: job.atm ? parseInt(job.atm, 10) : 0,
            data: tryParseJson(job.data),
            processedOn: job.processedOn ? parseInt(job.processedOn, 10) : null,
          };
        }),
      );
      return { data: jobs.filter(Boolean) };
    },
  );

  // ── Abuse events feed ─────────────────────────────────────────────────────

  app.get(
    '/api/v1/superadmin/abuse',
    { schema: { tags: ['SuperAdmin'], summary: 'Recent abuse events across all orgs' } },
    async (req) => {
      const { status, limit } = z
        .object({
          status: z
            .enum(['open', 'acknowledged', 'investigating', 'resolved', 'false_positive'])
            .optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);

      const conditions = status ? [eq(abuseEvents.status, status)] : [];

      const rows = await db
        .select({
          id: abuseEvents.id,
          orgId: abuseEvents.orgId,
          orgName: organizations.name,
          signalType: abuseEvents.signalType,
          severity: abuseEvents.severity,
          summary: abuseEvents.summary,
          observedValue: abuseEvents.observedValue,
          threshold: abuseEvents.threshold,
          sampleSize: abuseEvents.sampleSize,
          status: abuseEvents.status,
          actionTaken: abuseEvents.actionTaken,
          createdAt: abuseEvents.createdAt,
        })
        .from(abuseEvents)
        .innerJoin(organizations, eq(organizations.id, abuseEvents.orgId))
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(sql`${abuseEvents.createdAt} DESC`)
        .limit(limit);

      return { data: rows };
    },
  );

  // ── Platform-wide stats ────────────────────────────────────────────────────

  app.get(
    '/api/v1/superadmin/stats',
    { schema: { tags: ['SuperAdmin'], summary: 'Platform-wide aggregate metrics' } },
    async () => {
      const [counts] = await db
        .select({
          orgsTotal: sql<number>`(SELECT COUNT(*)::int FROM organizations WHERE deleted_at IS NULL)`,
          orgsNew7d: sql<number>`(SELECT COUNT(*)::int FROM organizations WHERE created_at > NOW() - INTERVAL '7 days')`,
          usersTotal: sql<number>`(SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL)`,
          contactsTotal: sql<number>`(SELECT COUNT(*)::int FROM contacts WHERE deleted_at IS NULL)`,
          mailsSent24h: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE event_type = 'send' AND created_at > NOW() - INTERVAL '24 hours')`,
          mailsSent7d: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE event_type = 'send' AND created_at > NOW() - INTERVAL '7 days')`,
          bounces24h: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE event_type = 'bounce' AND created_at > NOW() - INTERVAL '24 hours')`,
          complaints24h: sql<number>`(SELECT COUNT(*)::int FROM email_events WHERE event_type = 'complaint' AND created_at > NOW() - INTERVAL '24 hours')`,
        })
        .from(sql`(SELECT 1) AS dummy`);

      return { data: counts ?? {} };
    },
  );
}

function tryParseJson(s: string | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
