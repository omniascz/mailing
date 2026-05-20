import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  Phone,
  Tag,
  Calendar,
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { EditContactButton } from './edit-contact-button';
import { ManageTags } from './manage-tags';
import { ManageLists } from './manage-lists';
import { ActivityTimeline } from './activity-timeline';
import { CustomFieldsCard } from './custom-fields-card';
import { LeadScoreCard } from './lead-score-card';

interface Contact {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  lifecycleStage: string | null;
  totalSends: number | null;
  totalOpens: number | null;
  totalClicks: number | null;
  totalOrders?: number | null;
  totalRevenue?: string | null;
  tags?: Array<{ id: string; name: string }>;
  lists?: Array<{ id: string; name: string }>;
  customFields?: Record<string, string | number | boolean | null> | null;
  leadScore?: string | number | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadScoreEvent {
  id: string;
  eventType: string;
  points: number;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface CustomFieldDef {
  id: string;
  name: string;
  key: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
}

interface RfmScore {
  recency: number;
  frequency: number;
  monetary: number;
  combined: number;
  segment: string;
}

interface Predictions {
  clv: number;
  purchaseLikelihood: number;
  churnRisk: number;
  predictedAt: string | null;
}

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  unsubscribed: 'warning',
  bounced: 'danger',
  complained: 'danger',
};

const RFM_LABELS: Record<string, string> = {
  champions: 'Champions',
  loyal: 'Loyal',
  potential_loyalists: 'Potential loyalists',
  recent_customers: 'Recent customers',
  promising: 'Promising',
  needs_attention: 'Needs attention',
  about_to_sleep: 'About to sleep',
  at_risk: 'At risk',
  cant_lose: "Can't lose",
  hibernating: 'Hibernating',
  lost: 'Lost',
};

export const dynamic = 'force-dynamic';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, rfm, pred, allTags, allLists, activity, customFieldDefs, leadScoreHistory] =
    await Promise.all([
      apiFetch<Contact | null>(`/api/v1/contacts/${id}`, { fallback: null }),
      apiFetch<RfmScore | null>(`/api/v1/rfm/contacts/${id}`, { fallback: null }),
      apiFetch<Predictions | null>(`/api/v1/predictive/contacts/${id}`, { fallback: null }),
      apiFetch<Array<{ id: string; name: string; color: string | null }>>('/api/v1/tags', {
        fallback: [],
      }),
      apiFetch<Array<{ id: string; name: string }>>('/api/v1/lists', { fallback: [] }),
      apiFetch<
        Array<{
          timestamp: string;
          type: 'email' | 'order' | 'event' | 'ticket';
          summary: string;
          details: Record<string, unknown>;
        }>
      >(`/api/v1/contacts/${id}/activity?limit=100`, { fallback: [] }),
      apiFetch<CustomFieldDef[]>('/api/v1/custom-fields', { fallback: [] }),
      apiFetch<LeadScoreEvent[]>(`/api/v1/lead-scoring/contacts/${id}/history?limit=20`, {
        fallback: [],
      }),
    ]);
  // Backend service returns each event-type block ordered desc but merges them
  // without a final sort across types. Resort here so the timeline reads
  // strictly newest-first regardless of which event type is dense.
  const sortedActivity = [...activity].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  if (!contact) notFound();

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  const display = name || contact.email || contact.phone || '(no identifier)';
  const engagement =
    (contact.totalSends ?? 0) > 0
      ? `${(((contact.totalOpens ?? 0) / (contact.totalSends ?? 1)) * 100).toFixed(0)}% opens`
      : 'No sends yet';

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/contacts"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-secondary-900">{display}</h1>
            <Badge variant={STATUS_TONE[contact.status] ?? 'default'}>{contact.status}</Badge>
            {contact.lifecycleStage ? (
              <Badge variant="primary">{contact.lifecycleStage}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-secondary-500">
            Added {new Date(contact.createdAt).toLocaleDateString('cs-CZ')} · Updated{' '}
            {new Date(contact.updatedAt).toLocaleDateString('cs-CZ')}
          </p>
        </div>
        <EditContactButton
          contact={{
            id: contact.id,
            email: contact.email,
            phone: contact.phone,
            firstName: contact.firstName,
            lastName: contact.lastName,
            status: contact.status,
            lifecycleStage: contact.lifecycleStage,
          }}
        />
      </header>

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Contact methods + audience membership</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row
                icon={<Mail className="h-3.5 w-3.5 text-secondary-400" />}
                label="Email"
                value={contact.email}
              />
              <Row
                icon={<Phone className="h-3.5 w-3.5 text-secondary-400" />}
                label="Phone"
                value={contact.phone}
              />
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-1.5 pt-0.5 text-secondary-500">
                  <Tag className="h-3.5 w-3.5 text-secondary-400" />
                  Tags
                </dt>
                <dd className="flex-1 text-right">
                  <ManageTags
                    contactId={contact.id}
                    currentTags={contact.tags ?? []}
                    availableTags={allTags}
                  />
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-1.5 pt-0.5 text-secondary-500">
                  <Calendar className="h-3.5 w-3.5 text-secondary-400" />
                  Lists
                </dt>
                <dd className="flex-1 text-right">
                  <ManageLists
                    contactId={contact.id}
                    currentLists={contact.lists ?? []}
                    availableLists={allLists}
                  />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engagement</CardTitle>
            <CardDescription>{engagement}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Sends" value={(contact.totalSends ?? 0).toLocaleString('cs-CZ')} />
              <Stat label="Opens" value={(contact.totalOpens ?? 0).toLocaleString('cs-CZ')} />
              <Stat label="Clicks" value={(contact.totalClicks ?? 0).toLocaleString('cs-CZ')} />
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RFM widget */}
        <Card>
          <CardHeader>
            <CardTitle>RFM cohort</CardTitle>
            <CardDescription>Lifecycle stage based on R/F/M scoring</CardDescription>
          </CardHeader>
          <CardContent>
            {rfm ? (
              <>
                <p className="text-2xl font-semibold text-secondary-900">
                  {RFM_LABELS[rfm.segment] ?? rfm.segment}
                </p>
                <p className="mt-1 text-xs text-secondary-500">Combined score {rfm.combined}</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Stat label="R" value={String(rfm.recency)} />
                  <Stat label="F" value={String(rfm.frequency)} />
                  <Stat label="M" value={String(rfm.monetary)} />
                </dl>
              </>
            ) : (
              <p className="text-sm text-secondary-500">
                No score yet — RFM refresh hasn't computed this contact.
              </p>
            )}
          </CardContent>
        </Card>

        {/* CLV widget */}
        <Card>
          <CardHeader>
            <CardTitle>Predicted CLV</CardTitle>
            <CardDescription>2-year forecast value</CardDescription>
          </CardHeader>
          <CardContent>
            {pred ? (
              <>
                <p className="text-2xl font-semibold text-secondary-900 tabular-nums">
                  €{pred.clv.toFixed(0)}
                </p>
                <p className="mt-1 text-xs text-secondary-500">
                  Refreshed{' '}
                  {pred.predictedAt ? new Date(pred.predictedAt).toLocaleDateString('cs-CZ') : '—'}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-secondary-700">
                    Purchase likelihood: <b>{(pred.purchaseLikelihood * 100).toFixed(0)}%</b>
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-secondary-500">Not scored yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Lead score widget */}
        <LeadScoreCard currentScore={Number(contact.leadScore ?? 0)} history={leadScoreHistory} />

        {/* Churn widget */}
        <Card>
          <CardHeader>
            <CardTitle>Churn risk</CardTitle>
            <CardDescription>Higher means more likely to lapse</CardDescription>
          </CardHeader>
          <CardContent>
            {pred ? (
              <>
                <p
                  className={
                    'text-2xl font-semibold tabular-nums ' +
                    (pred.churnRisk >= 0.7
                      ? 'text-rose-600'
                      : pred.churnRisk >= 0.3
                        ? 'text-amber-600'
                        : 'text-emerald-600')
                  }
                >
                  {(pred.churnRisk * 100).toFixed(0)}%
                </p>
                <p className="mt-1 text-xs text-secondary-500">
                  {pred.churnRisk >= 0.7
                    ? 'High risk — candidate for win-back'
                    : pred.churnRisk >= 0.3
                      ? 'Medium risk'
                      : 'Low risk'}
                </p>
                {pred.churnRisk >= 0.7 ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md bg-rose-50 p-2 text-xs text-rose-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Consider enrolling in a win-back workflow.
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-secondary-500">Not scored yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Custom fields */}
        <div className="lg:col-span-3">
          <CustomFieldsCard
            contactId={contact.id}
            definitions={customFieldDefs}
            initialValues={
              (contact.customFields ?? {}) as Record<string, string | number | boolean | null>
            }
          />
        </div>

        {/* Revenue widget */}
        {contact.totalOrders != null && contact.totalOrders > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Purchase history</CardTitle>
              <CardDescription>Aggregated from revenue events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-secondary-500">Orders</p>
                  <p className="mt-1 flex items-center gap-2 text-2xl font-semibold text-secondary-900 tabular-nums">
                    <ShoppingBag className="h-5 w-5 text-secondary-400" />
                    {contact.totalOrders.toLocaleString('cs-CZ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-secondary-500">
                    Lifetime revenue
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">
                    €{Number(contact.totalRevenue ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              Chronological feed of email events, orders, and tracked custom events. Most recent
              first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTimeline rows={sortedActivity} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-secondary-500">
        {icon}
        {label}
      </dt>
      <dd className="truncate text-secondary-900">
        {value || <span className="text-secondary-400">—</span>}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-secondary-900">{value}</p>
    </div>
  );
}
