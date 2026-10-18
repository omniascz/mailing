/**
 * Double opt-in flow + unsubscribe engine.
 *
 * Double opt-in:
 *   POST /api/v1/lists/:listId/subscribe  → creates or finds a contact,
 *     generates a 48h Redis token, queues a confirmation email (stub).
 *   GET  /api/v1/confirm/:token           → a page with a "Confirm" button;
 *     changes nothing.
 *   POST /api/v1/confirm/:token           → the button: activates contact in
 *     the list, redirects to thank-you page.
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
import { contacts, lists, contactLists, organizations } from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';
import { t, resolveLocale, verifyTrackingToken, type SupportedLocale } from '@forgemsg/shared';
import {
  unsubscribeContact,
  unsubscribeHttpMethod,
  type UnsubscribeHttpMethod,
  type UnsubscribeSource,
} from '../../services/contacts/unsubscribe.js';
import { resubscribeContact } from '../../services/contacts/resubscribe.js';
import { findOrCreateContact } from '../../services/contacts/by-email.js';
import { sendListDoiConfirmation } from '../../services/subscriptions/doi.js';
import { maskEmail } from '../../services/preference-center/index.js';

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

export function htmlPage(title: string, body: string, locale: SupportedLocale = 'cs') {
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:500px;margin:60px auto;padding:0 20px;color:#1e293b}h1{color:#0f172a}p{color:#475569}.btn{display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;margin-top:16px}</style></head><body>${body}</body></html>`;
}

/** Resolve the page locale: org setting → contact custom_fields.locale → Accept-Language. */
export async function resolvePageLocale(
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
export function pageFromKey(
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

/**
 * The page a confirmation link opens: one button that posts to `action`. No
 * script submits it — opening the link must not be the confirmation, because
 * mail security scanners (Outlook Safe Links, company gateways, prefetch) open
 * every link in a message before the person does. Needs no cookie or session:
 * the token in `action` is the credential, as it is in the link.
 */
export function confirmButtonPage(action: string, locale: SupportedLocale): string {
  const title = t('doi_confirm_page.title', locale);
  const heading = t('doi_confirm_page.heading', locale);
  const body = t('doi_confirm_page.body', locale);
  const button = t('doi_confirm_page.button', locale);
  return htmlPage(
    title,
    `<h1>${heading}</h1><p>${body}</p><form method="post" action="${action}"><button type="submit" class="btn" style="border:0;cursor:pointer;font-size:16px">${button}</button></form>`,
    locale,
  );
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

      // Find or create contact (pending). An existing contact keeps its status
      // (services/contacts/by-email.ts); only the confirmation can change it.
      const { contact } = await findOrCreateContact(orgId, body.email, {
        firstName: body.firstName,
        lastName: body.lastName,
        status: 'pending',
        source: 'double_optin',
      });

      // Token + confirmation e-mail. The same function the signup form calls,
      // and the only one that asks the MTA gate to let a DOI confirmation
      // through the row a GDPR erasure leaves; it also holds the limit of
      // three per address and list in 24 hours (services/subscriptions/doi.ts).
      await sendListDoiConfirmation({
        orgId,
        contactId: contact.id,
        listId,
        email: body.email,
        listName: list.name,
        firstName: body.firstName,
        toName: [body.firstName, body.lastName].filter(Boolean).join(' ') || undefined,
      });

      // No token and no address: the token confirms the subscription, and a log
      // line is read by people who are not the subscriber (Z176).
      app.log.info({ event: 'doi_token_generated', listId });

      // The token used to be in this answer too (`_devToken`, `_confirmUrl`)
      // outside production. Whoever asked for the sign-up could then confirm
      // it without the mailbox — the one thing a double opt-in has to prove.
      return reply.code(202).send({
        data: { message: 'Confirmation email sent. Please check your inbox.' },
      });
    },
  );

  /**
   * GET /api/v1/confirm/:token
   * The link in the confirmation e-mail: a page with a "Confirm" button that
   * posts to the same address. Reads the token and writes nothing — not the
   * contact, not the list row, not the token (HEAD, which Fastify answers from
   * this handler, likewise).
   *
   * It used to confirm right here. Mail security scanners (Outlook Safe Links,
   * company gateways, prefetch) open every link in a message before the person
   * does, so a subscription was confirmed by a machine — no person had to.
   */
  app.get(
    '/api/v1/confirm/:token',
    { schema: { tags: ['Subscriptions'], summary: 'Double opt-in confirmation page' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().uuid() }).parse(req.params);
      const raw = await redis.get(doiKey(token));

      if (!raw) {
        const locale = await resolvePageLocale(req);
        const page = pageFromKey('doi_expired_page', locale);
        return reply.code(400).header('Content-Type', 'text/html').send(page.html);
      }

      const { contactId, orgId } = JSON.parse(raw) as { contactId: string; orgId: string };
      const locale = await resolvePageLocale(req, orgId, contactId);
      return reply
        .header('Content-Type', 'text/html')
        .send(confirmButtonPage(`/api/v1/confirm/${token}`, locale));
    },
  );

  /**
   * POST /api/v1/confirm/:token
   * The button on that page: confirm DOI — activate contact in the list,
   * redirect to thank-you page. Public, no session (the token is the
   * credential); an empty form body is all it gets.
   */
  app.post(
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

      // Activate the contact — the recipient has just confirmed, from their own
      // mailbox, that they want this list, so it may lift their own earlier
      // unsubscribe as well. It used to set 'active' from any status and touch
      // nothing else: a bounced or complained contact read as active, and a
      // previously unsubscribed one kept the suppression and the closed list
      // row, so the person who confirmed never got a campaign.
      //
      // Not from bounced or complained: those say the address refuses mail or
      // its owner reported it, and consent does not change either. Archived is
      // the org putting a contact aside, and a fresh sign-up brings it back, as
      // it always has here.
      const result = await resubscribeContact(orgId, contactId, {
        from: ['pending', 'non_subscribed', 'unsubscribed', 'archived'],
        proof: {
          eventType: 'double_opt_in',
          source: 'double_opt_in',
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          payload: { listId },
        },
      });

      // Add to list (confirmed). A list row a global unsubscribe closed is
      // reopened, but only when the contact can actually be mailed again —
      // otherwise the row records the sign-up and nothing more.
      const now = new Date();
      if (result?.reachable) {
        await db
          .insert(contactLists)
          .values({ contactId, listId, confirmedAt: now })
          .onConflictDoUpdate({
            target: [contactLists.contactId, contactLists.listId],
            set: { confirmedAt: now, unsubscribedAt: null, unsubscribedReason: null },
          });
      } else {
        await db
          .insert(contactLists)
          .values({ contactId, listId, confirmedAt: now })
          .onConflictDoNothing();
      }

      await redis.del(doiKey(token));

      // Redirect to list's thank-you page or default
      const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
      const thankYouUrl = list?.thankYouUrl;
      // 303: the answer to a form post is a GET of the thank-you page.
      if (thankYouUrl) return reply.redirect(thankYouUrl, 303);

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
      await processUnsubscribe(token, {
        source: 'one_click',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        httpMethod: unsubscribeHttpMethod(req.method),
      });
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
    {
      schema: {
        tags: ['Subscriptions'],
        summary: 'One-click unsubscribe (RFC 8058, token in path)',
      },
    },
    async (req, reply) => {
      const { token } = z.object({ token: unsubTokenSchema }).parse(req.params);
      try {
        await processUnsubscribe(token, {
          source: 'one_click',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: unsubscribeHttpMethod(req.method),
        });
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
        const { contactId, orgId } = await processUnsubscribe(token, {
          source: 'footer_link',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: unsubscribeHttpMethod(req.method),
        });
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
   * The address is masked as on /p/center: the token travels in an e-mail
   * that can be forwarded, and the full address is not the forwardee's.
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
          emailMasked: maskEmail(contact.email),
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
        await unsubscribeContact(orgId, contactId, {
          scope: { kind: 'global' },
          source: 'preference_centre',
          reason: body.reason,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          httpMethod: unsubscribeHttpMethod(req.method),
        });
      } else if (body.listIdsToRemove?.length) {
        for (const listId of body.listIdsToRemove) {
          // Was a hard DELETE of the membership row, which erased the fact that
          // the contact had ever been on the list along with when they left.
          // The unsubscribed_at marker keeps both, and is what resolveAudience
          // already filters on.
          await unsubscribeContact(orgId, contactId, {
            scope: { kind: 'list', listId },
            source: 'preference_centre',
            reason: body.reason,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            httpMethod: unsubscribeHttpMethod(req.method),
          });
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
async function decodeUnsubToken(token: string): Promise<{
  contactId: string;
  orgId: string;
  /** Present on signed tokens; batch-sender has put it there since July. */
  campaignId?: string;
  redisBacked: boolean;
} | null> {
  const payload = verifyTrackingToken(token);
  if (payload && payload.type === 'unsub') {
    // campaignId was already in the payload and was being dropped right here,
    // which is why no unsubscribe could be attributed to a campaign.
    return {
      contactId: payload.contactId,
      orgId: payload.orgId,
      campaignId: payload.campaignId,
      redisBacked: false,
    };
  }
  const raw = await redis.get(unsubKey(token));
  if (raw) {
    // Legacy Redis-backed tokens predate the campaign field; undefined is the
    // honest answer for them.
    const parsed = JSON.parse(raw) as { contactId: string; orgId: string; campaignId?: string };
    return { ...parsed, redisBacked: true };
  }
  return null;
}

async function resolveUnsubToken(token: string): Promise<{ contactId: string; orgId: string }> {
  const decoded = await decodeUnsubToken(token);
  if (!decoded) throw AppError.badRequest('Invalid or expired unsubscribe token');
  return { contactId: decoded.contactId, orgId: decoded.orgId };
}

/**
 * The three token-bearing routes all land here: the footer link (GET), the
 * confirmation button (POST) and the RFC 8058 one-click POST.
 *
 * The writes used to live inline and covered two of the four stores, so a
 * contact who left this way ended up in a different state from one who left
 * through the preference centre. unsubscribeContact owns that now; this
 * function's job is to turn a token into a call.
 */
async function processUnsubscribe(
  token: string,
  ctx: {
    source: UnsubscribeSource;
    ipAddress?: string;
    userAgent?: string;
    httpMethod?: UnsubscribeHttpMethod;
  },
): Promise<{ contactId: string; orgId: string }> {
  const decoded = await decodeUnsubToken(token);
  if (!decoded) throw AppError.badRequest('Invalid or expired unsubscribe token');

  const { contactId, orgId } = decoded;

  const result = await unsubscribeContact(orgId, contactId, {
    scope: { kind: 'global' },
    source: ctx.source,
    campaignId: decoded.campaignId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    httpMethod: ctx.httpMethod,
  });

  // The webhook keeps firing on every call, unlike the event. A provider
  // retrying one-click should not add a second `unsubscribe` row to the stats,
  // but a customer's integration that missed the first delivery still wants
  // the second — the webhook queue has its own delivery semantics for that.
  if (result.changed) {
    const [contact] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
      .limit(1);
    if (contact?.email) {
      const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
      emitEmailEvent(orgId, 'unsubscribed', { contactId, email: contact.email });
    }
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
