/**
 * Who may override the pre-send gate.
 *
 * Sending, scheduling and resuming are for an editor and up (the routes say so
 * with requireRole). Sending a campaign the gate calls no-go anyway is not an
 * editor's decision: it puts the organisation's sending reputation at risk, so
 * `acknowledgeDeliverabilityRisk: true` is accepted only from an owner or an
 * admin. An editor who sends it gets 403 — whatever the verdict, so the answer
 * does not depend on numbers that move between two clicks.
 *
 * API keys act with the admin role (plugins/auth.ts), so they may override.
 */

import type { UserRole } from '@forgemsg/shared';
import { AppError } from '../../lib/app-error.js';
import { ACKNOWLEDGE_FIELD } from './send-gate.js';

const MAY_OVERRIDE: ReadonlySet<UserRole> = new Set<UserRole>(['owner', 'admin', 'system_admin']);

export function assertMayOverrideGate(
  user: { role: UserRole } | undefined,
  acknowledgeDeliverabilityRisk: boolean | undefined,
): void {
  if (acknowledgeDeliverabilityRisk !== true) return;
  if (user && MAY_OVERRIDE.has(user.role)) return;
  throw AppError.forbidden(
    `Only an owner or admin can send despite the pre-send check (${ACKNOWLEDGE_FIELD}: true).`,
  );
}
