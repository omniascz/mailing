/**
 * Extended billing routes (#281, #282, #283).
 *
 *  GET  /api/v1/billing/plans/all         — all plans (contact-based + send-based)
 *  GET  /api/v1/billing/credits           — PAYG credit balance
 *  POST /api/v1/billing/credits/purchase  — add credits (amount in USD)
 *  GET  /api/v1/billing/credits/history   — transaction history
 *  GET  /api/v1/billing/usage             — current period product usage summary
 *  GET  /api/v1/billing/usage/:product    — single product usage
 *  GET  /api/v1/billing/subaccounts/report — consolidated child-org report (parent only)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listAllPlans } from '../../services/billing/plans.js';
import { getBalance, addCredits, getTransactionHistory } from '../../services/billing/credits.js';
import {
  getProductUsage,
  getOrgUsageSummary,
  computePeriodCost,
  currentPeriod,
} from '../../services/billing/meters.js';
import type { MeterProduct } from '../../db/schema/product-meters.js';
import { getConsolidatedReport } from '../../services/billing/subaccounts.js';
import { METER_PRODUCTS } from '../../db/schema/product-meters.js';

const billingExtendedRoutes: FastifyPluginAsync = async (app) => {
  // ── All plans ───────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/billing/plans/all',
    {
      schema: { tags: ['Billing'] },
    },
    async (_req, reply) => {
      return reply.send({ data: listAllPlans() });
    },
  );

  // ── PAYG credit balance ─────────────────────────────────────────────────────

  app.get(
    '/api/v1/billing/credits',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const balance = await getBalance(req.user!.orgId);
      return reply.send({ data: balance });
    },
  );

  // ── Purchase credits ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/billing/credits/purchase',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          amountUsd: z.number().min(5).max(10_000),
          stripePaymentIntentId: z.string().optional(),
        })
        .parse(req.body);

      const amountCents = Math.round(body.amountUsd * 100);
      const result = await addCredits(
        req.user!.orgId,
        amountCents,
        body.stripePaymentIntentId,
        `Credit purchase $${body.amountUsd}`,
      );
      return reply.code(201).send({ data: result });
    },
  );

  // ── Credit transaction history ──────────────────────────────────────────────

  app.get(
    '/api/v1/billing/credits/history',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const { limit, offset } = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(req.query);

      const history = await getTransactionHistory(req.user!.orgId, limit, offset);
      return reply.send({ data: history });
    },
  );

  // ── Product usage summary ───────────────────────────────────────────────────

  app.get(
    '/api/v1/billing/usage',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const { period } = z
        .object({
          period: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        })
        .parse(req.query);

      const summary = await getOrgUsageSummary(req.user!.orgId, period);
      const totalCost = await computePeriodCost(req.user!.orgId, period);
      return reply.send({
        data: { period: period ?? currentPeriod(), products: summary, totalCostUsd: totalCost },
      });
    },
  );

  app.get(
    '/api/v1/billing/usage/:product',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const { product } = req.params as { product: string };
      if (!METER_PRODUCTS.includes(product as MeterProduct)) {
        return reply.code(400).send({ error: `Unknown product: ${product}` });
      }
      const { period } = z
        .object({
          period: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        })
        .parse(req.query);

      const usage = await getProductUsage(req.user!.orgId, product as MeterProduct, period);
      return reply.send({ data: { product, period: period ?? currentPeriod(), ...usage } });
    },
  );

  // ── Consolidated sub-account report ────────────────────────────────────────

  app.get(
    '/api/v1/billing/subaccounts/report',
    {
      preHandler: [app.authenticate, app.requireRole('owner')],
      schema: { tags: ['Billing'] },
    },
    async (req, reply) => {
      const { from, to } = z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .parse(req.query);

      const now = new Date();
      const periodStart = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = to ? new Date(to) : now;

      const report = await getConsolidatedReport(req.user!.orgId, periodStart, periodEnd);
      return reply.send({ data: report });
    },
  );
};

export default billingExtendedRoutes;
