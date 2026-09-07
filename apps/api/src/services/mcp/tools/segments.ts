/**
 * "Who am I about to send to, and is that list in any state to send to?"
 *
 * A segment here is read, sized and listed — never created, edited or deleted.
 * The asymmetry is the one the contacts and flows areas are built on: a tool
 * may narrow what we send, never widen it. A segment definition IS the audience
 * of every campaign that points at it, so an edited condition changes who
 * receives mail that has already been written and approved, silently and after
 * the fact. There is no `create_segment` and no `update_segment` for the same
 * reason `update_contact_fields` is absent from #139.
 *
 * `get_audience_health` is the one tool here that is not about a segment. It is
 * in this area because it answers the question that always follows sizing one —
 * "is this list worth sending to" — and because the three endpoints it folds
 * together (hygiene, duplicates, suppression counts) are useless separately: a
 * count of hard bounces means nothing without the total it came out of.
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface SegmentRow {
  id: string;
  name: string;
  description?: string | null;
  conditions?: unknown;
  lastMembershipSyncAt?: string | null;
  createdAt?: string | null;
}

interface SegmentRule {
  field?: string;
  op?: string;
  value?: unknown;
}

interface SegmentConditions {
  operator?: string;
  rules?: SegmentRule[];
}

async function listSegments(ctx: ToolContext): Promise<SegmentRow[]> {
  const body = (await expectOk(ctx, '/api/v1/segments')) as { data?: SegmentRow[] };
  return body.data ?? [];
}

/**
 * Resolve however the segment was referred to — id, or name.
 *
 * An id goes straight to the single-segment route rather than being matched
 * against the list, because that route is org-scoped and answers 404 for an id
 * belonging to somebody else. Filtering a list would make another tenant's
 * segment indistinguishable from a typo, which is the shape #122 was about.
 */
async function resolveSegment(ctx: ToolContext, ref: string): Promise<SegmentRow> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isId) {
    const body = (await expectOk(ctx, `/api/v1/segments/${ref}`)) as { data?: SegmentRow };
    if (!body.data) throw new ToolError(`No segment ${ref} in this account.`, 404);
    return body.data;
  }

  const all = await listSegments(ctx);
  const needle = ref.trim().toLowerCase();
  const exact = all.filter((s) => s.name.toLowerCase() === needle);
  const matches =
    exact.length > 0 ? exact : all.filter((s) => s.name.toLowerCase().includes(needle));

  if (matches.length === 0) {
    throw new ToolError(`No segment in this account matches "${ref}".`, 404);
  }
  if (matches.length > 1) {
    throw new ToolError(
      `"${ref}" matches ${matches.length} segments: ${matches
        .slice(0, 5)
        .map((s) => `${s.name} (${s.id})`)
        .join(', ')}. Ask for one by id.`,
      409,
    );
  }
  return matches[0]!;
}

/**
 * Say what the segment actually selects, in words.
 *
 * The stored form is a rule tree, and handing an assistant the raw JSON invites
 * it to paraphrase the operators — "not_opened_campaign" read as "did not open"
 * loses the campaign it is scoped to. One line per rule, operator spelled out.
 */
function describeConditions(conditions: unknown): string[] {
  const c = conditions as SegmentConditions | null | undefined;
  const rules = c?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return ['  (no conditions — matches everyone)'];

  const joiner = (c?.operator ?? 'AND').toUpperCase();
  return rules.map((r, i) => {
    const prefix = i === 0 ? '  ' : `  ${joiner} `;
    const value =
      r.value === undefined || r.value === null
        ? ''
        : ` ${Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}`;
    return `${prefix}${r.field ?? '?'} ${r.op ?? '?'}${value}`;
  });
}

