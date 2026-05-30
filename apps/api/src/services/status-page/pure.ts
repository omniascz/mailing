/**
 * Status page pure helpers (Sprint H.5).
 *
 * Decoupled from network + DB so unit tests cover the interesting logic:
 * severity classification, component routing, incident dedup, and
 * markdown body formatting. The HTTP client + service shell delegate
 * here.
 */

/** Internal subsystem signals our monitoring can raise. */
export type SignalKind =
  | 'db_down'
  | 'redis_down'
  | 'queue_backlog'
  | 'high_bounce_rate'
  | 'high_complaint_rate'
  | 'engine_unreachable'
  | 'webhook_failures'
  | 'auth_outage'
  | 'tracking_pixel_down'
  | 'sms_provider_outage';

/** Mirrors Instatus's status enum exactly. */
export type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';

/**
 * Mirrors Instatus impact levels. We use the four user-facing levels;
 * MAINTENANCE is handled separately via the maintenances endpoint.
 */
export type IncidentImpact = 'OPERATIONAL' | 'MINOROUTAGE' | 'MAJOROUTAGE' | 'CRITICAL';

/** Stable Instatus component slugs — keep in sync with the Instatus admin UI. */
export const COMPONENT_SLUGS = {
  api: 'api',
  database: 'database',
  queue: 'job-queue',
  sending: 'email-sending',
  sms: 'sms-sending',
  tracking: 'click-and-open-tracking',
  webhooks: 'webhooks',
  auth: 'authentication',
} as const;

export type ComponentSlug = (typeof COMPONENT_SLUGS)[keyof typeof COMPONENT_SLUGS];

/**
 * Map a raised signal to (component, severity). Lookup is exhaustive over
 * SignalKind so the type-checker catches new signals that forget routing.
 */
export function routeSignal(kind: SignalKind): {
  component: ComponentSlug;
  impact: IncidentImpact;
} {
  switch (kind) {
    case 'db_down':
      return { component: COMPONENT_SLUGS.database, impact: 'CRITICAL' };
    case 'redis_down':
      // Redis backs queue + rate-limits + sessions; without it the API
      // appears working but writes silently fail. Treat as major.
      return { component: COMPONENT_SLUGS.queue, impact: 'MAJOROUTAGE' };
    case 'queue_backlog':
      return { component: COMPONENT_SLUGS.queue, impact: 'MINOROUTAGE' };
    case 'high_bounce_rate':
      return { component: COMPONENT_SLUGS.sending, impact: 'MAJOROUTAGE' };
    case 'high_complaint_rate':
      return { component: COMPONENT_SLUGS.sending, impact: 'MAJOROUTAGE' };
    case 'engine_unreachable':
      return { component: COMPONENT_SLUGS.sending, impact: 'CRITICAL' };
    case 'webhook_failures':
      return { component: COMPONENT_SLUGS.webhooks, impact: 'MINOROUTAGE' };
    case 'auth_outage':
      return { component: COMPONENT_SLUGS.auth, impact: 'CRITICAL' };
    case 'tracking_pixel_down':
      return { component: COMPONENT_SLUGS.tracking, impact: 'MINOROUTAGE' };
    case 'sms_provider_outage':
      return { component: COMPONENT_SLUGS.sms, impact: 'MAJOROUTAGE' };
  }
}

/** Default initial status for newly opened incidents per impact level. */
export function initialStatus(impact: IncidentImpact): IncidentStatus {
  // Critical events warrant "IDENTIFIED" so the public page makes clear
  // we're already aware; everything softer enters as "INVESTIGATING".
  return impact === 'CRITICAL' ? 'IDENTIFIED' : 'INVESTIGATING';
}

/**
 * Title prefix per impact, kept short so the Instatus widget renders on
 * narrow viewports without ellipsing the meaningful suffix.
 */
export function titlePrefix(impact: IncidentImpact): string {
  switch (impact) {
    case 'CRITICAL':
      return 'Critical:';
    case 'MAJOROUTAGE':
      return 'Major:';
    case 'MINOROUTAGE':
      return 'Degraded:';
    case 'OPERATIONAL':
      return 'Notice:';
  }
}

export interface SignalContext {
  /** Optional human suffix joined to the canonical title. */
  summary?: string;
  /** Metrics surfaced in the incident body. */
  metrics?: Record<string, string | number>;
  /** Region or shard identifier when the issue is partial. */
  region?: string;
}

