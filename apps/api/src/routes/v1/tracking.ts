/**
 * Email tracking routes (public — no JWT auth, identified via signed tokens):
 *  - GET /track/o/:token  — open pixel (1×1 transparent GIF)
 *  - GET /track/c/:token  — click redirect (302 to original URL)
 *
 * These endpoints are intentionally outside the /api/v1 prefix because they
 * are embedded in sent emails and need stable, short URLs on the tracking domain.
 * Auth is enforced by the HMAC-signed token, not by session cookies.
 *
 * There used to be a third, GET /t/click/:linkId, which took the org and the
 * contact from the query string unsigned, recorded a click for them, ran a
 * "click action" decoded from the query (tag, field, workflow event) and
 * redirected to any `dest`. Nothing ever produced such a link — its builder,
 * services/campaigns/click-actions.ts, never had a caller and did not even put
 * the ids in the URL — so it was removed with its builder rather than secured
 * (Z93). Every click goes through the signed /track/c/:token above.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { campaigns, emailEvents } from '../../db/schema/index.js';
import { verifyTrackingToken, isAppleMpp } from '../../services/sending/tracking.js';
import { scoreAndPersist } from '../../services/deliverability/bot-detection.js';
import { enrichEventGeo } from '../../services/analytics/geo.js';
import { parseUserAgent } from '../../lib/user-agent.js';
import { emitEmailEvent } from '../../services/webhooks/email-events.js';
import { resolveCampaignCategory } from '../../services/stats/category-isp.js';
import { eq, and, isNull } from 'drizzle-orm';
import { abVariantForContact } from '../../services/campaigns/variant-attribution.js';

/**
 * 1×1 transparent GIF (35 bytes, base64-encoded).
 * Used as the tracking pixel response.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * The campaign an open or click belongs to — or none.
 *
 * The token's campaignId is required and is whatever the batch job carried.
 * For a flow's templated email that is not a campaign at all: the workflow
 * dispatch fills it with the org id (BatchSenderJobData.campaignIsPlaceholder).
 * Written as-is, the email_events foreign key to campaigns refused the row and
 * the insert's catch swallowed it, so no open or click on a flow email was ever
 * recorded. Resolved here rather than in the token so the emails already in
 * inboxes, whose tokens carry the org id, are counted too.
 *
 * A lookup that fails keeps the token's value — what this route did before.
 */
async function campaignOf(orgId: string, campaignId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return campaignId;
  }
}

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
        const campaignId = await campaignOf(payload.orgId, payload.campaignId);
        const mpp = isAppleMpp(userAgent);
        const { deviceType, emailClient } = parseUserAgent(userAgent);

        const [row] = await db
          .insert(emailEvents)
          .values({
            orgId: payload.orgId,
            campaignId,
            contactId: payload.contactId,
            eventType: 'open',
            // Recovered from the send row — the token cannot carry it.
            abVariantId: campaignId ? abVariantForContact(campaignId, payload.contactId) : null,
            userAgent: userAgent.slice(0, 1024),
            ipAddress: ipAddress?.slice(0, 45) ?? null,
            deviceType,
            emailClient,
            category: await resolveCampaignCategory(payload.orgId, campaignId).catch(() => null),
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
            campaignId,
            contactId: payload.contactId,
            occurredAt: new Date(),
          }).catch(() => {});
          enrichEventGeo(row.id, ipAddress).catch(() => {});
          emitEmailEvent(payload.orgId, 'opened', {
            contactId: payload.contactId,
            campaignId,
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
        return reply.redirect(process.env.APP_URL ?? 'https://example.invalid', 302);
      }

      const now = new Date();
      const campaignId = await campaignOf(payload.orgId, payload.campaignId);
      const sameCampaign = campaignId
        ? eq(emailEvents.campaignId, campaignId)
        : isNull(emailEvents.campaignId);

      // Fetch recent open (time + IP) for cluster + same-IP detection
      const [recentOpen] = await db
        .select({
          id: emailEvents.id,
          createdAt: emailEvents.createdAt,
          ipAddress: emailEvents.ipAddress,
        })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, payload.orgId),
            eq(emailEvents.contactId, payload.contactId ?? ''),
            sameCampaign,
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
            sameCampaign,
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
          campaignId,
          contactId: payload.contactId,
          eventType: 'click',
          abVariantId: campaignId ? abVariantForContact(campaignId, payload.contactId) : null,
          linkUrl: payload.url.slice(0, 2048),
          userAgent: userAgent.slice(0, 1024),
          ipAddress: ipAddress?.slice(0, 45) ?? null,
          deviceType: click.deviceType,
          emailClient: click.emailClient,
          category: await resolveCampaignCategory(payload.orgId, campaignId).catch(() => null),
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
          campaignId,
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
          campaignId,
          url: payload.url,
        });
      }

      return reply.redirect(payload.url, 302);
    },
  );
}
