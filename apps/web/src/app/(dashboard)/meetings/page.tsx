import { CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Booking {
  id: string;
  inviteeEmail: string;
  inviteeName: string | null;
  title: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  status: 'confirmed' | 'cancelled' | 'rescheduled' | string;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  confirmed: 'success',
  cancelled: 'danger',
  rescheduled: 'warning',
};

export default async function MeetingsPage() {
  const bookings = await apiFetch<Booking[]>('/api/v1/meetings/bookings', { fallback: [] });
  const now = Date.now();
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const upcoming = sorted.filter((b) => new Date(b.startAt).getTime() >= now);
  const past = sorted.filter((b) => new Date(b.startAt).getTime() < now).reverse();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Meetings</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Bookings from your scheduling pages — round-robin team booking with calendar sync.
        </p>
      </header>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No bookings yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Share a booking page to start taking meetings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <BookingGroup title={`Upcoming (${upcoming.length})`} bookings={upcoming} />
          {past.length > 0 ? <BookingGroup title="Past" bookings={past.slice(0, 20)} /> : null}
        </div>
      )}
    </div>
  );
}

function BookingGroup({ title, bookings }: { title: string; bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold text-secondary-700">{title}</h2>
        <p className="text-sm text-secondary-500">Nothing here.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-secondary-700">{title}</h2>
      <ul className="space-y-2">
        {bookings.map((b) => (
          <li key={b.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-secondary-900">
                    {b.title ?? 'Meeting'} — {b.inviteeName ?? b.inviteeEmail}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {new Date(b.startAt).toLocaleString('cs-CZ')}
                    {b.location ? ` · ${b.location}` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_TONE[b.status] ?? 'default'}>{b.status}</Badge>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
