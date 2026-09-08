/**
 * "What can I start from, and is this thing I have written going to land?"
 *
 * Two tools, and the split is between the catalogue and the critique.
 *
 * `find_templates` reports both shelves at once because they are not
 * interchangeable and an assistant that sees only one will pick wrongly: the
 * built-in gallery is the same 101 designs for every account and starting from
 * one always means cloning it, while a saved template is this org's own work
 * and may be the thing the customer meant by "our newsletter".
 *
 * `check_template_content` is a read of content the caller already has, not of
 * anything stored. It takes the HTML in the request rather than a template id
 * on purpose: the question is asked about a draft in progress far more often
 * than about something already saved, and a tool that could only judge saved
 * templates would be useless at the moment it is wanted.
 *
 * There is deliberately no `create_template` and no `update_template`. A
 * template is the body of every campaign that points at it, so editing one
 * changes mail that has already been written and approved. Same rule as the
 * segments area: read and judge, never rewrite.
 *
 * `get_template_performance` joins this batch late and on purpose. It was left
 * out twice because it groups by `campaigns.template_id`, and until the library
 * grew a way to start a campaign that column was null on every row the product
 * created — 103 campaigns in the test database, none with a template. A tool
 * answering over an empty join returns zeros an assistant reports as "this
 * template does not perform", which is a different sentence from "nobody has
 * used it".
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface BuiltInTemplate {
  id: string;
  name?: string;
  category?: string;
  locale?: string;
  description?: string;
}

interface SavedTemplate {
  id: string;
  name: string;
  category?: string | null;
  locale?: string | null;
  updatedAt?: string | null;
}

export const findTemplates = defineTool({
  name: 'find_templates',
  description:
    "List the email templates available: this account's own saved templates, and the built-in " +
    'gallery that can be cloned into one. Use it to find a starting point, or to identify which ' +
    'template the user means.',
  input: z.object({
    name_contains: z.string().optional().describe('Case-insensitive fragment of the name'),
    category: z
      .string()
      .optional()
      .describe('Filter the built-in gallery by category, e.g. newsletter, promo, ecommerce'),
  }),
  async run(input, ctx) {
    const needle = input.name_contains?.toLowerCase();

    const savedBody = (await expectOk(ctx, '/api/v1/saved-templates')) as {
      data?: SavedTemplate[];
    };
    let saved = savedBody.data ?? [];
    if (needle) saved = saved.filter((t) => t.name.toLowerCase().includes(needle));

    const builtInPath = input.category
      ? `/api/v1/templates?category=${encodeURIComponent(input.category)}`
      : '/api/v1/templates';
    const builtInBody = (await expectOk(ctx, builtInPath)) as { data?: BuiltInTemplate[] };
    let builtIn = builtInBody.data ?? [];
    if (needle) {
      builtIn = builtIn.filter((t) => (t.name ?? t.id).toLowerCase().includes(needle));
    }

    const lines: string[] = [];

    if (saved.length > 0) {
      lines.push(`${saved.length} template(s) saved in this account:`);
      lines.push(
        ...saved
          .slice(0, 50)
          .map(
            (t) =>
              `- ${t.name}${t.category ? ` — ${t.category}` : ''}${
                t.locale && t.locale !== 'en' ? ` [${t.locale}]` : ''
              } (id ${t.id})`,
          ),
      );
    } else {
      lines.push(
        needle
          ? `No template of your own matches "${input.name_contains}".`
          : 'This account has no templates of its own yet.',
      );
    }

    lines.push('');
    if (builtIn.length > 0) {
      lines.push(`${builtIn.length} built-in template(s) available to clone:`);
      lines.push(
        ...builtIn
          .slice(0, 50)
          .map((t) => `- ${t.name ?? t.id}${t.category ? ` — ${t.category}` : ''} (id ${t.id})`),
      );
      if (builtIn.length > 50) lines.push(`  … and ${builtIn.length - 50} more.`);
    } else {
      lines.push(
        input.category
          ? `No built-in template is in the "${input.category}" category.`
          : 'No built-in templates matched.',
      );
    }

    return lines.join('\n');
  },
});

/** Fold one check's issue list into lines, or say plainly that it found nothing. */
function issueLines(label: string, issues: string[]): string[] {
  if (issues.length === 0) return [`  ${label}: nothing to fix.`];
  return [`  ${label}:`, ...issues.map((i) => `    - ${i}`)];
}

