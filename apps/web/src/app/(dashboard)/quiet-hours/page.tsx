import { MoonStar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface QuietHours {
  id: string;
  channel: string;
  startHour: number;
  endHour: number;
  timezone: string;
  enabled: boolean;
}

export const dynamic = 'force-dynamic';

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default async function QuietHoursPage() {
  const rows = await apiFetch<QuietHours[]>('/api/v1/quiet-hours', { fallback: [] });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Quiet hours</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Windows when marketing messages are held back per channel (TCPA-friendly).
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MoonStar className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No quiet hours configured</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((q) => (
            <li key={q.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <span className="font-medium capitalize text-secondary-900">{q.channel}</span>
                    <span className="ml-2 text-sm text-secondary-500">
                      {pad(q.startHour)}–{pad(q.endHour)} ({q.timezone})
                    </span>
                  </div>
                  <Badge variant={q.enabled ? 'success' : 'default'}>
                    {q.enabled ? 'Enabled' : 'Off'}
                  </Badge>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
