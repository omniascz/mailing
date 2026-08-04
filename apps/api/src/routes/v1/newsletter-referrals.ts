/**
 * Newsletter referral program routes.
 *
 *  GET  /api/v1/newsletter-referrals/programs              — list programs
 *  POST /api/v1/newsletter-referrals/programs              — create program
 *  PUT  /api/v1/newsletter-referrals/programs/:id          — update program
 *  POST /api/v1/newsletter-referrals/assign                — get or create referral code for a contact
 *  GET  /api/v1/newsletter-referrals/stats/:contactId      — stats for a referrer
 *  GET  /r/:code                                           — public redirect + click tracking
 *  POST /api/v1/newsletter-referrals/convert               — mark a referred contact as converted (confirmed)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  newsletterReferralPrograms,
  newsletterReferrals,
  newsletterReferralEvents,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

/** Generate a short, URL-safe referral code (8 chars). */
function generateCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

const programCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  conversionsPerReward: z.number().int().min(1).default(1),
  rewardType: z
    .enum(['tier_upgrade', 'loyalty_points', 'stripe_credit', 'webhook', 'none'])
    .default('none'),
  rewardValue: z.string().optional(),
  workflowId: z.string().uuid().optional(),
});

export default async function newsletterReferralRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/newsletter-referrals/programs
   */
  app.get(
    '/api/v1/newsletter-referrals/programs',
    { schema: { tags: ['Newsletter Referrals'], summary: 'List referral programs' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const rows = await db
        .select()
        .from(newsletterReferralPrograms)
        .where(
          and(
            eq(newsletterReferralPrograms.orgId, orgId),
            sql`${newsletterReferralPrograms.isActive} = 1`,
          ),
        )
        .orderBy(desc(newsletterReferralPrograms.createdAt));
      return { data: rows };
    },
  );

  /**
   * POST /api/v1/newsletter-referrals/programs
   */
  app.post(
    '/api/v1/newsletter-referrals/programs',
    { schema: { tags: ['Newsletter Referrals'], summary: 'Create referral program' } },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const body = programCreateSchema.parse(req.body);

      const [program] = await db
        .insert(newsletterReferralPrograms)
        .values({ orgId, ...body })
        .returning();

      return reply.code(201).send({ data: program });
    },
  );

  /**
   * PUT /api/v1/newsletter-referrals/programs/:id
   */
  app.put(
    '/api/v1/newsletter-referrals/programs/:id',
    { schema: { tags: ['Newsletter Referrals'], summary: 'Update referral program' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = programCreateSchema.partial().parse(req.body);

      const existing = await db
        .select({ id: newsletterReferralPrograms.id })
        .from(newsletterReferralPrograms)
        .where(
          and(eq(newsletterReferralPrograms.id, id), eq(newsletterReferralPrograms.orgId, orgId)),
        )
        .limit(1);
      if (!existing.length) throw AppError.notFound('Program');

      const [updated] = await db
        .update(newsletterReferralPrograms)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(eq(newsletterReferralPrograms.id, id), eq(newsletterReferralPrograms.orgId, orgId)),
        )
        .returning();

      return { data: updated };
    },
  );

  /**
   * POST /api/v1/newsletter-referrals/assign
   * Get or create a unique referral code for a contact + program pair.
   * The referral URL to embed: {BASE_URL}/r/{code}
   */
  app.post(
    '/api/v1/newsletter-referrals/assign',
    { schema: { tags: ['Newsletter Referrals'], summary: 'Assign referral code to contact' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { contactId, programId } = z
        .object({ contactId: z.string().uuid(), programId: z.string().uuid() })
        .parse(req.body);

      // Idempotent — return existing code if already assigned
      const existing = await db
        .select()
        .from(newsletterReferrals)
        .where(
          and(
            eq(newsletterReferrals.referrerContactId, contactId),
            eq(newsletterReferrals.programId, programId),
          ),
        )
        .limit(1);

      if (existing.length) {
        const baseUrl = process.env.APP_BASE_URL ?? 'https://app.forgemsg.com';
        return { data: { ...existing[0], referralUrl: `${baseUrl}/r/${existing[0]!.code}` } };
      }

      // Generate a unique code (retry on collision)
      let code = generateCode();
      for (let i = 0; i < 5; i++) {
        const clash = await db
          .select({ id: newsletterReferrals.id })
          .from(newsletterReferrals)
          .where(eq(newsletterReferrals.code, code))
          .limit(1);
        if (!clash.length) break;
        code = generateCode();
      }

      const [referral] = await db
        .insert(newsletterReferrals)
        .values({ orgId, programId, referrerContactId: contactId, code })
        .returning();

      const baseUrl = process.env.APP_BASE_URL ?? 'https://app.forgemsg.com';
      return { data: { ...referral, referralUrl: `${baseUrl}/r/${referral!.code}` } };
    },
  );

  /**
   * GET /api/v1/newsletter-referrals/stats/:contactId
   * Referral statistics for a specific contact.
   */
  app.get(
    '/api/v1/newsletter-referrals/stats/:contactId',
    { schema: { tags: ['Newsletter Referrals'], summary: 'Get referral stats for a contact' } },
    async (req) => {
      const orgId = req.user!.orgId;
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);

      const rows = await db
        .select()
        .from(newsletterReferrals)
        .where(
          and(
            eq(newsletterReferrals.orgId, orgId),
            eq(newsletterReferrals.referrerContactId, contactId),
          ),
        );

      const totalClicks = rows.reduce((s, r) => s + r.clickCount, 0);
      const totalConversions = rows.reduce((s, r) => s + r.conversionCount, 0);
      const totalRewards = rows.reduce((s, r) => s + r.rewardsIssued, 0);

      return { data: { referrals: rows, totalClicks, totalConversions, totalRewards } };
    },
  );

  /**
   * POST /api/v1/newsletter-referrals/convert
   * Mark a referral as converted (called by the list-confirmation webhook or automation).
   */
  app.post(
    '/api/v1/newsletter-referrals/convert',
    { schema: { tags: ['Newsletter Referrals'], summary: 'Record a referral conversion' } },
    async (req, reply) => {
      const body = z
        .object({
          code: z.string(),
          referredEmail: z.string().email().optional(),
          referredContactId: z.string().uuid().optional(),
        })
        .parse(req.body);

      const [referral] = await db
        .select()
        .from(newsletterReferrals)
        .where(eq(newsletterReferrals.code, body.code))
        .limit(1);

      if (!referral) throw AppError.notFound('Referral code');

      // Record event
      await db.insert(newsletterReferralEvents).values({
        referralId: referral.id,
        orgId: referral.orgId,
        eventType: 'confirmed',
        referredEmail: body.referredEmail,
        referredContactId: body.referredContactId,
      });

      // Increment conversion count
      const newConversions = referral.conversionCount + 1;
      await db
        .update(newsletterReferrals)
        .set({ conversionCount: newConversions, updatedAt: new Date() })
        .where(eq(newsletterReferrals.id, referral.id));

      // Check if reward threshold reached
      const program = await db
        .select()
        .from(newsletterReferralPrograms)
        .where(eq(newsletterReferralPrograms.id, referral.programId))
        .limit(1);

      const rewardDue =
        program.length > 0 &&
        newConversions > 0 &&
        newConversions % program[0]!.conversionsPerReward === 0;

      if (rewardDue) {
        await db
          .update(newsletterReferrals)
          .set({ rewardsIssued: referral.rewardsIssued + 1, updatedAt: new Date() })
          .where(eq(newsletterReferrals.id, referral.id));

        await db.insert(newsletterReferralEvents).values({
          referralId: referral.id,
          orgId: referral.orgId,
          eventType: 'reward_issued',
        });
      }

      return reply.code(201).send({ data: { converted: true, rewardIssued: rewardDue } });
    },
  );

  /**
   * GET /r/:code
   * Public referral redirect endpoint.
   * Records a click and redirects to the org's subscription form / landing page.
   */
  app.get(
    '/r/:code',
    {
      schema: { tags: ['Newsletter Referrals'], summary: 'Referral link redirect' },
      config: { public: true },
    },
    async (req, reply) => {
      const { code } = z.object({ code: z.string().min(1).max(50) }).parse(req.params);

      const [referral] = await db
        .select({
          id: newsletterReferrals.id,
          orgId: newsletterReferrals.orgId,
          programId: newsletterReferrals.programId,
        })
        .from(newsletterReferrals)
        .where(eq(newsletterReferrals.code, code))
        .limit(1);

      if (!referral) {
        // Redirect to homepage rather than 404 to avoid leaking info
        return reply.redirect(process.env.APP_BASE_URL ?? 'https://app.forgemsg.com');
      }

      // Increment click count + record event (fire-and-forget)
      void db
        .update(newsletterReferrals)
        .set({ clickCount: sql`${newsletterReferrals.clickCount} + 1`, updatedAt: new Date() })
        .where(eq(newsletterReferrals.id, referral.id));

      void db.insert(newsletterReferralEvents).values({
        referralId: referral.id,
        orgId: referral.orgId,
        eventType: 'click',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Redirect to subscribe page with code embedded
      const base = process.env.APP_BASE_URL ?? 'https://app.forgemsg.com';
      const subscribeUrl = `${base}/subscribe?ref=${encodeURIComponent(code)}&prog=${encodeURIComponent(referral.programId)}`;
      return reply.redirect(subscribeUrl, 302);
    },
  );
}
