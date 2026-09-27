/**
 * Public preference-center routes (Sprint D.1).
 *
 *   GET  /p/center/:token       — the recipient's page, or their preferences as JSON
 *   POST /p/center/:token       — update preferences (toggle lists, opt out)
 *
 * Both are unauthenticated; the signed token IS the auth. Path is /p/* (not
 * /api/v1/*) because the URL ends up in customer emails and we want it short
 * + visibly distinct from API endpoints.
 *
 * ─── A page for a person, JSON for a program ─────────────────────────────────
 *
 * `{{preference_center_url}}` put this URL in front of recipients, and the
 * recipient's browser got `{"data":{...}}` back. A request that asks for HTML
 * (a browser does, `Accept: text/html`) now gets a page, built the way the
 * unsubscribe confirmation is (subscriptions.ts: htmlPage, resolvePageLocale).
 * Anything else still gets the JSON it always did.
 *
 * The page offers only what this route can actually do and what then holds at
 * send time: leave or rejoin a single list, or leave everything. It does NOT
 * offer to undo a global unsubscribe. `globalResubscribe` below removes the
 * suppression row but leaves contacts.status at 'unsubscribed', and the batch
 * sender refuses on that status — a button for it would promise mail that never
 * comes. The form posts back here as application/x-www-form-urlencoded and is
 * answered with a redirect to the page, so a reload does not post twice.
 *
 * Unsubscribe A/B testing (#leapfrog): when an active experiment exists, the
 * GET response carries the assigned "save the subscriber" variant (and records
 * an impression); the POST records the outcome (kept subscribed vs unsubscribed)
 * so save-rate per variant can be analysed. The page shows the variant's own
 * headline and text; the flows it cannot perform (pause, downgrade) are not
 * offered as buttons.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { t, type SupportedLocale } from '@forgemsg/shared';
import {
  getPreferences,
  updatePreferences,
  type PreferenceCenterView,
  type UpdateRequest,
} from '../../services/preference-center/index.js';
import { verifyTrackingToken } from '../../services/sending/tracking.js';
import {
  assignVariant,
  recordImpression,
  recordOutcome,
  type AssignedVariant,
} from '../../services/contacts/unsubscribe-ab.js';
import { htmlPage, resolvePageLocale } from './subscriptions.js';

const updateBody = z.object({
  globalUnsubscribe: z.boolean().optional(),
  globalResubscribe: z.boolean().optional(),
  unsubscribeFromLists: z.array(z.string().uuid()).max(200).optional(),
  resubscribeToLists: z.array(z.string().uuid()).max(200).optional(),
  reason: z.string().max(255).optional(),
});

/** What the page's two forms post. `list` repeats once per ticked box. */
const formBody = z.object({
  action: z.enum(['save', 'unsubscribe_all']),
  list: z.union([z.string(), z.array(z.string())]).optional(),
});

/** Decode the signed pref token to { orgId, contactId } (null if invalid). */
function prefIdentity(token: string): { orgId: string; contactId: string } | null {
  const payload = verifyTrackingToken(token);
  if (!payload || payload.type !== 'pref') return null;
  const p = payload as { orgId: string; contactId: string };
  return { orgId: p.orgId, contactId: p.contactId };
}

/** A browser asks for HTML; fetch() and API clients do not. */
function wantsPage(req: FastifyRequest): boolean {
  return (req.headers.accept ?? '').includes('text/html');
}

