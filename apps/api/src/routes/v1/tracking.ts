/**
 * Email tracking routes (public — no JWT auth, identified via signed tokens):
 *  - GET /track/o/:token  — open pixel (1×1 transparent GIF)
 *  - GET /track/c/:token  — click redirect (302 to original URL)
 *
 * These endpoints are intentionally outside the /api/v1 prefix because they
 * are embedded in sent emails and need stable, short URLs on the tracking domain.
 * Auth is enforced by the HMAC-signed token, not by session cookies.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { verifyTrackingToken, isAppleMpp } from '../../services/sending/tracking.js';
import { scoreAndPersist } from '../../services/deliverability/bot-detection.js';
import { enrichEventGeo } from '../../services/analytics/geo.js';
import { parseUserAgent } from '../../lib/user-agent.js';
import { emitEmailEvent } from '../../services/webhooks/email-events.js';
import { resolveCampaignCategory } from '../../services/stats/category-isp.js';
import { eq, and } from 'drizzle-orm';

/**
 * 1×1 transparent GIF (35 bytes, base64-encoded).
 * Used as the tracking pixel response.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export default async function trackingRoutes(app: FastifyInstance) {
  /**
   * GET /track/o/:token
   *
   * Returns a 1×1 transparent GIF and records an 'open' event.
   * Should never be cached — include strong no-cache headers.
   *
   * Detects Apple Mail Privacy Protection and flags the event accordingly.
   */
  app.get(
    '/track/o/:token',
    {
      schema: {
        tags: ['Tracking'],
        summary: 'Email open pixel',
        params: { type: 'object', properties: { token: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const userAgent = req.headers['user-agent'] ?? '';
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        null;

      // Always return the GIF immediately — tracking is best-effort
      reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .header('X-Content-Type-Options', 'nosniff');

      const payload = verifyTrackingToken(token);
      if (payload && payload.type === 'open') {
        const mpp = isAppleMpp(userAgent);
        const { deviceType, emailClient } = parseUserAgent(userAgent);

        const [row] = await db
          .insert(emailEvents)
          .values({
            orgId: payload.orgId,
            campaignId: payload.campaignId,
            contactId: payload.contactId,
            eventType: 'open',
            userAgent: userAgent.slice(0, 1024),
            ipAddress: ipAddress?.slice(0, 45) ?? null,
            deviceType,
            emailClient,
            category: await resolveCampaignCategory(payload.orgId, payload.campaignId).catch(
              () => null,
            ),
            metadata: {
              suspectedBot: mpp,
              botReason: mpp ? 'apple_mpp' : null,
            },
          })
          .returning({ id: emailEvents.id })
          .catch(() => []);

        // BotSense scoring + geo enrichment — async, non-blocking (#484)
        if (row?.id) {
          scoreAndPersist(row.id, {
            eventType: 'open',
            userAgent,
            ipAddress,
            campaignId: payload.campaignId,
            contactId: payload.contactId,
            occurredAt: new Date(),
          }).catch(() => {});
          enrichEventGeo(row.id, ipAddress).catch(() => {});
          emitEmailEvent(payload.orgId, 'opened', {
            contactId: payload.contactId,
            campaignId: payload.campaignId,
          });
        }
      }

      return reply.send(TRANSPARENT_GIF);
    },
  );

  /**
   * GET /track/c/:token
   *
   * Logs a click event then 302-redirects to the original URL embedded in the token.
   * If the token is invalid, redirects to the platform homepage as a safe fallback.
   */
  app.get(
    '/track/c/:token',
    {
      schema: {
        tags: ['Tracking'],
        summary: 'Email click redirect',
        params: { type: 'object', properties: { token: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const userAgent = req.headers['user-agent'] ?? '';
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        null;

      const payload = verifyTrackingToken(token);

      if (!payload || payload.type !== 'click') {
        // Invalid token — redirect to safe fallback
        return reply.redirect(process.env.APP_URL ?? 'https://forgemsg.com', 302);
      }

      const now = new Date();

      // Fetch recent open (time + IP) for cluster + same-IP detection
      const [recentOpen] = await db
        .select({ id: emailEvents.id, createdAt: emailEvents.createdAt, ipAddress: emailEvents.ipAddress })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, payload.orgId),
            eq(emailEvents.contactId, payload.contactId ?? ''),
            eq(emailEvents.campaignId, payload.campaignId ?? ''),
            eq(emailEvents.eventType, 'open'),
          ),
        )
        .limit(1)
        .catch(() => []);

      const recentClicks = await db
        .select({ createdAt: emailEvents.createdAt, linkUrl: emailEvents.linkUrl })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, payload.orgId),
            eq(emailEvents.contactId, payload.contactId ?? ''),
            eq(emailEvents.campaignId, payload.campaignId ?? ''),
            eq(emailEvents.eventType, 'click'),
          ),
        )
        .limit(20)
        .catch(() => []);

      // Log the click event (best-effort)
      const click = parseUserAgent(userAgent);
      const [clickRow] = await db
        .insert(emailEvents)
        .values({
          orgId: payload.orgId,
          campaignId: payload.campaignId,
          contactId: payload.contactId,
          eventType: 'click',
          linkUrl: payload.url.slice(0, 2048),
          userAgent: userAgent.slice(0, 1024),
          ipAddress: ipAddress?.slice(0, 45) ?? null,
          deviceType: click.deviceType,
          emailClient: click.emailClient,
          category: await resolveCampaignCategory(payload.orgId, payload.campaignId).catch(
            () => null,
          ),
          metadata: {},
        })
        .returning({ id: emailEvents.id })
        .catch(() => []);

      // BotSense scoring — async, non-blocking (#484)
      if (clickRow?.id) {
        scoreAndPersist(clickRow.id, {
          eventType: 'click',
          userAgent,
          ipAddress,
          campaignId: payload.campaignId,
          contactId: payload.contactId,
          occurredAt: now,
          openOccurredAt: recentOpen?.createdAt ?? undefined,
          openIpAddress: recentOpen?.ipAddress ?? undefined,
          linkUrl: payload.url,
          recentClicksSameMessage: recentClicks.map((c) => ({
            occurredAt: c.createdAt ?? now,
            linkUrl: c.linkUrl,
          })),
        }).catch(() => {});
        enrichEventGeo(clickRow.id, ipAddress).catch(() => {});
        emitEmailEvent(payload.orgId, 'clicked', {
          contactId: payload.contactId,
          campaignId: payload.campaignId,
          url: payload.url,
        });
      }

      return reply.redirect(payload.url, 302);
    },
  );

  /**
   * GET /t/click/:linkId
   *
   * Click-action tracking endpoint (#216).
   * Executes an optional click action (add_tag / update_field / fire_event)
   * for the identified contact, then 302-redirects to the destination URL.
   *
   * Query params:
   *   action  — base64url-encoded ClickAction JSON
   *   dest    — destination URL (URL-encoded)
   *   cid     — contactId (UUID)
   *   oid     — orgId (UUID)
   */
  app.get(
    '/t/click/:linkId',
    { schema: { tags: ['Tracking'], summary: 'Click-action redirect (#216)' } },
    async (req, reply) => {
      const { linkId } = req.params as { linkId: string };
      const { action, dest, cid, oid } = req.query as {
        action?: string;
        dest?: string;
        cid?: string;
        oid?: string;
      };

      const destination = dest
        ? decodeURIComponent(dest)
        : (process.env.APP_URL ?? 'https://forgemsg.com');

      // Execute click action best-effort (non-blocking on failure)
      if (action && cid && oid) {
        try {
          const { decodeClickAction, executeClickAction } =
            await import('../../services/campaigns/click-actions.js');
          const parsed = decodeClickAction(action);
          if (parsed) {
            executeClickAction(oid, cid, parsed).catch(() => undefined);
          }
        } catch {
          // non-fatal
        }
      }

      // Log click event if we have enough context
      if (cid && oid) {
        const ca = parseUserAgent(req.headers['user-agent'] ?? '');
        await db
          .insert(emailEvents)
          .values({
            orgId: oid,
            contactId: cid,
            eventType: 'click',
            linkUrl: destination.slice(0, 2048),
            userAgent: (req.headers['user-agent'] ?? '').slice(0, 1024),
            ipAddress: (
              (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
              req.socket.remoteAddress ??
              ''
            ).slice(0, 45),
            deviceType: ca.deviceType,
            emailClient: ca.emailClient,
            metadata: { linkId },
          })
          .catch(() => undefined);
      }

      return reply.redirect(destination, 302);
    },
  );
}
