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
  'campaign.deliverability_blocked': 'Odeslání zablokováno',
  'campaign.deliverability_override': 'Odesláno přes potvrzení rizika',
  'campaign.deliverability_caution': 'Odesláno s varováním',
} as const;

const VIA: Record<string, string> = {
  send: 'tlačítko Odeslat',
  schedule: 'naplánování',
  'scheduled-dispatch': 'plánovač v naplánovaný čas',
  resume: 'opakované odeslání',
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
        { fallback: [] },
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
        <CardTitle>Předodesílací kontrola: {ACTIONS[record.action]}</CardTitle>
        <CardDescription>
          {new Date(record.createdAt).toLocaleString('cs-CZ')} · {VIA[m.via ?? ''] ?? m.via}
          {m.scheduledAt
            ? ` · naplánováno na ${new Date(m.scheduledAt).toLocaleString('cs-CZ')}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {returnedToDraft && (
          <p className="mb-2 text-sm text-secondary-800">
            V naplánovaný čas kontrola vyšla jako „neodesílat“, proto se kampaň vrátila do konceptu.
            Opravte níže uvedené, nebo ji odešlete s potvrzením rizika.
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
          <p className="text-sm text-secondary-600">Bez dalších podrobností.</p>
        )}
      </CardContent>
    </Card>
  );
}
