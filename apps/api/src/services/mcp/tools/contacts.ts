/**
 * "What is going on with this person, and stop emailing them."
 *
 * The two things an assistant is actually asked about a contact: understand
 * their state, and stop messaging them. Everything here follows from that.
 *
 * WHAT IS DELIBERATELY ABSENT, and it is the important part of this file.
 *
 * There is no `create_contact` in this area and no `update_contact_fields`.
 * #131 settled that a contact created without a consent path is a marketing
 * recipient nobody agreed to, and an assistant creating contacts out of a
 * conversation is that problem with a friendlier face — there is no honest
 * `source` value for "a model inferred this from chat". Field updates are worse
 * rather than better: `status` is a field, so a general update tool is a way to
 * set someone back to `active` after they unsubscribed, which is consent
 * laundering with an audit entry attached.
 *
 * (`create_contact` still exists in the ported legacy set from #138 and is
 * untouched here. Reshaping it belongs to the authoring batch, with the consent
 * question answered rather than inherited.)
 *
 * The one write that IS here only ever reduces what we send. That asymmetry is
 * the rule this area is built on: a tool may stop a message, never start one.
 * An accidental suppression costs one unsent email; an accidental send cannot
 * be taken back.
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface ContactRow {
  id: string;
  email: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  lifecycleStage?: string | null;
  source?: string | null;
  createdAt?: string | null;
  lastOpenedAt?: string | null;
  lastClickedAt?: string | null;
}

const name = (c: ContactRow) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.id;

async function search(ctx: ToolContext, term: string, limit = 25): Promise<ContactRow[]> {
  const body = (await expectOk(
    ctx,
    `/api/v1/contacts?search=${encodeURIComponent(term)}&limit=${limit}`,
  )) as { data?: ContactRow[] };
  return body.data ?? [];
}

/**
 * Resolve however the person was referred to — id, address, or a name.
 *
 * Ambiguity is reported with the candidates rather than resolved to the first
 * hit. On a contact this matters more than on a campaign: quoting the wrong
 * person's consent state, or suppressing them, is a real mistake about a real
 * human being.
 */
async function resolveContact(ctx: ToolContext, ref: string): Promise<ContactRow> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isId) {
    const body = (await expectOk(ctx, `/api/v1/contacts/${ref}`)) as { data?: ContactRow };
    if (!body.data) throw new ToolError(`No contact ${ref} in this account.`, 404);
    return body.data;
  }

  const rows = await search(ctx, ref.trim());
  if (rows.length === 0) {
    throw new ToolError(`No contact in this account matches "${ref}".`, 404);
  }

  const needle = ref.trim().toLowerCase();
  const exact = rows.filter((c) => (c.email ?? '').toLowerCase() === needle);
  const chosen = exact.length > 0 ? exact : rows;
  if (chosen.length > 1) {
    throw new ToolError(
      `"${ref}" matches ${chosen.length} contacts: ${chosen
        .slice(0, 5)
        .map((c) => `${name(c)} <${c.email ?? 'no email'}> (${c.id})`)
        .join(', ')}. Ask for one by id or exact address.`,
      409,
    );
  }
  return chosen[0]!;
}

export const findContact = defineTool({
  name: 'find_contact',
  description:
    'Find contacts by email address, phone number or name. Use it to identify who the user means ' +
    'before asking about their state or suppressing them.',
  input: z.object({
    query: z.string().describe('Email address, phone number, or part of a name'),
    limit: z.number().optional().describe('How many to return (default 10, max 25)'),
  }),
  async run(input, ctx) {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const rows = (await search(ctx, input.query, 25)).slice(0, limit);
    if (rows.length === 0) return `No contact in this account matches "${input.query}".`;
    return `${rows.length} contact(s):\n${rows
      .map((c) => `- ${name(c)} <${c.email ?? 'no email'}> — ${c.status} (id ${c.id})`)
      .join('\n')}`;
  },
});

export const getContactOverview = defineTool({
  name: 'get_contact_overview',
  description:
    'Everything worth knowing about one contact in a single answer: status, lifecycle stage, ' +
    'where they came from, per-channel consent, and whether they are suppressed. Accepts an id, ' +
    'an email address, or a name.',
  input: z.object({
    contact: z.string().describe('Contact id, email address, or name'),
  }),
  async run(input, ctx) {
    const c = await resolveContact(ctx, input.contact);

    // Suppression is a separate store from contact.status, and the two disagree
    // often enough that reporting only one of them misleads — #133's list was
    // full of people whose status looked fine.
    let suppressed = 'no';
    if (c.email) {
      const res = await ctx.call('/api/v1/suppressions/check', 'POST', { email: c.email });
      if (res.status < 400) {
        const body = res.body as { data?: { suppressed?: boolean; reason?: string } };
        if (body.data?.suppressed) {
          suppressed = `yes${body.data.reason ? ` (${body.data.reason})` : ''}`;
        }
      }
    }

    const lines = [
      `${name(c)} <${c.email ?? 'no email'}>`,
      `  id           ${c.id}`,
      `  status       ${c.status}`,
      `  lifecycle    ${c.lifecycleStage ?? 'unknown'}`,
      `  source       ${c.source ?? 'unknown'}`,
      `  suppressed   ${suppressed}`,
    ];
    if (c.phone) lines.push(`  phone        ${c.phone}`);
    if (c.lastOpenedAt) lines.push(`  last opened  ${c.lastOpenedAt.slice(0, 10)}`);
    if (c.lastClickedAt) lines.push(`  last clicked ${c.lastClickedAt.slice(0, 10)}`);

    // `non_subscribed` is easy to misread as a problem; it is the deliberate
    // state #131 and #134 create for someone who gave an address without
    // opting in, and the difference decides what the assistant should suggest.
    if (c.status === 'non_subscribed') {
      lines.push(
        '',
        '  This contact has an address but no marketing opt-in: transactional and',
        '  behaviour-triggered messages reach them, marketing campaigns do not.',
      );
    }
    return lines.join('\n');
  },
});

