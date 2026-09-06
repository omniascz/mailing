/**
 * "How is my email programme doing?" — the first area, whole.
 *
 * Chosen because it is what an assistant is asked first and most, it is
 * read-only, and it exercises the org-scope guarantee against real data. The
 * three tools follow the shape of the question rather than the shape of the
 * API: find the campaigns worth looking at, read one in detail, put several
 * side by side.
 *
 * None of them takes an organisation id. The org comes from the API key the
 * transport carries, so there is no parameter a model could fill in with an id
 * it saw in an earlier answer.
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface CampaignRow {
  id: string;
  name: string;
  subject?: string | null;
  status: string;
  type?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

/** Percentages the way a person quotes them, not the way a database stores them. */
function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function listCampaigns(ctx: ToolContext, limit: number): Promise<CampaignRow[]> {
  const body = (await expectOk(ctx, `/api/v1/campaigns?limit=${limit}`)) as {
    data?: CampaignRow[];
  };
  return body.data ?? [];
}

/**
 * Resolve a campaign the way a person refers to one — by name if that is what
 * they said. An assistant rarely has a UUID; it has "the Black Friday one".
 */
async function resolveCampaign(ctx: ToolContext, idOrName: string): Promise<CampaignRow> {
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrName,
  );
  if (looksLikeId) {
    // Straight through, so a foreign id gets the API's own 404 rather than
    // being quietly reported as "no campaign by that name".
    const body = (await expectOk(ctx, `/api/v1/campaigns/${idOrName}`)) as {
      data?: CampaignRow;
    };
    if (!body.data) throw new ToolError(`No campaign ${idOrName} in this account.`, 404);
    return body.data;
  }

  const all = await listCampaigns(ctx, 100);
  const needle = idOrName.trim().toLowerCase();
  const exact = all.filter((c) => c.name.toLowerCase() === needle);
  const matches =
    exact.length > 0 ? exact : all.filter((c) => c.name.toLowerCase().includes(needle));

  if (matches.length === 0) {
    throw new ToolError(`No campaign in this account matches "${idOrName}".`, 404);
  }
  if (matches.length > 1) {
    // Ambiguity is reported, not guessed at. Picking the first would make the
    // assistant confidently quote the wrong campaign's numbers.
    throw new ToolError(
      `"${idOrName}" matches ${matches.length} campaigns: ${matches
        .slice(0, 5)
        .map((c) => `${c.name} (${c.id})`)
        .join(', ')}. Ask for one by id.`,
      409,
    );
  }
  return matches[0]!;
}

export const findCampaigns = defineTool({
  name: 'find_campaigns',
  description:
    'Find campaigns in this account, most recent first. Use it to pick which campaign to look ' +
    'at before asking for performance. Optionally filter by status (draft, scheduled, sending, ' +
    'sent, paused) or by a fragment of the name.',
  input: z.object({
    status: z
      .enum(['draft', 'scheduled', 'sending', 'sent', 'paused', 'failed'])
      .optional()
      .describe('Only campaigns in this state'),
    name_contains: z.string().optional().describe('Case-insensitive fragment of the campaign name'),
    limit: z.number().optional().describe('How many to return (default 10, max 50)'),
  }),
  async run(input, ctx) {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    let rows = await listCampaigns(ctx, 100);

    if (input.status) rows = rows.filter((c) => c.status === input.status);
    if (input.name_contains) {
      const needle = input.name_contains.toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(needle));
    }

    if (rows.length === 0) {
      // Said plainly, and distinctly from a refusal: the account is reachable,
      // there is simply nothing matching.
      return input.status || input.name_contains
        ? 'No campaigns in this account match those filters.'
        : 'This account has no campaigns yet.';
    }

    const shown = rows.slice(0, limit);
    const lines = shown.map(
      (c) =>
        `- ${c.name} — ${c.status}${c.sentAt ? `, sent ${c.sentAt.slice(0, 10)}` : ''} (id ${c.id})`,
    );
    const more = rows.length > shown.length ? `\n(${rows.length - shown.length} more)` : '';
    return `${shown.length} campaign(s):\n${lines.join('\n')}${more}`;
  },
});

