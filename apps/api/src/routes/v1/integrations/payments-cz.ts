import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { czPaymentGatewaySettings, czPaymentTransactions } from '../../../db/schema/payment-gateways-cz.js';
import { createGoPayPayment, verifyGoPayPayment } from '../../../services/integrations/gopay.js';
import { createComgatePayment, verifyComgatePayment } from '../../../services/integrations/comgate.js';
import { AppError } from '../../../lib/app-error.js';

export default async function czPaymentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/integrations/payments-cz/settings */
  app.get('/api/v1/integrations/payments-cz/settings', async (req) => {
    const [row] = await db.select({
      id: czPaymentGatewaySettings.id,
      orgId: czPaymentGatewaySettings.orgId,
      hasGopay: czPaymentGatewaySettings.gopayClientId,
      hasComgate: czPaymentGatewaySettings.comgateMerchant,
      gopayTestMode: czPaymentGatewaySettings.gopayTestMode,
      comgateTestMode: czPaymentGatewaySettings.comgateTestMode,
    }).from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId))
      .limit(1);
    return { data: row ?? null };
  });

  /** PUT /api/v1/integrations/payments-cz/settings */
  app.put('/api/v1/integrations/payments-cz/settings', async (req) => {
    const body = z.object({
      gopayClientId:     z.string().optional(),
      gopayClientSecret: z.string().optional(),
      gopayGoId:         z.string().optional(),
      gopayTestMode:     z.boolean().optional(),
      comgateMerchant:   z.string().optional(),
      comgateSecret:     z.string().optional(),
      comgateTestMode:   z.boolean().optional(),
    }).parse(req.body);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.gopayClientId !== undefined) patch['gopayClientId'] = body.gopayClientId;
    if (body.gopayClientSecret !== undefined) patch['gopayClientSecret'] = body.gopayClientSecret;
    if (body.gopayGoId !== undefined) patch['gopayGoId'] = body.gopayGoId;
    if (body.gopayTestMode !== undefined) patch['gopayTestMode'] = String(body.gopayTestMode);
    if (body.comgateMerchant !== undefined) patch['comgateMerchant'] = body.comgateMerchant;
    if (body.comgateSecret !== undefined) patch['comgateSecret'] = body.comgateSecret;
    if (body.comgateTestMode !== undefined) patch['comgateTestMode'] = String(body.comgateTestMode);

    const existing = await db.select({ id: czPaymentGatewaySettings.id })
      .from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId))
      .limit(1);

    let row;
    if (existing.length) {
      [row] = await db.update(czPaymentGatewaySettings)
        .set(patch as never)
        .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId))
        .returning();
    } else {
      [row] = await db.insert(czPaymentGatewaySettings)
        .values({ orgId: req.user!.orgId, ...patch } as never)
        .returning();
    }
    return { data: row };
  });

  /** GET /api/v1/integrations/payments-cz/transactions */
  app.get('/api/v1/integrations/payments-cz/transactions', async (req) => {
    const rows = await db.select().from(czPaymentTransactions)
      .where(eq(czPaymentTransactions.orgId, req.user!.orgId));
    return { data: rows };
  });

  /** POST /api/v1/integrations/payments-cz/gopay/create */
  app.post('/api/v1/integrations/payments-cz/gopay/create', async (req) => {
    const [settings] = await db.select().from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId)).limit(1);
    if (!settings?.gopayClientId) throw AppError.badRequest('GoPay not configured');

    const body = z.object({
      contactId:   z.string().uuid().optional(),
      amount:      z.number().int().positive(),
      currency:    z.string().default('CZK'),
      description: z.string().min(1).max(256),
      returnUrl:   z.string().url(),
      notifyUrl:   z.string().url(),
      email:       z.string().email().optional(),
    }).parse(req.body);

    const result = await createGoPayPayment(
      {
        clientId: settings.gopayClientId!,
        clientSecret: settings.gopayClientSecret!,
        goId: settings.gopayGoId!,
        testMode: settings.gopayTestMode === 'true',
      },
      { orgId: req.user!.orgId, ...body },
    );
    return { data: result };
  });

  /** POST /api/v1/integrations/payments-cz/gopay/:paymentId/verify */
  app.post('/api/v1/integrations/payments-cz/gopay/:paymentId/verify', async (req) => {
    const { paymentId } = z.object({ paymentId: z.string() }).parse(req.params);
    const [settings] = await db.select().from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId)).limit(1);
    if (!settings?.gopayClientId) throw AppError.badRequest('GoPay not configured');

    const result = await verifyGoPayPayment(
      {
        clientId: settings.gopayClientId!,
        clientSecret: settings.gopayClientSecret!,
        goId: settings.gopayGoId!,
        testMode: settings.gopayTestMode === 'true',
      },
      req.user!.orgId,
      paymentId,
    );
    return { data: result };
  });

  /** POST /api/v1/integrations/payments-cz/comgate/create */
  app.post('/api/v1/integrations/payments-cz/comgate/create', async (req) => {
    const [settings] = await db.select().from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId)).limit(1);
    if (!settings?.comgateMerchant) throw AppError.badRequest('Comgate not configured');

    const body = z.object({
      contactId:  z.string().uuid().optional(),
      price:      z.number().int().positive(),
      currency:   z.string().default('CZK'),
      label:      z.string().min(1).max(16),
      refId:      z.string().min(1).max(32),
      email:      z.string().email(),
      returnUrl:  z.string().url(),
      notifyUrl:  z.string().url(),
      method:     z.string().default('ALL'),
      country:    z.string().default('CZ'),
    }).parse(req.body);

    const result = await createComgatePayment(
      {
        merchant: settings.comgateMerchant!,
        secret: settings.comgateSecret!,
        testMode: settings.comgateTestMode === 'true',
      },
      { orgId: req.user!.orgId, ...body },
    );
    return { data: result };
  });

  /** POST /api/v1/integrations/payments-cz/comgate/:transId/verify */
  app.post('/api/v1/integrations/payments-cz/comgate/:transId/verify', async (req) => {
    const { transId } = z.object({ transId: z.string() }).parse(req.params);
    const [settings] = await db.select().from(czPaymentGatewaySettings)
      .where(eq(czPaymentGatewaySettings.orgId, req.user!.orgId)).limit(1);
    if (!settings?.comgateMerchant) throw AppError.badRequest('Comgate not configured');

    const result = await verifyComgatePayment(
      { merchant: settings.comgateMerchant!, secret: settings.comgateSecret!, testMode: settings.comgateTestMode === 'true' },
      req.user!.orgId,
      transId,
    );
    return { data: result };
  });
}
