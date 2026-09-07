/**
 * "Will this arrive, and if it stopped arriving, where did it stop?"
 *
 * Five tools, chosen by what has a writer rather than by what the service
 * directory contains. The deliverability directory holds ten services; half of
 * them read tables nothing fills, and an obliging wrapper over one of those
 * returns zeros that an assistant reports as good news. So `dmarc_summary` is
 * absent (no working ingest — the rua address collects mail nobody reads), and
 * so is anything built on `reputation_score` (its only writer has no caller).
 *
 * The five here read `email_events`, `sending_domains`, `warmup_ips` and
 * `dedicated_ips`, all four of which have production writers on the send path.
 *
 * `run_pre_send_checks` is the one that earns its place twice over: it is the
 * only tool in the whole set that answers a question with a decision in it, and
 * eleven of its fifteen checks work on an account with no sending history at
 * all — which is exactly the account most likely to be asking.
 *
 * Read-only throughout, and that costs something worth naming: the domain
 * answer is as fresh as the last nightly sweep, so a record fixed an hour ago
 * still reads as failing. Forcing a re-read is one call away
 * (POST /api/v1/dns-health/recheck) and is deliberately not offered here — it
 * would be the twelfth tool in a batch scoped to eleven, and it belongs with a
 * decision about which re-reads a model may trigger on its own.
 */

import { z } from 'zod';
import { defineTool, expectOk, ToolError, type ToolContext } from '../registry.js';

interface DomainAuthRow {
  id: string;
  domain: string;
  isVerified?: boolean;
  spfVerified?: boolean;
  dkimVerified?: boolean;
  dmarcVerified?: boolean;
  returnPathVerified?: boolean;
  spfVerifiedAt?: string | null;
  dkimVerifiedAt?: string | null;
  dmarcVerifiedAt?: string | null;
  returnPathVerifiedAt?: string | null;
}

const tick = (v: boolean | undefined) => (v ? 'ok' : 'FAILING');

function renderDomains(rows: DomainAuthRow[]): string {
  return rows
    .map((d) => {
      const parts = [
        `- ${d.domain}${d.isVerified ? '' : ' (not yet verified)'}`,
        `    SPF          ${tick(d.spfVerified)}`,
        `    DKIM         ${tick(d.dkimVerified)}`,
        `    DMARC        ${tick(d.dmarcVerified)}`,
        `    Return-Path  ${tick(d.returnPathVerified)}`,
      ];
      const last = [d.spfVerifiedAt, d.dkimVerifiedAt, d.dmarcVerifiedAt, d.returnPathVerifiedAt]
        .filter(Boolean)
        .sort()
        .pop();
      if (last) parts.push(`    last checked ${String(last).slice(0, 19).replace('T', ' ')}`);
      return parts.join('\n');
    })
    .join('\n');
}

export const getDomainAuthentication = defineTool({
  name: 'get_domain_authentication',
  description:
    'Whether each sending domain still authenticates: SPF, DKIM, DMARC and Return-Path, and when ' +
    'each was last confirmed. Use it first when mail stops being delivered — customer DNS changes ' +
    'silently and this is where it shows.',
  input: z.object({}),
  async run(_input, ctx) {
    const body = (await expectOk(ctx, '/api/v1/dns-health')) as { data?: DomainAuthRow[] };
    const rows = body.data ?? [];
    if (rows.length === 0) {
      return 'No sending domain is set up on this account. Nothing can be sent from it until one is added and verified.';
    }
    const broken = rows.filter(
      (d) => !d.spfVerified || !d.dkimVerified || !d.dmarcVerified || !d.returnPathVerified,
    );
    const head =
      broken.length === 0
        ? `${rows.length} sending domain(s), all authenticating.`
        : `${broken.length} of ${rows.length} sending domain(s) have a record that is no longer resolving.`;
    return `${head}\n\n${renderDomains(rows)}`;
  },
});