export const getContactActivity = defineTool({
  name: 'get_contact_activity',
  description:
    'What this contact has recently done — opens, clicks, orders and other recorded events, ' +
    'most recent first. Use it to answer "why are they unhappy" or "have they engaged lately".',
  input: z.object({
    contact: z.string().describe('Contact id, email address, or name'),
    limit: z.number().optional().describe('How many events (default 20, max 100)'),
  }),
  async run(input, ctx) {
    const c = await resolveContact(ctx, input.contact);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const body = (await expectOk(ctx, `/api/v1/contacts/${c.id}/activity?limit=${limit}`)) as {
      data?: Array<Record<string, unknown>>;
    };
    const rows = body.data ?? [];

    if (rows.length === 0) {
      // Distinct from a refusal: we found the person, they simply have no
      // recorded activity.
      return `${name(c)} has no recorded activity.`;
    }
    const lines = rows.slice(0, limit).map((e) => {
      const when = String(e.createdAt ?? e.occurredAt ?? '')
        .slice(0, 19)
        .replace('T', ' ');
      const what = String(e.type ?? e.eventType ?? e.action ?? 'event');
      const detail = e.subject ?? e.campaignName ?? e.description ?? '';
      return `- ${when} ${what}${detail ? ` — ${String(detail)}` : ''}`;
    });
    return `${name(c)} — ${rows.length} recent event(s):\n${lines.join('\n')}`;
  },
});

export const suppressContact = defineTool({
  name: 'suppress_contact',
  description:
    'Stop sending to this contact. Use it when someone asks not to be contacted, or when a ' +
    'complaint needs acting on. This only ever reduces what is sent; it cannot cause a message. ' +
    'It is recorded in the audit log.',
  input: z.object({
    contact: z.string().describe('Contact id, email address, or name'),
    reason: z
      .enum(['manual', 'unsubscribe', 'complaint', 'hard_bounce', 'block', 'invalid_email'])
      .describe('Why they are being suppressed'),
    notes: z.string().optional().describe('Free-text note kept with the suppression'),
  }),
  async run(input, ctx) {
    const c = await resolveContact(ctx, input.contact);
    if (!c.email) {
      throw new ToolError(`${name(c)} has no email address, so there is nothing to suppress.`, 400);
    }

    // Asked before written, rather than relying on the write to refuse.
    //
    // POST /api/v1/suppressions answers 500 on a duplicate, not 409 — measured:
    // first call 201, second `{"code":"INTERNAL_ERROR"}`. Its guard inspects
    // the driver's error message and does not fire. That is a defect in a route
    // outside this area and is left for its own change; depending on an error
    // path that does not work would make this tool report a server failure for
    // something that already succeeded.
    const existing = await ctx.call('/api/v1/suppressions/check', 'POST', { email: c.email });
    if (existing.status < 400) {
      const body = existing.body as { data?: { suppressed?: boolean } };
      if (body.data?.suppressed) {
        // Not a failure: the outcome the caller asked for is already true, and
        // an error here would have an assistant retry.
        return `${name(c)} <${c.email}> was already suppressed. Nothing changed.`;
      }
    }

    const res = await ctx.call('/api/v1/suppressions', 'POST', {
      email: c.email,
      reason: input.reason,
      notes: input.notes,
    });

    if (res.status >= 400) {
      // The narrow race the check above cannot close: two suppressions of the
      // same address at once. The second one is still the outcome the caller
      // wanted, so it is reported as such rather than as a server error.
      const recheck = await ctx.call('/api/v1/suppressions/check', 'POST', { email: c.email });
      const body = recheck.body as { data?: { suppressed?: boolean } };
      if (recheck.status < 400 && body.data?.suppressed) {
        return `${name(c)} <${c.email}> is suppressed. Nothing further to do.`;
      }
      const err = res.body as { message?: string };
      throw new ToolError(err.message ?? `Could not suppress (HTTP ${res.status}).`, res.status);
    }
    return `${name(c)} <${c.email}> will no longer receive messages (${input.reason}).`;
  },
});

export const contactTools = [findContact, getContactOverview, getContactActivity, suppressContact];
