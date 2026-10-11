import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { criterionLabel, describeMetrics } from './pre-send-report';

/**
 * The last decision the pre-send gate made about this campaign, from the audit
 * log the gate writes (#245). It is how an owner learns why the scheduler put
 * a scheduled campaign back into draft: the cron has no one to answer, so its
 * refusal exists only here.
 *
 * Read through GET /api/v1/audit-logs filtered to this campaign
 * (resourceId), one action at a time, newest first — the server reads this
 * campaign's rows of the caller's organisation and nothing else. The route is
 * for owners and admins; anyone else gets nothing back and sees no card.
 */

const ACTIONS = {
  'campaign.deliverability_blocked': 'Sending blocked',
  'campaign.deliverability_override': 'Sent with the risk acknowledged',
  'campaign.deliverability_caution': 'Sent with warnings',
} as const;

const VIA: Record<string, string> = {
  send: 'the Send button',
  schedule: 'scheduling',
  'scheduled-dispatch': 'the scheduler at the scheduled time',
  resume: 'resume',
  broadcast: 'API (broadcast)',
};

interface AuditRow {
  id: string;
  action: keyof typeof ACTIONS;
  resourceId: string | null;
  createdAt: string;
  metadata: {
    via?: string;
    verdict?: string;
    blocking?: Array<{ id: string; title: string; metrics?: Record<string, string | number> }>;
    warnings?: Array<{ id: string; title: string; metrics?: Record<string, string | number> }>;
    scheduledAt?: string;
  } | null;
}

export async function latestGateRecord(campaignId: string): Promise<AuditRow | null> {
  const lists = await Promise.all(
    (Object.keys(ACTIONS) as Array<keyof typeof ACTIONS>).map((action) =>
      apiFetch<AuditRow[]>(
        `/api/v1/audit-logs?resource=campaign&resourceId=${encodeURIComponent(campaignId)}` +
          `&action=${encodeURIComponent(action)}&limit=1`,
        // 403 for an editor or viewer, whom the audit log is not for: no card,
        // not an error page. Anything else that fails is an error worth seeing.
        { fallback: [], absentOn: [403, 404] },
      ),
    ),
  );
  const mine = lists.flat().filter((r) => r.resourceId === campaignId);
  mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine[0] ?? null;
}

export function DeliverabilityRecordCard({ record }: { record: AuditRow }) {
  const m = record.metadata ?? {};
  const listed = record.action === 'campaign.deliverability_caution' ? m.warnings : m.blocking;
  const returnedToDraft =
    record.action === 'campaign.deliverability_blocked' && m.via === 'scheduled-dispatch';
  return (
    <Card data-testid="deliverability-record">
      <CardHeader>
        <CardTitle>Pre-send check: {ACTIONS[record.action]}</CardTitle>
        <CardDescription>
          {new Date(record.createdAt).toLocaleString('en-GB')} · {VIA[m.via ?? ''] ?? m.via}
          {m.scheduledAt
            ? ` · scheduled for ${new Date(m.scheduledAt).toLocaleString('en-GB')}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {returnedToDraft && (
          <p className="mb-2 text-sm text-secondary-800">
            At the scheduled time the check said “no-go”, so the campaign went back to draft. Fix
            what is listed below, or send it with the risk acknowledged.
          </p>
        )}
        {listed && listed.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {listed.map((c) => (
              <li key={c.id}>
                <p className="font-medium text-secondary-900">{criterionLabel(c.id)}</p>
                <p className="text-secondary-700">{c.title}</p>
                <ul className="list-disc pl-5 text-secondary-700">
                  {describeMetrics(c.metrics).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-secondary-600">No further details.</p>
        )}
      </CardContent>
    </Card>
  );
}