function isForm(req: FastifyRequest): boolean {
  return (req.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The view plus the experiment variant, with the impression recorded. */
async function loadView(
  token: string,
): Promise<{ view: PreferenceCenterView; experiment: AssignedVariant | null }> {
  const view = await getPreferences(token);

  // Unsubscribe A/B: pick the save-the-subscriber variant for this contact.
  let experiment: AssignedVariant | null = null;
  const id = prefIdentity(token);
  if (id) {
    experiment = await assignVariant(id.orgId, id.contactId);
    if (experiment) recordImpression(id.orgId, experiment.variantId).catch(() => {});
  }
  return { view, experiment };
}

/** Apply an update and record the A/B outcome — the one path both bodies take. */
async function applyUpdate(token: string, body: UpdateRequest) {
  const result = await updatePreferences(token, body);

  // Unsubscribe A/B: record the outcome. "Saved" = the recipient did NOT
  // globally unsubscribe (they kept at least their global subscription).
  const id = prefIdentity(token);
  if (id) {
    const variant = await assignVariant(id.orgId, id.contactId);
    if (variant)
      recordOutcome(id.orgId, variant.variantId, !body.globalUnsubscribe).catch(() => {});
  }
  return result;
}

function renderPage(
  token: string,
  view: PreferenceCenterView,
  experiment: AssignedVariant | null,
  locale: SupportedLocale,
  saved: boolean,
): string {
  const k = (key: string, values?: Record<string, string>) =>
    esc(t(`preferences_page.${key}`, locale, values));
  const action = `/p/center/${encodeURIComponent(token)}`;
  const parts: string[] = [
    `<h1>${k('heading')}</h1>`,
    `<p>${k('for_email', { email: view.emailMasked })}</p>`,
  ];
  if (saved) parts.push(`<p role="status"><strong>${k('updated_body')}</strong></p>`);

  if (view.globallyUnsubscribed) {
    parts.push(`<p>${k('globally_unsubscribed_body')}</p>`);
    return htmlPage(esc(t('preferences_page.title', locale)), parts.join(''), locale);
  }

  if (experiment?.headline) parts.push(`<h2>${esc(experiment.headline)}</h2>`);
  if (experiment?.bodyText) parts.push(`<p>${esc(experiment.bodyText)}</p>`);

  if (view.lists.length === 0) {
    parts.push(`<p>${k('no_lists')}</p>`);
  } else {
    const boxes = view.lists
      .map(
        (l) =>
          `<label style="display:block;margin:8px 0;"><input type="checkbox" name="list" value="${esc(l.id)}"${l.subscribed ? ' checked' : ''}> ${esc(l.name)}</label>`,
      )
      .join('');
    parts.push(
      `<form method="post" action="${esc(action)}"><p>${k('intro')}</p>${boxes}` +
        `<input type="hidden" name="action" value="save">` +
        `<button type="submit" class="btn" style="border:0;cursor:pointer;">${k('save_cta')}</button></form>`,
    );
  }

  parts.push(
    `<form method="post" action="${esc(action)}" style="margin-top:24px;">` +
      `<input type="hidden" name="action" value="unsubscribe_all">` +
      `<button type="submit" style="background:none;border:0;padding:0;color:#475569;text-decoration:underline;cursor:pointer;">${k('unsubscribe_all_cta')}</button></form>`,
  );
  return htmlPage(esc(t('preferences_page.title', locale)), parts.join(''), locale);
}

/** A token that does not verify, or points at nobody: say so, show nothing. */
async function sendInvalid(req: FastifyRequest, reply: FastifyReply) {
  const locale = await resolvePageLocale(req);
  const k = (key: string) => esc(t(`preferences_page.${key}`, locale));
  return reply
    .code(400)
    .header('Content-Type', 'text/html; charset=utf-8')
    .send(
      htmlPage(
        k('invalid_title'),
        `<h1>${k('invalid_heading')}</h1><p>${k('invalid_body')}</p>`,
        locale,
      ),
    );
}

export default async function preferenceCenterRoutes(app: FastifyInstance) {
  app.get(
    '/p/center/:token',
    {
      schema: {
        tags: ['Preference Center'],
        summary: "Public — recipient's current subscription preferences",
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };

      if (wantsPage(req)) {
        const id = prefIdentity(token);
        let loaded;
        try {
          loaded = await loadView(token);
        } catch {
          return sendInvalid(req, reply);
        }
        const locale = await resolvePageLocale(req, id?.orgId, id?.contactId);
        const saved = (req.query as { saved?: string } | undefined)?.saved === '1';
        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(renderPage(token, loaded.view, loaded.experiment, locale, saved));
      }

      const { view, experiment } = await loadView(token);
      return reply.send({ data: { ...view, experiment } });
    },
  );

  app.post(
    '/p/center/:token',
    {
      schema: {
        tags: ['Preference Center'],
        summary: 'Public — apply unsubscribe / resubscribe / per-list changes',
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };

      if (isForm(req)) {
        const form = formBody.safeParse(req.body ?? {});
        let view: PreferenceCenterView;
        try {
          view = await getPreferences(token);
        } catch {
          return sendInvalid(req, reply);
        }
        if (!form.success) return reply.code(303).header('Location', `/p/center/${token}`).send();

        if (form.data.action === 'unsubscribe_all') {
          await applyUpdate(token, { globalUnsubscribe: true });
        } else {
          // The ticked boxes, read against the lists the page showed: only
          // those, so a crafted form cannot name a list this contact is not on.
          const ticked = new Set(
            Array.isArray(form.data.list) ? form.data.list : form.data.list ? [form.data.list] : [],
          );
          await applyUpdate(token, {
            unsubscribeFromLists: view.lists
              .filter((l) => l.subscribed && !ticked.has(l.id))
              .map((l) => l.id),
            resubscribeToLists: view.lists
              .filter((l) => !l.subscribed && ticked.has(l.id))
              .map((l) => l.id),
          });
        }
        return reply.code(303).header('Location', `/p/center/${token}?saved=1`).send();
      }

      const body = updateBody.parse(req.body ?? {});
      const result = await applyUpdate(token, body);
      return reply.send({ data: result });
    },
  );
}