export const getAccountDeliverability = defineTool({
  name: 'get_account_deliverability',
  description:
    'How this account is doing at getting mail delivered: a composite health score over a recent ' +
    'window, and the specific problems a rules pass found. Use it for "why are our emails not ' +
    'arriving" before looking at any single campaign.',
  input: z.object({
    days: z.number().optional().describe('Window in days (default 30, max 365)'),
  }),
  async run(input, ctx) {
    const days = Math.min(Math.max(input.days ?? 30, 1), 365);

    const scoreBody = (await expectOk(ctx, `/api/v1/deliverability/health-score?days=${days}`)) as {
      data?: {
        score?: number;
        grade?: string;
        components?: Record<string, number>;
        windowDays?: number;
      };
    };
    const s = scoreBody.data ?? {};
    const comp = s.components ?? {};

    // How much was sent, from a second endpoint, and it is not optional
    // decoration.
    //
    // computeEmailHealthScore returns rates only — deliveryRate, bounceRate and
    // five more — with no volume anywhere in the response. Over an empty window
    // every rate is zero, which the weights read as nothing wrong, so an account
    // that has never sent a single message scores 100 and grades A. Measured:
    // a freshly created org returns `Health score 100 (A)`. Handing that to an
    // assistant with no volume beside it is how "your deliverability is
    // excellent" gets said about an account that has never sent an email.
    let sent: number | null = null;
    const statsRes = await ctx.call(`/api/v1/account/send-statistics?days=${days}`, 'GET');
    if (statsRes.status < 400) {
      const v = (statsRes.body as { data?: { sent?: number } }).data?.sent;
      if (typeof v === 'number') sent = v;
    }

    const lines: string[] = [];
    if (sent === 0) {
      // The score is not reported at all in this case. Printing it with a
      // caveat underneath still leaves a number an assistant can quote.
      lines.push(
        `No email has been sent from this account in the last ${days} days.`,
        '',
        '  There is no deliverability to score yet. The health score would read 100 (A) ' +
          'over an empty window, because every rate it is built from is zero — that means ' +
          'nothing yet, so it is deliberately not shown here.',
      );
      return lines.join('\n');
    }

    lines.push(
      `Health score ${s.score ?? '?'}${s.grade ? ` (${s.grade})` : ''} over ${days} days` +
        `${sent === null ? '' : `, on ${sent} message(s) sent`}.`,
    );
    for (const [k, v] of Object.entries(comp)) {
      lines.push(`  ${k.padEnd(16)} ${typeof v === 'number' ? v : String(v)}`);
    }

    const insightsRes = await ctx.call(
      `/api/v1/deliverability/insights?window=${Math.min(days, 90)}`,
      'GET',
    );
    if (insightsRes.status < 400) {
      const insights =
        (
          insightsRes.body as {
            data?: Array<{ severity?: string; title?: string; detail?: string }>;
          }
        ).data ?? [];
      lines.push('');
      if (insights.length === 0) {
        lines.push('No deliverability rule fired for this window.');
      } else {
        lines.push(`${insights.length} finding(s):`);
        for (const i of insights) {
          lines.push(`  [${i.severity ?? 'info'}] ${i.title ?? 'finding'}`);
          if (i.detail) lines.push(`      ${i.detail}`);
        }
      }
    }
    return lines.join('\n');
  },
});

export const getDeliverabilityByIsp = defineTool({
  name: 'get_deliverability_by_isp',
  description:
    'The delivery funnel split by receiving mailbox provider — Gmail, Outlook, Seznam and the ' +
    'rest. Use it when delivery is bad overall to find out whether it is bad everywhere or at ' +
    'one provider, which is a completely different problem.',
  input: z.object({
    days: z.number().optional().describe('Window in days (default 30)'),
  }),
  async run(input, ctx) {
    const days = Math.min(Math.max(input.days ?? 30, 1), 365);
    const body = (await expectOk(ctx, `/api/v1/stats/isps?days=${days}`)) as {
      data?: Array<Record<string, unknown>>;
    };
    const rows = body.data ?? [];
    if (rows.length === 0) {
      return `No delivery events recorded in the last ${days} days, so there is nothing to split by provider.`;
    }
    const lines = [`Delivery by provider, last ${days} days:`];
    for (const r of rows) {
      const name = String(r.dimension ?? r.isp ?? r.name ?? 'unknown');
      const parts = Object.entries(r)
        .filter(([k]) => !['dimension', 'isp', 'name'].includes(k))
        .map(([k, v]) => `${k} ${String(v)}`)
        .join('  ');
      lines.push(`  ${name.padEnd(12)} ${parts}`);
    }
    return lines.join('\n');
  },
});

interface CampaignRow {
  id: string;
  name: string;
  status?: string;
}

/** Resolve a campaign by id or name, the same way the #138 area does. */
async function resolveCampaign(ctx: ToolContext, ref: string): Promise<CampaignRow> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isId) {
    const body = (await expectOk(ctx, `/api/v1/campaigns/${ref}`)) as { data?: CampaignRow };
    if (!body.data) throw new ToolError(`No campaign ${ref} in this account.`, 404);
    return body.data;
  }
  const body = (await expectOk(ctx, '/api/v1/campaigns?limit=100')) as { data?: CampaignRow[] };
  const all = body.data ?? [];
  const needle = ref.trim().toLowerCase();
  const exact = all.filter((c) => c.name.toLowerCase() === needle);
  const matches =
    exact.length > 0 ? exact : all.filter((c) => c.name.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new ToolError(`No campaign in this account matches "${ref}".`, 404);
  }
  if (matches.length > 1) {
    throw new ToolError(
      `"${ref}" matches ${matches.length} campaigns: ${matches
        .slice(0, 5)
        .map((c) => `${c.name} (${c.id})`)
        .join(', ')}. Ask for one by id.`,
      409,
    );
  }
  return matches[0]!;
}