export const getCampaignPerformance = defineTool({
  name: 'get_campaign_performance',
  description:
    'How one campaign performed: delivered, opens, clicks, bounces, unsubscribes and revenue, ' +
    'with rates. Accepts the campaign id, or its name if that is how the user referred to it.',
  input: z.object({
    campaign: z.string().describe('Campaign id, or the campaign name'),
  }),
  async run(input, ctx) {
    const campaign = await resolveCampaign(ctx, input.campaign);
    const stats = (await expectOk(ctx, `/api/v1/campaigns/${campaign.id}/stats`)) as {
      data?: Record<string, number>;
    };
    const s = stats.data ?? {};

    const sent = s.sent ?? 0;
    const delivered = s.delivered ?? 0;
    const opens = s.uniqueOpens ?? s.opens ?? 0;
    const clicks = s.uniqueClicks ?? s.clicks ?? 0;

    if (sent === 0) {
      // A campaign that has not gone out has no rates, and inventing 0.0% for
      // each would read as "it did badly" rather than "it has not run".
      return `"${campaign.name}" is ${campaign.status} and has not been sent, so there is nothing to measure yet.`;
    }

    return [
      `"${campaign.name}" (${campaign.status}${campaign.sentAt ? `, sent ${campaign.sentAt.slice(0, 10)}` : ''})`,
      `  sent        ${sent}`,
      `  delivered   ${delivered} (${pct(delivered, sent)})`,
      `  opens       ${opens} (${pct(opens, delivered)} of delivered)`,
      `  clicks      ${clicks} (${pct(clicks, delivered)} of delivered)`,
      `  bounces     ${s.bounced ?? 0}`,
      `  unsubs      ${s.unsubscribed ?? 0}`,
      `  complaints  ${s.complained ?? 0}`,
      `  revenue     ${s.revenue ?? 0}`,
    ].join('\n');
  },
});

export const compareCampaignPerformance = defineTool({
  name: 'compare_campaign_performance',
  description:
    'Put several campaigns side by side — open rate, click rate and revenue — to answer which ' +
    'did better. Accepts ids or names, two to twenty of them.',
  input: z.object({
    campaigns: z.array(z.string()).describe('Two or more campaign ids or names'),
  }),
  async run(input, ctx) {
    if (input.campaigns.length < 2) {
      throw new ToolError('Give at least two campaigns to compare.', 400);
    }
    if (input.campaigns.length > 20) {
      throw new ToolError('Twenty campaigns is the most that can be compared at once.', 400);
    }

    // Resolved one at a time so a name that matches nothing, or matches several,
    // is reported as itself rather than silently dropping out of the table.
    const resolved: CampaignRow[] = [];
    for (const ref of input.campaigns) resolved.push(await resolveCampaign(ctx, ref));

    const body = (await expectOk(
      ctx,
      `/api/v1/analytics/compare?ids=${resolved.map((c) => c.id).join(',')}`,
    )) as { data?: Array<Record<string, unknown>> };

    const rows = body.data ?? [];
    if (rows.length === 0) return 'None of those campaigns has any data to compare yet.';

    const byId = new Map(resolved.map((c) => [c.id, c]));
    const lines = rows.map((r) => {
      const name = byId.get(String(r.campaignId ?? r.id))?.name ?? String(r.name ?? 'unknown');
      const sent = Number(r.sent ?? 0);
      const opens = Number(r.uniqueOpens ?? r.opens ?? 0);
      const clicks = Number(r.uniqueClicks ?? r.clicks ?? 0);
      return `- ${name}: sent ${sent}, opens ${pct(opens, sent)}, clicks ${pct(clicks, sent)}, revenue ${r.revenue ?? 0}`;
    });
    return `Comparison:\n${lines.join('\n')}`;
  },
});

export const campaignPerformanceTools = [
  findCampaigns,
  getCampaignPerformance,
  compareCampaignPerformance,
];
