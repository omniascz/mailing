import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Store } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { StoreSyncButton } from './store-sync-button';

interface CouponBatch {
  id: string;
  name: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  storePlatform: string | null;
  storeSyncedAt: string | null;
}

interface BatchStats {
  total: number;
  assigned: number;
  redeemed: number;
  revenue: number;
}

interface Connection {
  id: string;
  platform: string;
  name: string;
  status: string;
}

export const dynamic = 'force-dynamic';

const SYNCABLE = new Set(['shopify', 'woocommerce']);

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [batches, stats, connections] = await Promise.all([
    apiFetch<CouponBatch[]>('/api/v1/coupons/batches', { fallback: [] }),
    apiFetch<BatchStats | null>(`/api/v1/coupons/batches/${id}/stats`, { fallback: null }),
    apiFetch<Connection[]>('/api/v1/ecommerce/connections', { fallback: [] }),
  ]);
  const batch = batches.find((b) => b.id === id);
  if (!batch) notFound();

  const syncable = connections.filter((c) => SYNCABLE.has(c.platform));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/coupons"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to coupons
      </Link>

      <header className="mb-8 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-secondary-900">{batch.name}</h1>
        <Badge variant="primary">
          {batch.discountType === 'percent'
            ? `${Number(batch.discountValue)}% off`
            : `${Number(batch.discountValue)} off`}
        </Badge>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total codes" value={(stats?.total ?? 0).toLocaleString('cs-CZ')} />
        <Kpi label="Assigned" value={(stats?.assigned ?? 0).toLocaleString('cs-CZ')} />
        <Kpi label="Redeemed" value={(stats?.redeemed ?? 0).toLocaleString('cs-CZ')} tone="good" />
        <Kpi
          label="Revenue"
          value={(stats?.revenue ?? 0).toLocaleString('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
          })}
          tone="good"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-secondary-400" />
            Store redemption
          </CardTitle>
          <CardDescription>
            Register these codes as real discounts in a connected store so recipients can redeem
            them at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batch.storeSyncedAt ? (
            <div className="flex items-center gap-2">
              <Badge variant="success">Synced to {batch.storePlatform}</Badge>
              <span className="text-xs text-secondary-500">
                {new Date(batch.storeSyncedAt).toLocaleString('cs-CZ')}
              </span>
            </div>
          ) : (
            <StoreSyncButton batchId={batch.id} connections={syncable} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === 'good' ? 'text-emerald-600' : 'text-secondary-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
