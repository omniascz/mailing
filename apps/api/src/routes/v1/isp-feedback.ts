/**
 * ISP Feedback Loop (FBL) routes — #25
 *
 *  POST /api/v1/isp/feedback            — receive raw ARF complaint email
 *  POST /api/v1/isp/feedback/postmaster — Google Postmaster daily digest
 *  GET  /api/v1/isp/registrations       — list org FBL registrations
 *  POST /api/v1/isp/registrations       — register a new FBL endpoint
 *  DEL  /api/v1/isp/registrations/:id  — remove registration
 *  GET  /api/v1/isp/stats               — complaint rate stats for org
 *  POST /api/v1/isp/record-send         — record sent emails for rate tracking
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { ispFblRegistrations } from '../../db/schema/index.js';
import { and, desc, eq } from 'drizzle-orm';
import {
  parseArfReport,
  processFblComplaint,
  recordSendForFblTracking,
} from '../../services/sending/fbl-processor.js';
import { redis } from '../../lib/redis.js';

// ─── Shared secret for unauthenticated FBL webhook endpoints ─────────────────
// ISPs send ARF mails; our mailbox forwarder POSTs them with X-FBL-Secret.
function verifyFblSecret(secret: string | undefined): boolean {
  const expected = process.env.FBL_WEBHOOK_SECRET;
  if (!expected) return true; // not configured — allow (dev mode)
  if (!secret) return false;
  try {
    return require('node:crypto')
      .timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  } catch {
    return false;
  }
}

const ispFeedbackRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /api/v1/isp/feedback ─────────────────────────────────────────────
  // Receives raw ARF email from a mailbox forwarder or SMTP relay.
  // Callers MUST send X-FBL-Secret or X-Org-Id + X-Campaign-Id headers.
  app.post('/api/v1/isp/feedback', {
    schema: {
      tags: ['ISP Feedback'],
      summary: 'Receive an ARF FBL complaint',
      description:
        'Called by a mailbox forwarder / relay when an ISP sends a complaint. ' +
        'Authenticate via X-FBL-Secret header. Org is identified by X-Org-Id.',
    },
  }, async (req, reply) => {
    const secret = req.headers['x-fbl-secret'] as string | undefined;
    if (!verifyFblSecret(secret)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid FBL secret' });
    }

    const orgId = req.headers['x-org-id'] as string | undefined;
    const campaignId = req.headers['x-campaign-id'] as string | undefined;

    if (!orgId) {
      return reply.code(400).send({ code: 'MISSING_ORG', message: 'X-Org-Id header required' });
    }

    // Body is the raw ARF email as text
    const rawEmail = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const report = parseArfReport(rawEmail);
    const result = await processFblComplaint(report, orgId, campaignId);

    return reply.code(200).send({ data: result });
  });

  // ─── POST /api/v1/isp/feedback/postmaster ──────────────────────────────────
  // Google Postmaster Tools sends daily spam-rate digests via webhook.
  // Format: { domain, date, spamRate, userReportedSpamRate, ... }
  app.post('/api/v1/isp/feedback/postmaster', {
    schema: {
      tags: ['ISP Feedback'],
      summary: 'Google Postmaster daily digest webhook',
    },
  }, async (req, reply) => {
    const secret = req.headers['x-fbl-secret'] as string | undefined;
    if (!verifyFblSecret(secret)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid FBL secret' });
    }

    const body = z.object({
      orgId: z.string().uuid(),
      domain: z.string(),
      date: z.string(), // YYYY-MM-DD
      spamRate: z.number().min(0).max(1).optional(),
      userReportedSpamRatio: z.number().min(0).max(1).optional(),
      inboxPlacementRate: z.number().min(0).max(1).optional(),
      spamFilteredRatio: z.number().min(0).max(1).optional(),
    }).parse(req.body);

    // Store snapshot in Redis (30-day TTL) for the stats endpoint
    const key = `postmaster:${body.orgId}:${body.domain}:${body.date}`;
    await redis.set(key, JSON.stringify(body), 'EX', 30 * 86_400);

    // Fire alert if spam rate > 0.1%
    if ((body.spamRate ?? 0) > 0.001 || (body.userReportedSpamRatio ?? 0) > 0.001) {
      console.warn(
        `[POSTMASTER ALERT] org=${body.orgId} domain=${body.domain} ` +
        `spamRate=${body.spamRate} date=${body.date}`,
      );
    }

    return reply.code(200).send({ data: { received: true } });
  });

  // ─── POST /api/v1/isp/record-send (authenticated) ──────────────────────────
  app.post('/api/v1/isp/record-send', {
    preHandler: [app.authenticate],
    schema: { tags: ['ISP Feedback'], summary: 'Record sent email count for FBL rate tracking' },
  }, async (req, reply) => {
    const body = z.object({ count: z.number().int().positive().default(1) }).parse(req.body);
    await recordSendForFblTracking(req.user!.orgId, body.count);
    return reply.send({ data: { recorded: body.count } });
  });

  // ─── GET /api/v1/isp/stats (authenticated) ─────────────────────────────────
  app.get('/api/v1/isp/stats', {
    preHandler: [app.authenticate],
    schema: { tags: ['ISP Feedback'], summary: 'Complaint rate stats' },
  }, async (req, reply) => {
    const orgId = req.user!.orgId;
    const [sentRaw, complaintsRaw] = await Promise.all([
      redis.get(`fbl:sent24h:${orgId}`),
      redis.get(`fbl:complaints24h:${orgId}`),
    ]);
    const sent = parseInt(sentRaw ?? '0', 10);
    const complaints = parseInt(complaintsRaw ?? '0', 10);
    const rate = sent > 0 ? complaints / sent : 0;
    return reply.send({
      data: {
        sent24h: sent,
        complaints24h: complaints,
        complaintRate: parseFloat((rate * 100).toFixed(4)),
        threshold: 0.1,
        status: rate > 0.001 ? 'danger' : rate > 0.0003 ? 'warning' : 'ok',
      },
    });
  });

  // ─── GET /api/v1/isp/registrations (authenticated) ─────────────────────────
  app.get('/api/v1/isp/registrations', {
    preHandler: [app.authenticate],
    schema: { tags: ['ISP Feedback'], summary: 'List FBL registrations' },
  }, async (req, reply) => {
    const rows = await db
      .select()
      .from(ispFblRegistrations)
      .where(eq(ispFblRegistrations.orgId, req.user!.orgId))
      .orderBy(desc(ispFblRegistrations.createdAt));
    return reply.send({ data: rows });
  });

  // ─── POST /api/v1/isp/registrations ────────────────────────────────────────
  app.post('/api/v1/isp/registrations', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['ISP Feedback'], summary: 'Register an FBL endpoint' },
  }, async (req, reply) => {
    const body = z.object({
      isp: z.enum(['gmail', 'microsoft', 'yahoo', 'aol', 'comcast', 'other']),
      fblEmail: z.string().email().optional(),
      webhookUrl: z.string().url().optional(),
      notes: z.string().max(1024).optional(),
    }).parse(req.body);

    const [reg] = await db
      .insert(ispFblRegistrations)
      .values({ orgId: req.user!.orgId, ...body })
      .returning();
    return reply.code(201).send({ data: reg });
  });

  // ─── DELETE /api/v1/isp/registrations/:id ──────────────────────────────────
  app.delete('/api/v1/isp/registrations/:id', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['ISP Feedback'], summary: 'Remove FBL registration' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db
      .delete(ispFblRegistrations)
      .where(and(eq(ispFblRegistrations.id, id), eq(ispFblRegistrations.orgId, req.user!.orgId)));
    return reply.code(204).send();
  });
};

export default ispFeedbackRoutes;
