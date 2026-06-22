import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createShipment,
  syncShipmentStatus,
  listShipments,
  packetaTrackingUrl,
} from '../../../services/integrations/packeta.js';
import { AppError } from '../../../lib/app-error.js';

const PACKETA_ENV_KEY = (orgId: string) => `PACKETA_API_KEY_${orgId}`;

function getSettings(orgId: string) {
  // In production, keys are org-scoped secrets from the vault/env
  const apiKey = process.env[PACKETA_ENV_KEY(orgId)] ?? process.env['PACKETA_API_KEY'] ?? '';
  if (!apiKey) throw AppError.badRequest('Packeta API key not configured');
  return { apiKey };
}

export default async function packetaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/integrations/packeta/shipments */
  app.get('/api/v1/integrations/packeta/shipments', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const rows = await listShipments(req.user!.orgId, q.limit);
    return { data: rows };
  });

  /** POST /api/v1/integrations/packeta/shipments — create shipment */
  app.post('/api/v1/integrations/packeta/shipments', async (req, reply) => {
    const body = z.object({
      contactId:      z.string().uuid().optional(),
      orderId:        z.string().optional(),
      recipientName:  z.string().min(1).max(100),
      recipientEmail: z.string().email().optional(),
      recipientPhone: z.string().optional(),
      pickupPointId:  z.string().min(1),
      value:          z.number().positive(),
      currency:       z.string().default('CZK'),
      cod:            z.number().min(0).optional(),
      weight:         z.number().positive().optional(),
    }).parse(req.body);

    const settings = getSettings(req.user!.orgId);
    const shipment = await createShipment(req.user!.orgId, settings, body);
    return reply.status(201).send({ data: shipment });
  });

  /** POST /api/v1/integrations/packeta/shipments/:barcode/sync */
  app.post('/api/v1/integrations/packeta/shipments/:barcode/sync', async (req) => {
    const { barcode } = z.object({ barcode: z.string().min(1) }).parse(req.params);
    const settings = getSettings(req.user!.orgId);
    const updated = await syncShipmentStatus(req.user!.orgId, settings, barcode);
    return { data: updated };
  });

  /** GET /api/v1/integrations/packeta/track/:barcode */
  app.get('/api/v1/integrations/packeta/track/:barcode', async (req) => {
    const { barcode } = z.object({ barcode: z.string().min(1) }).parse(req.params);
    return { data: { trackingUrl: packetaTrackingUrl(barcode) } };
  });
}
