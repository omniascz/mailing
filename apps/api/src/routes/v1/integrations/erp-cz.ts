import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { erpConnections, erpSyncLog } from '../../../db/schema/erp-sync.js';
import { syncPohodaContacts, syncPohodaInvoices } from '../../../services/integrations/pohoda.js';
import { syncFlexibeeContacts, syncFlexibeeInvoices } from '../../../services/integrations/flexibee.js';
import { AppError } from '../../../lib/app-error.js';

export default async function erpCzRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/integrations/erp — list ERP connections */
  app.get('/api/v1/integrations/erp', async (req) => {
    const rows = await db.select({
      id: erpConnections.id,
      name: erpConnections.name,
      type: erpConnections.type,
      status: erpConnections.status,
      lastSyncAt: erpConnections.lastSyncAt,
      syncedContacts: erpConnections.syncedContacts,
      syncedOrders: erpConnections.syncedOrders,
      syncedInvoices: erpConnections.syncedInvoices,
    }).from(erpConnections)
      .where(eq(erpConnections.orgId, req.user!.orgId));
    return { data: rows };
  });

  const erpConnectionSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['pohoda', 'flexibee', 'money_s3']),
    pohodaUrl:      z.string().url().optional(),
    pohodaUsername: z.string().optional(),
    pohodaPassword: z.string().optional(),
    pohodaIco:      z.string().optional(),
    flexibeeUrl:      z.string().url().optional(),
    flexibeeUsername: z.string().optional(),
    flexibeePassword: z.string().optional(),
    flexibeeCompany:  z.string().optional(),
  });

  /** POST /api/v1/integrations/erp — create connection */
  app.post('/api/v1/integrations/erp', async (req, reply) => {
    const body = erpConnectionSchema.parse(req.body);
    const [row] = await db.insert(erpConnections)
      .values({ orgId: req.user!.orgId, ...body })
      .returning();
    return reply.status(201).send({ data: row });
  });

  /** DELETE /api/v1/integrations/erp/:id */
  app.delete('/api/v1/integrations/erp/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(erpConnections)
      .where(and(eq(erpConnections.id, id), eq(erpConnections.orgId, req.user!.orgId)));
    return reply.status(204).send();
  });

  /** POST /api/v1/integrations/erp/:id/sync */
  app.post('/api/v1/integrations/erp/:id/sync', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [conn] = await db.select().from(erpConnections)
      .where(and(eq(erpConnections.id, id), eq(erpConnections.orgId, req.user!.orgId)))
      .limit(1);
    if (!conn) throw AppError.notFound('ERP connection not found');

    let contacts = 0;
    let invoices = 0;

    if (conn.type === 'pohoda') {
      if (!conn.pohodaUrl || !conn.pohodaUsername) throw AppError.badRequest('Pohoda settings incomplete');
      const settings = {
        url: conn.pohodaUrl,
        username: conn.pohodaUsername,
        password: conn.pohodaPassword ?? '',
        ico: conn.pohodaIco ?? '',
      };
      const [c, i] = await Promise.all([
        syncPohodaContacts(req.user!.orgId, id, settings),
        syncPohodaInvoices(req.user!.orgId, id, settings),
      ]);
      contacts = c.count;
      invoices = i.count;
    } else if (conn.type === 'flexibee') {
      if (!conn.flexibeeUrl || !conn.flexibeeUsername) throw AppError.badRequest('FlexiBee settings incomplete');
      const settings = {
        url: conn.flexibeeUrl,
        username: conn.flexibeeUsername,
        password: conn.flexibeePassword ?? '',
        company: conn.flexibeeCompany ?? '',
      };
      const [c, i] = await Promise.all([
        syncFlexibeeContacts(req.user!.orgId, id, settings).then((r) => r.length),
        syncFlexibeeInvoices(req.user!.orgId, id, settings),
      ]);
      contacts = c;
      invoices = i;
    }

    await db.update(erpConnections)
      .set({ lastSyncAt: new Date(), syncedContacts: contacts, syncedInvoices: invoices, updatedAt: new Date() })
      .where(eq(erpConnections.id, id));

    return { data: { contacts, invoices } };
  });

  /** GET /api/v1/integrations/erp/:id/logs */
  app.get('/api/v1/integrations/erp/:id/logs', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const logs = await db.select().from(erpSyncLog)
      .where(and(eq(erpSyncLog.connectionId, id), eq(erpSyncLog.orgId, req.user!.orgId)))
      .orderBy(desc(erpSyncLog.startedAt))
      .limit(50);
    return { data: logs };
  });
}
