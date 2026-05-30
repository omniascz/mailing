/**
 * Internal daily-triggers orchestration (Sprint E.4).
 *
 * Workflow triggers like `name_day_today`, `n_days_before_holiday`, and
 * `date_field` (e.g. birthday) need a daily heartbeat — they don't fire
 * off contact/event activity, they fire because today is the right day.
 *
 * The three trigger-processor functions already exist in
 * services/workflows/triggers.ts (Sprint scope predating this commit).
 * Nothing called them. This endpoint is the orchestration shim: an
 * external cron (Hetzner systemd timer, GitHub Actions schedule, K8s
 * CronJob, BullMQ delayed-recurring job) hits it once per day, typically
 * at the start of business hours in the target market (06:00 UTC for
 * CZ/SK orgs ≈ 07:00 / 08:00 local depending on DST).
 *
 * Internal endpoint, no auth — should sit behind a network boundary or
 * shared-secret header in production.
 *
 * Idempotency: each processor function logs to workflow_runs and uses
 * today's date as a dedup key, so a second call on the same day is a
 * no-op. Safe to retry on transient failures.
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  processDailyDateTriggers,
  processDailyNameDayTriggers,
  processDailyHolidayTriggers,
} from '../../../services/workflows/triggers.js';
import { refreshAllOrgsRfm } from '../../../services/rfm/index.js';
import { refreshAllOrgsPredictions } from '../../../services/predictive-segmentation/index.js';
import { refreshAllOrgsChannelScores } from '../../../services/channel-scoring/index.js';

interface RunSummary {
  date: { triggered: number; error?: string };
  nameDay: { triggered: number; error?: string };
  holiday: { triggered: number; error?: string };
  rfm: { orgs: number; scored: number; errors: number; error?: string };
  predictions: { orgs: number; updated: number; errors: number; error?: string };
  channelScores: { orgs: number; scored: number; errors: number; error?: string };
  totalTriggered: number;
}

const internalTriggersRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/triggers/daily-run',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Run all daily workflow triggers (date/name-day/holiday)',
      },
    },
    async (_req, reply) => {
      // Run all three in parallel — they touch disjoint workflows
      // (filtered by triggerType) so there's no DB contention to fear.
      const [
        dateResult,
        nameDayResult,
        holidayResult,
        rfmResult,
        predResult,
        channelResult,
      ] = await Promise.allSettled([
        processDailyDateTriggers(),
        processDailyNameDayTriggers(),
        processDailyHolidayTriggers(),
        refreshAllOrgsRfm(),
        refreshAllOrgsPredictions(),
        refreshAllOrgsChannelScores(),
      ]);

      const summary: RunSummary = {
        date:
          dateResult.status === 'fulfilled'
            ? { triggered: dateResult.value.triggered }
            : {
                triggered: 0,
                error: String((dateResult.reason as Error)?.message ?? dateResult.reason),
              },
        nameDay:
          nameDayResult.status === 'fulfilled'
            ? { triggered: nameDayResult.value.triggered }
            : {
                triggered: 0,
                error: String((nameDayResult.reason as Error)?.message ?? nameDayResult.reason),
              },
        holiday:
          holidayResult.status === 'fulfilled'
            ? { triggered: holidayResult.value.triggered }
            : {
                triggered: 0,
                error: String((holidayResult.reason as Error)?.message ?? holidayResult.reason),
              },
        rfm:
          rfmResult.status === 'fulfilled'
            ? rfmResult.value
            : {
                orgs: 0,
                scored: 0,
                errors: 0,
                error: String((rfmResult.reason as Error)?.message ?? rfmResult.reason),
              },
        predictions:
          predResult.status === 'fulfilled'
            ? predResult.value
            : {
                orgs: 0,
                updated: 0,
                errors: 0,
                error: String((predResult.reason as Error)?.message ?? predResult.reason),
              },
        channelScores:
          channelResult.status === 'fulfilled'
            ? channelResult.value
            : {
                orgs: 0,
                scored: 0,
                errors: 0,
                error: String(
                  (channelResult.reason as Error)?.message ?? channelResult.reason,
                ),
              },
        totalTriggered: 0,
      };
      summary.totalTriggered =
        summary.date.triggered + summary.nameDay.triggered + summary.holiday.triggered;

      // 207 Multi-Status if any sub-task errored; 200 only when everything
      // ran cleanly. Lets monitoring distinguish "no triggers due today"
      // from "the holiday processor threw".
      const anyFailed = !!(
        summary.date.error ||
        summary.nameDay.error ||
        summary.holiday.error ||
        summary.rfm.error ||
        summary.predictions.error ||
        summary.channelScores.error
      );
      return reply.code(anyFailed ? 207 : 200).send({ data: summary });
    },
  );
};

export default internalTriggersRoutes;