export const checkTemplateContent = defineTool({
  name: 'check_template_content',
  description:
    'Judge a piece of email content before it is sent: how likely it is to be filtered as spam, ' +
    'and whether it is readable by someone using a screen reader or a high-contrast display. ' +
    'Takes the HTML itself, so it works on a draft that has not been saved.',
  input: z.object({
    html: z.string().describe('The email HTML to check'),
    subject: z.string().optional().describe('The subject line, if there is one'),
    has_plain_text: z
      .boolean()
      .optional()
      .describe('Whether a plain-text alternative will be sent alongside (default false)'),
  }),
  async run(input, ctx) {
    const spamBody = (await expectOk(ctx, '/api/v1/editor/spam-check', 'POST', {
      subject: input.subject ?? '',
      html: input.html,
      hasPlainText: input.has_plain_text ?? false,
    })) as {
      data?: {
        score?: number;
        verdict?: string;
        issues?: Array<{ message?: string; severity?: string }>;
      };
    };
    const spam = spamBody.data ?? {};

    const lines = [
      `Spam score ${spam.score ?? '?'} / 10 (lower is better).${
        spam.verdict ? ` ${spam.verdict}` : ''
      }`,
      ...issueLines(
        'spam',
        (spam.issues ?? []).map(
          (i) => `${i.severity ? `[${i.severity}] ` : ''}${i.message ?? 'unnamed issue'}`,
        ),
      ),
    ];

    // Accessibility is a second endpoint and is reported separately rather than
    // folded into one number: a template can be perfectly deliverable and
    // unreadable, and averaging the two would hide whichever is worse.
    const a11yRes = await ctx.call('/api/v1/editor/accessibility-check', 'POST', {
      html: input.html,
    });
    if (a11yRes.status < 400) {
      const a11y = (
        a11yRes.body as {
          data?: {
            score?: number;
            issues?: Array<{ issue?: string; severity?: string; suggestion?: string }>;
          };
        }
      ).data;
      lines.push('', `Accessibility ${a11y?.score ?? '?'} / 100 (higher is better).`);
      lines.push(
        ...issueLines(
          'accessibility',
          (a11y?.issues ?? []).map(
            (i) =>
              `${i.severity ? `[${i.severity}] ` : ''}${i.issue ?? 'unnamed issue'}${
                i.suggestion ? ` — ${i.suggestion}` : ''
              }`,
          ),
        ),
      );
    } else {
      // Said out loud rather than omitted: a missing section reads as "no
      // problems found" to anyone skimming, which is the opposite of true.
      lines.push('', 'Accessibility could not be checked on this content.');
    }

    return lines.join('\n');
  },
});

/** Resolve a saved template by id or by name, the way the other areas do. */
async function resolveSavedTemplate(
  ctx: ToolContext,
  ref: string,
): Promise<{ id: string; name: string }> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const body = (await expectOk(ctx, '/api/v1/saved-templates')) as { data?: SavedTemplate[] };
  const rows = body.data ?? [];

  if (isId) {
    // Asked of the product rather than filtered out of the list: the
    // performance route is org-scoped and answers 404 for somebody else's id,
    // and filtering here would turn another tenant's template into "no such
    // template", which reads as "you never made one".
    const hit = rows.find((t) => t.id === ref);
    if (hit) return { id: hit.id, name: hit.name };
    return { id: ref, name: ref };
  }

  const needle = ref.trim().toLowerCase();
  const exact = rows.filter((t) => t.name.toLowerCase() === needle);
  const matches =
    exact.length > 0 ? exact : rows.filter((t) => t.name.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new ToolError(`No saved template in this account matches "${ref}".`, 404);
  }
  if (matches.length > 1) {
    throw new ToolError(
      `"${ref}" matches ${matches.length} templates: ${matches
        .slice(0, 5)
        .map((t) => `${t.name} (${t.id})`)
        .join(', ')}. Ask for one by id.`,
      409,
    );
  }
  return { id: matches[0]!.id, name: matches[0]!.name };
}

