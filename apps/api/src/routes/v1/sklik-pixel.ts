/**
 * Sklik retargeting pixel public endpoints (#422).
 *
 * Mounted alongside the rest of the API but intentionally outside any auth
 * gate — the snippet is embedded on customer websites and must work for
 * anonymous browsers. Identification arrives in the query string when the
 * customer page calls `forgemsg.identify({ email })`.
 *
 * Endpoints:
 *   GET /sklik-pixel/:siteToken.js          — JS snippet
 *   GET /sklik-pixel/:siteToken/event.gif   — 1×1 tracking pixel
 */

import type { FastifyInstance } from 'fastify';
import {
  generateSklikSnippet,
  parseTrackingEvent,
  recordPixelEvent,
  resolveTrackedSite,
} from '../../services/ads/providers/sklik/pixel.js';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export default async function sklikPixelRoutes(app: FastifyInstance) {
  app.get<{ Params: { siteTokenJs: string } }>(
    '/sklik-pixel/:siteTokenJs',
    {
      schema: {
        tags: ['Public', 'Sklik'],
        summary: 'Sklik retargeting JS snippet',
        params: {
          type: 'object',
          properties: { siteTokenJs: { type: 'string' } },
          required: ['siteTokenJs'],
        },
      },
    },
    async (request, reply) => {
      // Param is `<siteToken>.js`; strip the suffix.
      const raw = request.params.siteTokenJs;
      if (!raw.endsWith('.js')) {
        return reply.code(404).send();
      }
      const siteToken = raw.slice(0, -3);
      const site = await resolveTrackedSite(siteToken);
      if (!site || !site.trackingEnabled) {
        // Return a no-op script so we don't leak existence.
        reply
          .header('content-type', 'application/javascript; charset=utf-8')
          .header('cache-control', 'public, max-age=300');
        return reply.send('// disabled\n');
      }
      const snippet = generateSklikSnippet(siteToken, {
        endpointBase: process.env.API_BASE_URL ?? '',
      });
      reply
        .header('content-type', 'application/javascript; charset=utf-8')
        .header('cache-control', 'public, max-age=300');
      return reply.send(snippet);
    },
  );

  app.get<{ Params: { siteToken: string }; Querystring: Record<string, string> }>(
    '/sklik-pixel/:siteToken/event.gif',
    {
      schema: {
        tags: ['Public', 'Sklik'],
        summary: 'Sklik tracking pixel',
        params: {
          type: 'object',
          properties: { siteToken: { type: 'string' } },
          required: ['siteToken'],
        },
      },
    },
    async (request, reply) => {
      reply
        .header('content-type', 'image/gif')
        .header('cache-control', 'private, no-cache, no-store, must-revalidate, max-age=0')
        .header('pragma', 'no-cache')
        .header('expires', '0');

      const site = await resolveTrackedSite(request.params.siteToken);
      if (!site || !site.trackingEnabled) {
        return reply.send(TRANSPARENT_GIF);
      }

      const event = parseTrackingEvent(request.query as Record<string, unknown>);
      if (event) {
        // Fire-and-forget so the pixel response stays fast.
        void recordPixelEvent({ id: site.id, orgId: site.orgId }, event).catch((err) => {
          request.log.warn({ err, siteToken: request.params.siteToken }, 'sklik pixel record failed');
        });
      }
      return reply.send(TRANSPARENT_GIF);
    },
  );
}
