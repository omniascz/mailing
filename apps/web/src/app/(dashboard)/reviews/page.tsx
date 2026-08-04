import Link from 'next/link';
import { Star, MessageSquareQuoteIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { ModerateButtons } from './moderate-buttons';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  productSku: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;
const SENTIMENT_TONE: Record<string, 'success' | 'default' | 'danger'> = {
  positive: 'success',
  neutral: 'default',
  negative: 'danger',
};

function stars(n: number): string {
  return '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : 'pending';
  const reviews = await apiFetch<Review[]>(`/api/v1/reviews-v2?status=${active}`, { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-secondary-900">Reviews</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Moderate product reviews collected via post-purchase requests. Approved reviews power the
          public product widget.
        </p>
      </header>

      <div className="mb-4 flex gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/reviews?status=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
              s === active
                ? 'bg-primary-600 text-white'
                : 'bg-white text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50'
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquareQuoteIcon
              className="mx-auto h-8 w-8 text-secondary-300"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-secondary-900">No {active} reviews</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500" title={`${r.rating}/5`}>
                          {stars(r.rating)}
                        </span>
                        {r.title ? (
                          <span className="font-medium text-secondary-900">{r.title}</span>
                        ) : null}
                        {r.sentiment ? (
                          <Badge variant={SENTIMENT_TONE[r.sentiment] ?? 'default'}>
                            {r.sentiment}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-secondary-700">{r.body}</p>
                      <p className="mt-2 text-xs text-secondary-500">
                        {r.productSku ? `SKU ${r.productSku} · ` : ''}
                        {new Date(r.createdAt).toLocaleString('cs-CZ')}
                      </p>
                    </div>
                    <Star className="h-4 w-4 shrink-0 text-secondary-300" />
                  </div>
                  {active !== 'approved' ? (
                    <div className="mt-3 border-t border-secondary-100 pt-3">
                      <ModerateButtons id={r.id} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
