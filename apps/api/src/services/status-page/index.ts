/**
 * Status page orchestration (Sprint H.5).
 *
 * Public entry points:
 *   reportIncident(kind, ctx)   — open or update an incident
 *   resolveByDedup(kind, ctx)   — resolve an open incident matching the
 *                                 signal + region (idempotent)
 *   listOpen()                  — pass-through to the client
 *
 * The orchestrator handles dedup (one open incident per kind+region),
 * delegates classification to `pure.ts`, and never throws — failures are
 * logged and swallowed so a monitoring webhook never 5xxes a probe over
 * a status-page outage.
 */

import { selectClient, type InstatusClient, type InstatusIncident } from './instatus.js';
import {
  buildIncidentBody,
  buildIncidentTitle,
  buildResolveBody,
  dedupKey,
  initialStatus,
  pickIncidentToUpdate,
  routeSignal,
  sanitiseMetrics,
  type SignalContext,
  type SignalKind,
} from './pure.js';

let cachedClient: InstatusClient | null = null;

function client(): InstatusClient {
  if (!cachedClient) cachedClient = selectClient();
  return cachedClient;
}

/** Test seam — replace the cached client. */
export function _setClient(c: InstatusClient | null) {
  cachedClient = c;
}

export interface ReportResult {
  status: 'opened' | 'updated' | 'noop';
  incidentId: string | null;
  available: boolean;
}

/**
 * Open or update an incident corresponding to the given signal. Caller
 * provides the kind + optional region/summary/metrics; the orchestrator
 * decides whether this is a new incident or an update to an open one.
 *
 * Never throws. Logs to console on failure so a Sentry/healthcheck
 * webhook can still ack 200 even when Instatus is having a bad day.
 */
export async function reportIncident(
  kind: SignalKind,
  ctx: SignalContext = {},
): Promise<ReportResult> {
  const c = client();
  if (!c.available) {
    return { status: 'noop', incidentId: null, available: false };
  }

  const { impact, component } = routeSignal(kind);
  const status = initialStatus(impact);
  const title = buildIncidentTitle(kind, ctx);
  const body = buildIncidentBody(kind, {
    ...ctx,
    metrics: sanitiseMetrics(ctx.metrics as Record<string, unknown> | undefined),
  });
  const key = dedupKey(kind, ctx);

  try {
    const open = await c.listOpenIncidents();
    const openWithKey = open.map((i) => ({
      id: i.id,
      dedupKey: i.metadata?.dedupKey ?? '',
      status: i.status,
    }));
    const existingId = pickIncidentToUpdate(kind, ctx, openWithKey);

    if (existingId) {
      await c.postUpdate(existingId, body, status);
      return { status: 'updated', incidentId: existingId, available: true };
    }

    const incident = await c.createIncident({
      name: title,
      message: body,
      status,
      impact,
      components: [component],
      metadata: { dedupKey: key, kind, region: ctx.region ?? '' },
    });
    return { status: 'opened', incidentId: incident.id, available: true };
  } catch (err) {
    console.error('[status-page] reportIncident failed', { kind, err });
    return { status: 'noop', incidentId: null, available: true };
  }
}

/**
 * Resolve any open incident matching (kind, region). Idempotent — does
 * nothing if no matching open incident is found. The duration shown on
 * the public page is computed from the incident's createdAt.
 */
export async function resolveByDedup(
  kind: SignalKind,
  ctx: SignalContext = {},
  postmortemUrl?: string,
): Promise<{ resolved: boolean; incidentId: string | null }> {
  const c = client();
  if (!c.available) return { resolved: false, incidentId: null };

  const key = dedupKey(kind, ctx);
  try {
    const open = await c.listOpenIncidents();
    const match = open.find(
      (i) => (i.metadata?.dedupKey ?? '') === key && i.status !== 'RESOLVED',
    );
    if (!match) return { resolved: false, incidentId: null };

    const durationSeconds = (Date.now() - new Date(match.createdAt).getTime()) / 1000;
    await c.resolveIncident(match.id, buildResolveBody(durationSeconds, postmortemUrl));
    return { resolved: true, incidentId: match.id };
  } catch (err) {
    console.error('[status-page] resolveByDedup failed', { kind, err });
    return { resolved: false, incidentId: null };
  }
}

export async function listOpen(): Promise<InstatusIncident[]> {
  const c = client();
  if (!c.available) return [];
  try {
    return await c.listOpenIncidents();
  } catch (err) {
    console.error('[status-page] listOpen failed', { err });
    return [];
  }
}