const rate = (v: number | null, label: string): string | null =>
  v === null ? null : `  ${label.padEnd(14)} ${v}%`;

export const getTemplatePerformanceTool = defineTool({
  name: 'get_template_performance',
  description:
    'How the campaigns started from one saved template have performed: how many campaigns used ' +
    'it, and their delivery, opens, clicks, bounces and unsubscribes with rates. Use it to answer ' +
    '"which of our designs actually works". Accepts a template id or its name.',
  input: z.object({
    template: z.string().describe('Saved template id, or the template name'),
  }),
  async run(input, ctx) {
    const tpl = await resolveSavedTemplate(ctx, input.template);
    const body = (await expectOk(ctx, `/api/v1/saved-templates/${tpl.id}/performance`)) as {
      data?: {
        templateName?: string;
        campaigns?: number;
        campaignsSent?: number;
        sends?: number;
        delivered?: number;
        uniqueOpens?: number;
        uniqueClicks?: number;
        bounces?: number;
        complaints?: number;
        unsubscribes?: number;
        deliveryRatePct?: number | null;
        openRatePct?: number | null;
        clickRatePct?: number | null;
        bounceRatePct?: number | null;
        unsubscribeRatePct?: number | null;
        revenue?: { available: boolean; reason?: string; total?: number };
      };
    };
    const p = body.data ?? {};
    const name = p.templateName ?? tpl.name;

    // Three distinct answers, because "nobody used it", "used but not sent"
    // and "sent" are three different situations and only the third has rates.
    if ((p.campaigns ?? 0) === 0) {
      return `No campaign has been started from "${name}" yet, so there is nothing to measure. It is not performing badly — it has not been used.`;
    }
    if ((p.sends ?? 0) === 0) {
      return `"${name}" is behind ${p.campaigns} campaign(s), none of which has been sent yet. Nothing to measure until one goes out.`;
    }

    const lines = [
      `"${name}" — ${p.campaigns} campaign(s), ${p.campaignsSent} of them sent`,
      `  sends          ${p.sends}`,
      `  delivered      ${p.delivered}`,
      `  opens          ${p.uniqueOpens} unique`,
      `  clicks         ${p.uniqueClicks} unique`,
      `  bounces        ${p.bounces}`,
      `  complaints     ${p.complaints}`,
      `  unsubscribes   ${p.unsubscribes}`,
      '',
      ...([
        rate(p.deliveryRatePct ?? null, 'delivered'),
        rate(p.openRatePct ?? null, 'opened'),
        rate(p.clickRatePct ?? null, 'clicked'),
        rate(p.bounceRatePct ?? null, 'bounced'),
        rate(p.unsubscribeRatePct ?? null, 'unsubscribed'),
      ].filter(Boolean) as string[]),
    ];

    // Said out loud rather than shown as 0. A missing figure that reads as a
    // zero is the failure this whole tool was held back to avoid.
    if (p.revenue && p.revenue.available === false) {
      lines.push('', `  revenue        not available on this deployment — ${p.revenue.reason}`);
    } else if (p.revenue?.available) {
      lines.push('', `  revenue        ${p.revenue.total}`);
    }

    return lines.join('\n');
  },
});

export const templateTools = [findTemplates, checkTemplateContent, getTemplatePerformanceTool];
