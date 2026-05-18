/**
 * Loyalty ledger routes (#236)
 *
 * GET  /api/v1/loyalty/programs/:programId/members/:memberId/ledger
 * GET  /api/v1/loyalty/programs/:programId/members/:memberId/ledger/summary
 * GET  /api/v1/loyalty/programs/:programId/members/:memberId/ledger/expiring
 * POST /api/v1/loyalty/programs/:programId/members/:memberId/ledger/reconcile
 * POST /api/v1/loyalty/programs/:programId/expiry/process   — admin trigger
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getLedger,
  getLedgerSummary,
  getExpiringPoints,
  reconcileBalance,
  processPointExpiry,
} from '../../../services/loyalty/ledger.js';

const loyaltyLedgerRoutes: FastifyPluginAsync = async (app) => {
  const memberParams = z.object({ programId: z.string().uuid(), memberId: z.string().uuid() });

  app.get('/api/v1/loyalty/programs/:programId/members/:memberId/ledger', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Paginated points transaction history' },
  }, async (req) => {
    const { memberId } = memberParams.parse(req.params);
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
      type: z.enum(['earn', 'redeem', 'expire', 'adjust', 'bonus', 'refund']).optional(),
    }).parse(req.query);
    return getLedger(req.user!.orgId, memberId, q);
  });

  app.get('/api/v1/loyalty/programs/:programId/members/:memberId/ledger/summary', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Ledger aggregate summary for a member' },
  }, async (req) => {
    const { memberId } = memberParams.parse(req.params);
    return { data: await getLedgerSummary(memberId) };
  });

  app.get('/api/v1/loyalty/programs/:programId/members/:memberId/ledger/expiring', {
    preHandler: [app.authenticate],
    schema: { tags: ['Loyalty'], summary: 'Points expiring in the next N days' },
  }, async (req) => {
    const { memberId } = memberParams.parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    return { data: await getExpiringPoints(memberId, days) };
  });

  app.post('/api/v1/loyalty/programs/:programId/members/:memberId/ledger/reconcile', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Loyalty'], summary: 'Reconcile cached balance with ledger' },
  }, async (req) => {
    const { memberId } = memberParams.parse(req.params);
    const balance = await reconcileBalance(req.user!.orgId, memberId);
    return { data: { balance } };
  });

  app.post('/api/v1/loyalty/programs/:programId/expiry/process', {
    preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
    schema: { tags: ['Loyalty'], summary: 'Trigger point expiry processing for the org' },
  }, async (req) => {
    const result = await processPointExpiry(req.user!.orgId);
    return { data: result };
  });
};

export default loyaltyLedgerRoutes;
