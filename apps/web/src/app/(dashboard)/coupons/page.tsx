import Link from 'next/link';
import { Ticket, Plus, Store } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface CouponBatch {
  id: string;
  name: string;
  codePrefix: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  totalCodes: number;
  redeemedCount: number;
  expiresAt: string | null;
  storePlatform: string | null;
  storeSyncedAt: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

function discountLabel(b: CouponBatch): string {
  const v = Number(b.discountValue);
  return b.discountType === 'percent' ? `${v}% off` : `${v} off`;
}

export default async function CouponsPage() {
  const batches = await apiFetch<CouponBatch[]>('/api/v1/coupons/batches', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Coupons</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Unique one-time discount codes. Assign per-recipient via the{' '}
            <code className="font-mono text-xs">{'{{coupon_code:batchId}}'}</code> merge tag, then
            sync them to your store so they redeem at checkout.
          </p>
        </div>
        <Link
          href="/coupons/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New batch
        </Link>
      </header>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ticket className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No coupon batches yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Generate a batch of unique codes to drop into a campaign or automation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {batches.map((b) => {
            const remaining = b.totalCodes - b.redeemedCount;
            return (
              <li key={b.id}>
                <Link href={`/coupons/${b.id}`}>
                  <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                    <CardContent>
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium text-secondary-900">{b.name}</p>
                        <Badge variant="primary">{discountLabel(b)}</Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-secondary-500">
                        <span>
                          <span className="font-semibold tabular-nums text-secondary-900">
                            {remaining.toLocaleString('cs-CZ')}
                          </span>{' '}
                          / {b.totalCodes.toLocaleString('cs-CZ')} left
                        </span>
                        <span>·</span>
                        <span>{b.redeemedCount.toLocaleString('cs-CZ')} redeemed</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {b.storeSyncedAt ? (
                          <Badge variant="success">
                            <Store className="mr-1 inline h-3 w-3" />
                            Synced · {b.storePlatform}
                          </Badge>
                        ) : (
                          <Badge variant="default">Not synced to store</Badge>
                        )}
                        {b.expiresAt ? (
                          <span className="text-xs text-secondary-500">
                            Expires {new Date(b.expiresAt).toLocaleDateString('cs-CZ')}
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