/** Canonical incident title — stable across update calls so dedup works. */
export function buildIncidentTitle(kind: SignalKind, ctx: SignalContext = {}): string {
  const { impact } = routeSignal(kind);
  const subject = signalSubject(kind);
  const region = ctx.region ? ` (${ctx.region})` : '';
  const suffix = ctx.summary ? ` — ${ctx.summary}` : '';
  return `${titlePrefix(impact)} ${subject}${region}${suffix}`.slice(0, 140);
}

/** Hard-coded readable subject per signal kind. */
function signalSubject(kind: SignalKind): string {
  switch (kind) {
    case 'db_down':
      return 'Primary database unreachable';
    case 'redis_down':
      return 'Cache and queue layer unreachable';
    case 'queue_backlog':
      return 'Job queue backlog detected';
    case 'high_bounce_rate':
      return 'Elevated bounce rate';
    case 'high_complaint_rate':
      return 'Elevated complaint rate';
    case 'engine_unreachable':
      return 'Sending engine unreachable';
    case 'webhook_failures':
      return 'Outbound webhook delivery degraded';
    case 'auth_outage':
      return 'Sign-in unavailable';
    case 'tracking_pixel_down':
      return 'Open and click tracking degraded';
    case 'sms_provider_outage':
      return 'SMS gateway outage';
  }
}

/** Markdown body for a freshly opened incident. */
export function buildIncidentBody(kind: SignalKind, ctx: SignalContext = {}): string {
  const lines: string[] = [];
  lines.push(`We've detected ${signalSubject(kind).toLowerCase()} on MailForge.`);
  lines.push('');
  if (ctx.region) {
    lines.push(`**Region:** ${ctx.region}`);
  }
  lines.push(`**Detected at:** ${new Date().toISOString()}`);

  if (ctx.metrics && Object.keys(ctx.metrics).length > 0) {
    lines.push('');
    lines.push('**Metrics at detection:**');
    for (const [k, v] of Object.entries(ctx.metrics)) {
      lines.push(`- ${k}: ${v}`);
    }
  }
  lines.push('');
  lines.push('We are investigating and will post updates as we learn more.');
  return lines.join('\n');
}

/**
 * Markdown body for the resolve transition. We append rather than rewrite
 * so the timeline on the public page reads chronologically.
 */
export function buildResolveBody(durationSeconds: number, postmortemUrl?: string): string {
  const human = formatDuration(durationSeconds);
  const lines = [
    `Incident resolved after ${human}. All metrics back within nominal ranges.`,
  ];
  if (postmortemUrl) {
    lines.push('');
    lines.push(`Post-mortem: ${postmortemUrl}`);
  }
  return lines.join('\n');
}

/** "PT15M" style → "15 minutes". Hand-rolled to avoid ms-dep. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}

/**
 * Dedup key — stable per (kind, region). Two signals raising the same key
 * within the dedup window should update the existing incident, not open
 * a new one.
 */
export function dedupKey(kind: SignalKind, ctx: SignalContext = {}): string {
  return ctx.region ? `${kind}:${ctx.region}` : kind;
}

/**
 * Decide whether a fresh signal should open a new incident or update an
 * existing open one. Returns the open incident id when an update is the
 * right move, else null.
 */
export function pickIncidentToUpdate(
  kind: SignalKind,
  ctx: SignalContext,
  openIncidents: Array<{ id: string; dedupKey: string; status: IncidentStatus }>,
): string | null {
  const key = dedupKey(kind, ctx);
  const match = openIncidents.find(
    (i) => i.dedupKey === key && i.status !== 'RESOLVED',
  );
  return match?.id ?? null;
}

/**
 * Trim and sanitise an arbitrary metric record before it lands in a
 * public incident body — no PII allowed by convention; we strip values
 * longer than 80 chars and drop any key matching common PII patterns.
 */
const PII_KEY_RE = /^(email|password|token|secret|key|address|phone|ip)$/i;

export function sanitiseMetrics(
  metrics: Record<string, unknown> | undefined,
): Record<string, string | number> {
  if (!metrics) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (PII_KEY_RE.test(k)) continue;
    if (typeof v === 'number') {
      out[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
      continue;
    }
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (!s) continue;
    out[k] = s.slice(0, 80);
  }
  return out;
}
