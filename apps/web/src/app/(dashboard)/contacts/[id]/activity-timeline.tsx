import {
  Mail,
  ShoppingBag,
  Activity,
  MessageSquare,
  MousePointerClick,
  MailOpen,
  MailX,
  UserMinus,
} from 'lucide-react';

interface ActivityRow {
  timestamp: string;
  type: 'email' | 'order' | 'event' | 'ticket';
  summary: string;
  details: Record<string, unknown>;
}

/**
 * Pick an icon + tint based on the activity type and (for email events)
 * the sub-eventType inside details. We can't expand the activity-export
 * shape, but the email eventType comes through `details.eventType`.
 */
function iconFor(row: ActivityRow): { Icon: typeof Mail; tone: string } {
  if (row.type === 'order') return { Icon: ShoppingBag, tone: 'text-emerald-600 bg-emerald-50' };
  if (row.type === 'ticket') return { Icon: MessageSquare, tone: 'text-violet-600 bg-violet-50' };
  if (row.type === 'event') return { Icon: Activity, tone: 'text-primary-600 bg-primary-50' };

  // email — branch on sub-type for visual signal
  const sub = String(row.details.eventType ?? '');
  if (sub === 'open') return { Icon: MailOpen, tone: 'text-amber-600 bg-amber-50' };
  if (sub === 'click') return { Icon: MousePointerClick, tone: 'text-primary-600 bg-primary-50' };
  if (sub === 'bounce' || sub === 'complaint')
    return { Icon: MailX, tone: 'text-rose-600 bg-rose-50' };
  if (sub === 'unsubscribe')
    return { Icon: UserMinus, tone: 'text-secondary-600 bg-secondary-100' };
  return { Icon: Mail, tone: 'text-secondary-600 bg-secondary-100' };
}

/**
 * Server-rendered chronological feed. Already sorted by the backend
 * service (each block descending; merged into a single descending list
 * by JS .sort on timestamp). Limit comes from the page query.
 */
export function ActivityTimeline({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
        No activity yet. Once this contact opens a campaign, buys something, or hits a tracked
        event, you'll see it here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {rows.map((row, i) => {
        const { Icon, tone } = iconFor(row);
        const ts = new Date(row.timestamp);
        const linkUrl = typeof row.details.linkUrl === 'string' ? row.details.linkUrl : null;
        const campaignId =
          typeof row.details.campaignId === 'string' ? row.details.campaignId : null;
        const amount =
          typeof row.details.amount === 'string' || typeof row.details.amount === 'number'
            ? row.details.amount
            : null;
        const currency = typeof row.details.currency === 'string' ? row.details.currency : null;

        return (
          <li key={i} className="flex items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex-1 pt-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-medium text-secondary-900">{row.summary}</p>
                {amount != null ? (
                  <span className="text-sm font-semibold tabular-nums text-emerald-700">
                    {currency ? `${currency} ` : ''}
                    {Number(amount).toFixed(2)}
                  </span>
                ) : null}
                <time
                  dateTime={ts.toISOString()}
                  className="text-xs text-secondary-500"
                  title={ts.toLocaleString('cs-CZ')}
                >
                  {ts.toLocaleString('cs-CZ', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {linkUrl ? (
                <p className="mt-0.5 truncate font-mono text-xs text-secondary-500" title={linkUrl}>
                  {linkUrl}
                </p>
              ) : null}
              {campaignId ? (
                <p className="mt-0.5 text-xs text-secondary-500">
                  Campaign{' '}
                  <a
                    href={`/campaigns/${campaignId}`}
                    className="font-mono text-primary-700 hover:text-primary-900"
                  >
                    {campaignId.slice(0, 8)}…
                  </a>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
