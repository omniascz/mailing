import { LifeBuoy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed' | string;
  priority: 'low' | 'normal' | 'high' | 'urgent' | string;
  channel: string;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'primary' | 'warning' | 'default'> = {
  open: 'primary',
  pending: 'warning',
  closed: 'default',
};
const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'default'> = {
  urgent: 'danger',
  high: 'danger',
  normal: 'default',
  low: 'default',
};

export default async function HelpdeskPage() {
  const tickets = await apiFetch<Ticket[]>('/api/v1/helpdesk/tickets', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Helpdesk</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Support tickets across email, chat and social — the unified inbox.
        </p>
      </header>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LifeBuoy className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No tickets</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-secondary-900">{t.subject}</p>
                    <p className="text-xs capitalize text-secondary-500">
                      {t.channel} · {new Date(t.createdAt).toLocaleDateString('cs-CZ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={PRIORITY_TONE[t.priority] ?? 'default'}>{t.priority}</Badge>
                    <Badge variant={STATUS_TONE[t.status] ?? 'default'}>{t.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