export const runPreSendChecks = defineTool({
  name: 'run_pre_send_checks',
  description:
    'Run the full pre-send review on one campaign and return a go / caution / no-go verdict with ' +
    'the reason for each check: domain authentication, audience size, suppression overlap, ' +
    'frequency capping, subject line, unsubscribe link, spam score, merge tags, warmup capacity, ' +
    'recent bounce and complaint rates, send timing and IP blocklisting. Use it before anything ' +
    'goes out. It only inspects; it cannot send.',
  input: z.object({
    campaign: z.string().describe('Campaign id, or the campaign name'),
  }),
  async run(input, ctx) {
    const c = await resolveCampaign(ctx, input.campaign);
    const body = (await expectOk(ctx, `/api/v1/campaigns/${c.id}/pre-send-checks`)) as {
      data?: {
        verdict?: string;
        score?: number;
        grade?: string;
        counts?: Record<string, number>;
        checks?: Array<{ severity?: string; title?: string; detail?: string; category?: string }>;
      };
    };
    const r = body.data ?? {};
    const checks = r.checks ?? [];

    const lines = [
      `"${c.name}" — ${String(r.verdict ?? 'unknown').toUpperCase()}${
        r.grade ? `, grade ${r.grade}` : ''
      }${r.score !== undefined ? ` (${r.score})` : ''}`,
    ];
    if (r.counts) {
      lines.push(
        `  ${Object.entries(r.counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}`,
      );
    }
    lines.push('');

    // Failures and warnings first; a passing check is worth one line, not four.
    const bad = checks.filter((x) => x.severity === 'fail' || x.severity === 'warn');
    const rest = checks.filter((x) => x.severity !== 'fail' && x.severity !== 'warn');
    for (const x of bad) {
      lines.push(`  [${x.severity}] ${x.title ?? x.category ?? 'check'}`);
      if (x.detail) lines.push(`      ${x.detail}`);
    }
    if (rest.length > 0) {
      lines.push(`  ${rest.length} other check(s) passed or were informational.`);
    }
    return lines.join('\n');
  },
});

export const getSendingIpStatus = defineTool({
  name: 'get_sending_ip_status',
  description:
    'The state of the addresses this account sends from: warmup progress and how much of today’s ' +
    'allowance is left, plus whether any of them is on a DNS blocklist. Use it when a send is ' +
    'being throttled, or before scheduling a large campaign.',
  input: z.object({}),
  async run(_input, ctx) {
    const warmBody = (await expectOk(ctx, '/api/v1/sending/warmup')) as {
      data?: Array<{
        ipAddress?: string;
        warmupDay?: number;
        phase?: string;
        dailyLimit?: number;
        sentToday?: number;
        remainingToday?: number;
        isWarm?: boolean;
      }>;
    };
    const warm = warmBody.data ?? [];

    const ipsRes = await ctx.call('/api/v1/dedicated-ips', 'GET');
    const ips =
      ipsRes.status < 400
        ? ((
            ipsRes.body as {
              data?: Array<{
                ipAddress?: string;
                status?: string;
                blacklistCount?: number;
                todaySent?: number;
              }>;
            }
          ).data ?? [])
        : [];

    if (warm.length === 0 && ips.length === 0) {
      // Not a fault: most accounts send from the shared pool and have neither
      // a dedicated address nor a warmup schedule of their own.
      return 'This account sends from the shared pool — it has no dedicated IPs and nothing in warmup.';
    }

    const lines: string[] = [];
    if (warm.length > 0) {
      lines.push(`${warm.length} address(es) with a warmup schedule:`);
      for (const w of warm) {
        const cap =
          w.isWarm || w.dailyLimit === -1
            ? 'no daily cap (warm)'
            : `${w.sentToday ?? 0} / ${w.dailyLimit ?? '?'} today, ${w.remainingToday ?? 0} left`;
        lines.push(
          `  ${w.ipAddress ?? '?'} — day ${w.warmupDay ?? '?'}${w.phase ? ` (${w.phase})` : ''}: ${cap}`,
        );
      }
    }
    if (ips.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`${ips.length} dedicated IP(s):`);
      for (const ip of ips) {
        const listed =
          (ip.blacklistCount ?? 0) > 0 ? ` — LISTED on ${ip.blacklistCount} blocklist(s)` : '';
        lines.push(
          `  ${ip.ipAddress ?? '?'} — ${ip.status ?? 'unknown'}, ${ip.todaySent ?? 0} sent today${listed}`,
        );
      }
    }
    return lines.join('\n');
  },
});

export const deliverabilityTools = [
  getDomainAuthentication,
  getAccountDeliverability,
  getDeliverabilityByIsp,
  runPreSendChecks,
  getSendingIpStatus,
];
