/**
 * Double opt-in flow + unsubscribe engine.
 *
 * Double opt-in:
 *   POST /api/v1/lists/:listId/subscribe  → creates or finds a contact,
 *     generates a 48h Redis token, queues a confirmation email (stub).
 *   GET  /api/v1/confirm/:token           → activates contact in the list,
 *     redirects to thank-you page.
 *
 * Unsubscribe (RFC 8058 one-click):
 *   POST /api/v1/unsubscribe              → {token} in body, instant opt-out.
 *   GET  /api/v1/unsubscribe/:token       → confirms unsubscribe, HTML response.
 *
 * Preference centre:
 *   GET  /api/v1/preferences/:token       → returns contact's list memberships.
 *   POST /api/v1/preferences/:token       → update list preferences.
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  lists,
  contactLists,
  suppressions,
  organizations,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { AppError } from '../../lib/app-error.js';
import { t, resolveLocale, verifyTrackingToken, type SupportedLocale } from '@forgemsg/shared';

const DOI_TTL = 60 * 60 * 48; // 48 hours
const UNSUB_TTL = 60 * 60 * 24 * 7; // 7 days

function doiKey(token: string) {
  return `doi:${token}`;
}
function unsubKey(token: string) {
  return `unsub:${token}`;
}
function prefKey(token: string) {
  return `pref:${token}`;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function htmlPage(title: string, body: string, locale: SupportedLocale = 'cs') {
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:500px;margin:60px auto;padding:0 20px;color:#1e293b}h1{color:#0f172a}p{color:#475569}.btn{display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;margin-top:16px}</style></head><body>${body}</body></html>`;
}

/** Resolve the page locale: org setting → contact custom_fields.locale → Accept-Language. */
async function resolvePageLocale(
  req: FastifyRequest,
  orgId?: string,
  contactId?: string,
): Promise<SupportedLocale> {
  const acceptLanguage = req.headers['accept-language'] ?? null;
  let orgLocale: string | null = null;
  let contactLocale: string | null = null;

  if (orgId) {
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    if (typeof settings.locale === 'string') orgLocale = settings.locale;
  }

  if (contactId) {
    const [c] = await db
      .select({ customFields: contacts.customFields })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    const cf = (c?.customFields ?? {}) as Record<string, unknown>;
    if (typeof cf.locale === 'string') contactLocale = cf.locale;
  }

  return resolveLocale({ orgLocale, contactLocale, acceptLanguage });
}

/** Build an i18n'd page from a section key: returns [title, bodyHTML]. */
function pageFromKey(
  section:
    | 'doi_confirmed_page'
    | 'doi_expired_page'
    | 'unsubscribe_page'
    | 'unsubscribe_invalid_page',
  locale: SupportedLocale,
): { title: string; html: string } {
  const title = t(`${section}.title`, locale);
  const heading = t(`${section}.heading`, locale);
  const body = t(`${section}.body`, locale);
  return {
    title,
    html: htmlPage(title, `<h1>${heading}</h1><p>${body}</p>`, locale),
  };
}

