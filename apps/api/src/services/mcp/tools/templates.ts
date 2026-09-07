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
 */

import { z } from 'zod';
import { defineTool, expectOk } from '../registry.js';

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

export const templateTools = [findTemplates, checkTemplateContent];