export const findSegments = defineTool({
  name: 'find_segments',
  description:
    'List the audience segments in this account with what each one selects. Use it to pick a ' +
    'segment before sizing it or looking at who is in it.',
  input: z.object({
    name_contains: z.string().optional().describe('Case-insensitive fragment of the segment name'),
  }),
  async run(input, ctx) {
    let rows = await listSegments(ctx);
    if (input.name_contains) {
      const needle = input.name_contains.toLowerCase();
      rows = rows.filter((s) => s.name.toLowerCase().includes(needle));
    }
    if (rows.length === 0) {
      return input.name_contains
        ? `No segment in this account matches "${input.name_contains}".`
        : 'This account has no segments yet.';
    }
    return `${rows.length} segment(s):\n${rows
      .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ''} (id ${s.id})`)
      .join('\n')}`;
  },
});

export const getSegmentSize = defineTool({
  name: 'get_segment_size',
  description:
    'How many contacts a segment matches right now, and the rules it matches them by. The count ' +
    'is computed live, so it is the number a send would use today. Accepts an id or the name.',
  input: z.object({
    segment: z.string().describe('Segment id, or the segment name'),
  }),
  async run(input, ctx) {
    const s = await resolveSegment(ctx, input.segment);
    const body = (await expectOk(ctx, `/api/v1/segments/${s.id}/count`)) as {
      data?: { count?: number };
    };
    const count = body.data?.count ?? 0;

    const lines = [
      `"${s.name}" matches ${count} contact(s) right now.`,
      '',
      '  selects:',
      ...describeConditions(s.conditions),
    ];
    if (count === 0) {
      // Distinct from a refusal and from an empty account: the segment is
      // valid, it simply has no members today.
      lines.push('', '  The segment is valid — nobody matches these rules at the moment.');
    }
    return lines.join('\n');
  },
});

export const listSegmentMembers = defineTool({
  name: 'list_segment_members',
  description:
    'Who is currently in a segment — a page of contacts, most recent first. Use it to check a ' +
    'segment is selecting the people you expect before a campaign goes to it.',
  input: z.object({
    segment: z.string().describe('Segment id, or the segment name'),
    limit: z.number().optional().describe('How many to return (default 20, max 100)'),
  }),
  async run(input, ctx) {
    const s = await resolveSegment(ctx, input.segment);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const body = (await expectOk(ctx, `/api/v1/segments/${s.id}/contacts?limit=${limit}`)) as {
      data?: Array<{
        id: string;
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        status?: string;
      }>;
      hasMore?: boolean;
    };
    const rows = body.data ?? [];
    if (rows.length === 0) {
      return `"${s.name}" is empty. The segment is valid; nobody matches it today.`;
    }
    const shown = rows
      .map((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        return `- ${name || c.email || c.id} <${c.email ?? 'no email'}>${
          c.status ? ` — ${c.status}` : ''
        }`;
      })
      .join('\n');
    return `"${s.name}" — showing ${rows.length}${body.hasMore ? ' of more' : ''}:\n${shown}`;
  },
});

export const getAudienceHealth = defineTool({
  name: 'get_audience_health',
  description:
    'The state of the contact database as a whole: how many contacts there are, how many are ' +
    'unengaged, bounced, complained or invalid, how many duplicates exist, and what is on the ' +
    'suppression list. Use it before a big send, or when open rates fall.',
  input: z.object({}),
  async run(_input, ctx) {
    const hygiene = (await expectOk(ctx, '/api/v1/list-hygiene/report')) as {
      data?: {
        total?: number;
        staleNoEngagement?: number;
        hardBounces?: number;
        complaints?: number;
        invalidEmails?: number;
        recommendedRemovals?: number;
      };
    };
    const h = hygiene.data ?? {};

    if ((h.total ?? 0) === 0) {
      return 'This account has no contacts yet, so there is nothing to clean up.';
    }

    const lines = [
      `${h.total} contact(s) in this account.`,
      `  no engagement    ${h.staleNoEngagement ?? 0}`,
      `  hard bounced     ${h.hardBounces ?? 0}`,
      `  complained       ${h.complaints ?? 0}`,
      `  invalid address  ${h.invalidEmails ?? 0}`,
    ];

    // Both of these are separate endpoints and both are best-effort: a
    // duplicate scan that fails should not withhold the hygiene numbers that
    // already came back.
    const dupRes = await ctx.call('/api/v1/duplicates', 'GET');
    if (dupRes.status < 400) {
      const clusters = ((dupRes.body as { data?: unknown[] }).data ?? []).length;
      lines.push(`  duplicate groups ${clusters}`);
    }

    const supRes = await ctx.call('/api/v1/suppressions/summary', 'GET');
    if (supRes.status < 400) {
      const sup = (supRes.body as { data?: { total?: number; counts?: Record<string, number> } })
        .data;
      if (sup) {
        lines.push(`  suppressed       ${sup.total ?? 0}`);
        const byReason = Object.entries(sup.counts ?? {})
          .filter(([, n]) => n > 0)
          .map(([reason, n]) => `${reason} ${n}`)
          .join(', ');
        if (byReason) lines.push(`    (${byReason})`);
      }
    }

    if (h.recommendedRemovals !== undefined) {
      lines.push(
        '',
        `  ${h.recommendedRemovals} contact(s) are candidates for removal. Removing them is a ` +
          'destructive action and is deliberately not something this tool can do.',
      );
    }
    return lines.join('\n');
  },
});

export const segmentTools = [findSegments, getSegmentSize, listSegmentMembers, getAudienceHealth];
