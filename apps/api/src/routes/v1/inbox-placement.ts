import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { inboxPlacementTests } from '../../db/schema/inbox-placement.js';
import { simulateInboxPlacement } from '../../services/deliverability/inbox-placement-sim.js';

export default async function inboxPlacementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/inbox-placement — list past tests */
  app.get('/api/v1/inbox-placement', async (req) => {
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(req.query);
    const rows = await db
      .select()
      .from(inboxPlacementTests)
      .where(eq(inboxPlacementTests.orgId, req.user!.orgId))
      .orderBy(desc(inboxPlacementTests.testedAt))
      .limit(q.limit);
    return { data: rows };
  });

  /** POST /api/v1/inbox-placement/test — run a new placement simulation */
  app.post('/api/v1/inbox-placement/test', async (req) => {
    const body = z
      .object({
        subject: z.string().min(1).max(300),
        html: z.string().min(1),
        fromEmail: z.string().email(),
        campaignId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const result = await simulateInboxPlacement(
      req.user!.orgId,
      body.subject,
      body.html,
      body.fromEmail,
      body.campaignId,
    );

    return { data: result };
  });

  /** GET /api/v1/inbox-placement/:id — get a specific test result */
  app.get('/api/v1/inbox-placement/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db
      .select()
      .from(inboxPlacementTests)
      .where(and(eq(inboxPlacementTests.id, id), eq(inboxPlacementTests.orgId, req.user!.orgId)))
      .limit(1);
    return { data: row ?? null };
  });
}
