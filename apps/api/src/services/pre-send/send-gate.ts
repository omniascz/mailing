/**
 * The pre-send verdict, enforced at the one place a campaign enters sending.
 *
 * The go/no-go panel (go-no-go.ts) used to be advisory: GET
 * /campaigns/:id/pre-send-checks and the MCP tool read it, and nothing on the
 * send path did — a campaign with a no-go verdict went out like any other.
 * This is that verdict applied, at the status flip in sendCampaign, which every
 * send runs through: POST /campaigns/:id/send, the scheduled-campaign cron and
 * a send_failed resume (all via enqueueCampaignSend), and the Resend-compatible
 * broadcast send.
 *
 *   no-go          refused with 422, naming each failing criterion and the
 *                  numbers it measured
 *   no-go + ack    sent; the override is recorded with the verdict it overrode
 *   caution        sent; the verdict is recorded
 *   go             sent
 *
 * A criterion without enough history (fewer delivery outcomes than the
 * auto-pause needs) is information, not a failure, so a new organisation is a
 * 'go' on its history and the gate only stops what the panel can stand behind.
 *
 * Recorded in audit_logs (resource 'campaign'), the existing trail for who did
 * what to which record. Transactional mail and flow mail never pass here: they
 * leave through sendTransactionalEmail and the workflow engine, which do not
 * touch campaign status.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { logAuditEvent } from '../audit-log/index.js';
import { runPreSendChecks, type GoNoGoReport } from './go-no-go.js';
import type { CheckResult } from './go-no-go-pure.js';

/** The body field a caller sets to send despite a no-go verdict. */
export const ACKNOWLEDGE_FIELD = 'acknowledgeDeliverabilityRisk';

export const GATE_ACTIONS = {
  blocked: 'campaign.deliverability_blocked',
  overridden: 'campaign.deliverability_override',
  caution: 'campaign.deliverability_caution',
} as const;

export type GateEntry = 'send' | 'schedule' | 'scheduled-dispatch' | 'resume' | 'broadcast';

export interface SendGateOptions {
  acknowledgeDeliverabilityRisk?: boolean;
  userId?: string | null;
  via?: GateEntry;
  /** For a schedule: the time the acknowledgement is bound to. */
  scheduledAt?: Date | null;
}

interface CriterionSummary {
  id: string;
  title: string;
  metrics?: CheckResult['metrics'];
}

const summarise = (c: CheckResult): CriterionSummary => ({
  id: c.id,
  title: c.title,
  ...(c.metrics ? { metrics: c.metrics } : {}),
});

function describe(c: CriterionSummary): string {
  const m = c.metrics
    ? ` [${Object.entries(c.metrics)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
        .join(', ')}]`
    : '';
  return `${c.id}: ${c.title}${m}`;
}

/**
 * Evaluate the verdict for a campaign about to be sent, and refuse a no-go one
 * unless the caller acknowledged it. Returns the report it decided on.
 */
export async function enforceDeliverabilityGate(
  orgId: string,
  campaignId: string,
  opts: SendGateOptions = {},
): Promise<GoNoGoReport> {
  const report = await runPreSendChecks(orgId, campaignId);
  const blocking = report.checks.filter((c) => c.severity === 'fail').map(summarise);
  const warnings = report.checks.filter((c) => c.severity === 'warn').map(summarise);
  const via = opts.via ?? 'send';
  const record = (action: string) =>
    logAuditEvent({
      orgId,
      userId: opts.userId ?? null,
      action,
      resource: 'campaign',
      resourceId: campaignId,
      metadata: {
        via,
        verdict: report.verdict,
        score: report.score,
        grade: report.grade,
        blocking,
        warnings,
        ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt.toISOString() } : {}),
      },
    });

  if (report.verdict === 'no-go') {
    if (opts.acknowledgeDeliverabilityRisk === true) {
      await record(GATE_ACTIONS.overridden);
      return report;
    }
    await record(GATE_ACTIONS.blocked);
    throw new AppError({
      code: 'DELIVERABILITY_NO_GO',
      statusCode: 422,
      message:
        `The pre-send check says no-go: ${blocking.map(describe).join('; ')}. ` +
        `Fix ${blocking.length === 1 ? 'it' : 'them'}, or send again with ` +
        `${ACKNOWLEDGE_FIELD}: true to send anyway (the override is recorded).`,
      details: {
        verdict: report.verdict,
        score: report.score,
        blocking,
        warnings,
        override: ACKNOWLEDGE_FIELD,
      },
    });
  }

  if (report.verdict === 'caution') await record(GATE_ACTIONS.caution);
  return report;
}

/**
 * Whether the schedule a campaign carries now was acknowledged when it was set.
 * The scheduled cron has no caller to ask, so the acknowledgement given on
 * POST /schedule travels as the override record, bound to that exact time: a
 * campaign rescheduled since must be acknowledged again.
 */
export async function scheduleWasAcknowledged(
  orgId: string,
  campaignId: string,
  scheduledAt: Date | null,
): Promise<boolean> {
  if (!scheduledAt) return false;
  const [row] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.orgId, orgId),
        eq(auditLogs.resource, 'campaign'),
        eq(auditLogs.resourceId, campaignId),
        eq(auditLogs.action, GATE_ACTIONS.overridden),
        sql`${auditLogs.metadata}->>'via' = 'schedule'`,
        sql`${auditLogs.metadata}->>'scheduledAt' = ${scheduledAt.toISOString()}`,
      ),
    )
    .limit(1);
  return !!row;
}