export default async function subscriptionRoutes(app: FastifyInstance) {
  // ── Double opt-in subscribe ───────────────────────────────────────────────

  /**
   * POST /api/v1/lists/:listId/subscribe
   * Create/find a contact for the org that owns the list, generate a DOI token.
   * This endpoint is public (no auth) so it can be called from landing pages.
   */
  app.post(
    '/api/v1/lists/:listId/subscribe',
    { schema: { tags: ['Subscriptions'], summary: 'Subscribe to a list (double opt-in)' } },
    async (req, reply) => {
      const { listId } = z.object({ listId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          email: z.string().email().max(255),
          firstName: z.string().max(100).optional(),
          lastName: z.string().max(100).optional(),
        })
        .parse(req.body);

      // Resolve list → org
      const [list] = await db
        .select()
        .from(lists)
        .where(and(eq(lists.id, listId), isNull(lists.deletedAt)))
        .limit(1);
      if (!list) throw AppError.notFound('List');

      const orgId = list.orgId;

      // Find or create contact (pending)
      let [contact] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.email, body.email.toLowerCase()),
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);

      if (!contact) {
        const [c] = await db
          .insert(contacts)
          .values({
            orgId,
            email: body.email.toLowerCase(),
            firstName: body.firstName,
            lastName: body.lastName,
            status: 'pending',
            source: 'double_optin',
          })
          .returning();
        contact = c!;
      }

      // Generate and store DOI token
      const token = crypto.randomUUID();
      await redis.setex(
        doiKey(token),
        DOI_TTL,
        JSON.stringify({ contactId: contact.id, listId, orgId }),
      );

      // Send confirmation email via the transactional pipeline.
      const apiPublicUrl =
        process.env.API_PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:3001';
      const confirmUrl = `${apiPublicUrl}/api/v1/confirm/${token}`;
      const greeting = body.firstName ? `Hi ${body.firstName},` : 'Hi,';

      try {
        await sendTransactionalEmail({
          to: body.email,
          toName: [body.firstName, body.lastName].filter(Boolean).join(' ') || undefined,
          from: process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com',
          fromName: list.name,
          subject: `Confirm your subscription to ${list.name}`,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1e293b">
<p style="font-size:16px">${greeting}</p>
<p style="font-size:16px">You signed up to receive emails from <strong>${list.name}</strong>. Click below to confirm.</p>
<p style="margin:32px 0"><a href="${confirmUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
<p style="font-size:13px;color:#64748b">If you didn't sign up, ignore this — no further messages will arrive. The link expires in 48 hours.</p>
</body></html>`,
          text: `${greeting}\n\nYou signed up to receive emails from ${list.name}. Confirm here:\n${confirmUrl}\n\nLink expires in 48 hours.`,
          orgId,
          contactId: contact.id,
        });
      } catch (err) {
        app.log.error({ err, event: 'doi_email_enqueue_failed', email: body.email, listId });
      }

      app.log.info({ event: 'doi_token_generated', token, email: body.email, listId });

      return reply.code(202).send({
        data: {
          message: 'Confirmation email sent. Please check your inbox.',
          // Dev-only convenience — exposes the token + URL so testers
          // don't need an inbox to follow the flow.
          ...(process.env.NODE_ENV !== 'production' && {
            _devToken: token,
            _confirmUrl: confirmUrl,
          }),
        },
      });
    },
  );

  /**
   * GET /api/v1/confirm/:token
   * Confirm DOI — activate contact in the list, redirect to thank-you page.
   */
  app.get(
    '/api/v1/confirm/:token',
    { schema: { tags: ['Subscriptions'], summary: 'Confirm double opt-in' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
      const raw = await redis.get(doiKey(token));

      if (!raw) {
        const locale = await resolvePageLocale(req);
        const page = pageFromKey('doi_expired_page', locale);
        return reply.code(400).header('Content-Type', 'text/html').send(page.html);
      }

      const { contactId, listId, orgId } = JSON.parse(raw) as {
        contactId: string;
        listId: string;
        orgId: string;
      };

      // Activate contact
      await db
        .update(contacts)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));

      // Add to list (confirmed)
      await db
        .insert(contactLists)
        .values({ contactId, listId, confirmedAt: new Date() })
        .onConflictDoNothing();

      await redis.del(doiKey(token));

      // Redirect to list's thank-you page or default
      const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
      const thankYouUrl = list?.thankYouUrl;
      if (thankYouUrl) return reply.redirect(thankYouUrl);

      const locale = await resolvePageLocale(req, orgId, contactId);
      const page = pageFromKey('doi_confirmed_page', locale);
      return reply.header('Content-Type', 'text/html').send(page.html);
    },
  );

  // ── Unsubscribe ───────────────────────────────────────────────────────────

  const unsubTokenSchema = z.string().min(1).max(1024);

  /**
   * POST /api/v1/unsubscribe
   * List-Unsubscribe-Post handler with the token in the JSON body.
   * Accepts both signed stateless tokens and legacy UUID tokens.
   */
  app.post(
    '/api/v1/unsubscribe',
    { schema: { tags: ['Subscriptions'], summary: 'One-click unsubscribe (RFC 8058)' } },
    async (req, reply) => {
      const { token } = z.object({ token: unsubTokenSchema }).parse(req.body);
      await processUnsubscribe(token);
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/unsubscribe/:token
   * RFC 8058 one-click: mailbox providers (Gmail/Yahoo) POST directly to the
   * URL in the List-Unsubscribe header with body `List-Unsubscribe=One-Click`.
   * The token lives in the path, so we ignore the body entirely. Always 204
   * (idempotent) so a provider retry never surfaces an error to the user.
   */
  app.post(
    '/api/v1/unsubscribe/:token',
    { schema: { tags: ['Subscriptions'], summary: 'One-click unsubscribe (RFC 8058, token in path)' } },
    async (req, reply) => {
      const { token } = z.object({ token: unsubTokenSchema }).parse(req.params);
      try {
        await processUnsubscribe(token);
      } catch {
        // Swallow — never 4xx a provider one-click POST.
      }
      return reply.code(204).send();
    },
  );

  /**
   * GET /api/v1/unsubscribe/:token
   * Browser-friendly unsubscribe confirmation page.
   */
  app.get(
    '/api/v1/unsubscribe/:token',
    { schema: { tags: ['Subscriptions'], summary: 'Unsubscribe confirmation page' } },
    async (req, reply) => {
      const { token } = z.object({ token: unsubTokenSchema }).parse(req.params);
      try {
        const { contactId, orgId } = await processUnsubscribe(token);
        const locale = await resolvePageLocale(req, orgId, contactId);
        const page = pageFromKey('unsubscribe_page', locale);
        return reply.header('Content-Type', 'text/html').send(page.html);
      } catch {
        const locale = await resolvePageLocale(req);
        const page = pageFromKey('unsubscribe_invalid_page', locale);
        return reply.code(400).header('Content-Type', 'text/html').send(page.html);
      }
    },
  );

  // ── Preference centre ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/preferences/:token
   * Return list memberships so the contact can manage their subscriptions.
   */
  app.get(
    '/api/v1/preferences/:token',
    { schema: { tags: ['Subscriptions'], summary: 'Get subscription preferences' } },
    async (req) => {
      const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
      const { contactId, orgId } = await resolveUnsubToken(token);

      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
        .limit(1);
      if (!contact) throw AppError.notFound('Contact');

      const memberships = await db
        .select({
          list: lists,
          addedAt: contactLists.addedAt,
          confirmedAt: contactLists.confirmedAt,
        })
        .from(contactLists)
        .innerJoin(lists, and(eq(lists.id, contactLists.listId), isNull(lists.deletedAt)))
        .where(eq(contactLists.contactId, contactId));

      return {
        data: {
          email: contact.email,
          status: contact.status,
          memberships: memberships.map((m) => ({
            listId: m.list.id,
            listName: m.list.name,
            addedAt: m.addedAt,
            confirmedAt: m.confirmedAt,
          })),
        },
      };
    },
  );

  /**
   * POST /api/v1/preferences/:token
   * Update list preferences: { unsubscribe_all: true } or { list_ids_to_remove: string[] }
   */
  app.post(
    '/api/v1/preferences/:token',
    { schema: { tags: ['Subscriptions'], summary: 'Update subscription preferences' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          unsubscribeAll: z.boolean().optional(),
          listIdsToRemove: z.array(z.string().uuid()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);

      const { contactId, orgId } = await resolveUnsubToken(token);

      if (body.unsubscribeAll) {
        await db
          .update(contacts)
          .set({ status: 'unsubscribed', updatedAt: new Date() })
          .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));

        // Auto-add to suppression list
        const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
        if (c?.email) {
          await db
            .insert(suppressions)
            .values({ orgId, email: c.email, reason: 'unsubscribe', notes: body.reason })
            .onConflictDoNothing();
        }
      } else if (body.listIdsToRemove?.length) {
        // Remove from specific lists only
        for (const listId of body.listIdsToRemove) {
          await db
            .delete(contactLists)
            .where(and(eq(contactLists.contactId, contactId), eq(contactLists.listId, listId)));
        }
      }

      return reply.code(204).send();
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve an unsubscribe token to a contact. Accepts two formats:
 *   1. Signed, stateless tracking token (`type:'unsub'`) — emitted by bulk
 *      sends (batch-sender) with no per-recipient Redis write.
 *   2. Legacy random-UUID token stored in Redis (`generateUnsubscribeToken`).
 * Returns null when neither resolves.
 */
async function decodeUnsubToken(
  token: string,
): Promise<{ contactId: string; orgId: string; redisBacked: boolean } | null> {
  const payload = verifyTrackingToken(token);
  if (payload && payload.type === 'unsub') {
    return { contactId: payload.contactId, orgId: payload.orgId, redisBacked: false };
  }
  const raw = await redis.get(unsubKey(token));
  if (raw) {
    const parsed = JSON.parse(raw) as { contactId: string; orgId: string };
    return { ...parsed, redisBacked: true };
  }
  return null;
}

async function resolveUnsubToken(token: string): Promise<{ contactId: string; orgId: string }> {
  const decoded = await decodeUnsubToken(token);
  if (!decoded) throw AppError.badRequest('Invalid or expired unsubscribe token');
  return { contactId: decoded.contactId, orgId: decoded.orgId };
}

async function processUnsubscribe(token: string): Promise<{ contactId: string; orgId: string }> {
  const decoded = await decodeUnsubToken(token);
  if (!decoded) throw AppError.badRequest('Invalid or expired unsubscribe token');

  const { contactId, orgId } = decoded;

  const [contact] = await db
    .update(contacts)
    .set({ status: 'unsubscribed', updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .returning();

  if (contact?.email) {
    await db
      .insert(suppressions)
      .values({ orgId, email: contact.email, reason: 'unsubscribe' })
      .onConflictDoNothing();
    const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
    emitEmailEvent(orgId, 'unsubscribed', { contactId, email: contact.email });
  }

  // Single-use only for the stateful (Redis) tokens; signed tokens are
  // idempotent and safe to leave (unsubscribe is a no-op once applied).
  if (decoded.redisBacked) await redis.del(unsubKey(token));
  return { contactId, orgId };
}

/**
 * Generate an unsubscribe token for a contact (called when sending emails).
 * Token is stored in Redis for 7 days.
 */
export async function generateUnsubscribeToken(contactId: string, orgId: string): Promise<string> {
  const token = crypto.randomUUID();
  await redis.setex(unsubKey(token), UNSUB_TTL, JSON.stringify({ contactId, orgId }));
  return token;
}

/**
 * Generate a preference-centre token (longer-lived, re-usable).
 */
export async function generatePreferencesToken(contactId: string, orgId: string): Promise<string> {
  const token = crypto.randomUUID();
  await redis.setex(prefKey(token), UNSUB_TTL, JSON.stringify({ contactId, orgId }));
  return token;
}
