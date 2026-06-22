import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeContactSendTime, getPrediction, nextOptimalSendTime } from '../../services/send-optimization/per-contact-sto.js';

export default async function perContactStoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/contacts/:contactId/best-send-time
   * Returns cached prediction (null if not yet computed).
   */
  app.get('/api/v1/contacts/:contactId/best-send-time', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const pred = await getPrediction(req.user!.orgId, contactId);

    if (!pred) return { data: null };

    const nextOptimal = nextOptimalSendTime(pred.bestHourUtc, new Date());
    return {
      data: {
        bestHourUtc: pred.bestHourUtc,
        secondBestHourUtc: pred.secondBestHourUtc,
        confidence: pred.confidence,
        sampleSize: pred.sampleSize,
        nextOptimalSend: nextOptimal.toISOString(),
        hourlyOpenRates: pred.hourlyOpenRates ? JSON.parse(pred.hourlyOpenRates) : null,
        computedAt: pred.computedAt,
      },
    };
  });

  /**
   * POST /api/v1/contacts/:contactId/best-send-time/compute
   * Recomputes prediction from email open history.
   */
  app.post('/api/v1/contacts/:contactId/best-send-time/compute', async (req) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const pred = await computeContactSendTime(req.user!.orgId, contactId);
    const nextOptimal = nextOptimalSendTime(pred.bestHourUtc, new Date());
    return {
      data: {
        bestHourUtc: pred.bestHourUtc,
        confidence: pred.confidence,
        sampleSize: pred.sampleSize,
        nextOptimalSend: nextOptimal.toISOString(),
      },
    };
  });

  /**
   * POST /api/v1/send-optimization/batch-compute
   * Recompute predictions for multiple contacts.
   */
  app.post('/api/v1/send-optimization/batch-compute', async (req) => {
    const body = z.object({
      contactIds: z.array(z.string().uuid()).max(200),
    }).parse(req.body);

    const results = await Promise.allSettled(
      body.contactIds.map((id) => computeContactSendTime(req.user!.orgId, id)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    return { data: { total: body.contactIds.length, succeeded } };
  });

  /**
   * GET /api/v1/smart-sending/cz-holidays
   * List Czech public holidays for a given year (for UI display / blacklist preview).
   */
  app.get('/api/v1/smart-sending/cz-holidays', async (req) => {
    const q = z.object({
      year: z.coerce.number().int().min(2024).max(2035).default(new Date().getFullYear()),
      country: z.enum(['cz', 'sk']).default('cz'),
    }).parse(req.query);

    const { getCzHolidays } = await import('../../services/smart-sending/cz-holidays.js');
    const holidays = getCzHolidays(q.year, q.country);
    return { data: { year: q.year, country: q.country, holidays } };
  });
}
