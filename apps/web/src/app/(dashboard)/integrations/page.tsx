import { Store, Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Connection {
  id: string;
  platform: string;
  name: string;
  status: 'pending' | 'active' | 'paused' | 'error' | 'revoked';
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<Connection['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  pending: 'warning',
  paused: 'default',
  error: 'danger',
  revoked: 'danger',
};

const PLATFORMS = [
  'shopify',
  'woocommerce',
  'bigcommerce',
  'magento',
  'prestashop',
  'shoptet',
  'upgates',
  'fastcentrik',
];

export default async function IntegrationsPage() {
  const connections = await apiFetch<Connection[]>('/api/v1/ecommerce/connections', {
    fallback: [],
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Integrations</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Connected e-commerce stores. Orders, customers and products sync in; coupon codes sync
          out for checkout redemption.
        </p>
      </header>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No stores connected</p>
            <p className="mt-1 text-sm text-secondary-500">
              Connect via OAuth (Shopify / Shoptet) at{' '}
              <code className="font-mono text-xs">/api/v1/ecommerce/shopify/install</code> or add
              API credentials (WooCommerce / BigCommerce / Magento) via the API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {connections.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-secondary-400" />
                      <div>
                        <p className="font-medium text-secondary-900">{c.name}</p>
                        <p className="text-xs capitalize text-secondary-500">{c.platform}</p>
                      </div>
                    </div>
                    <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-secondary-500">
                    Connected {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-secondary-700">Supported platforms</h2>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <Badge key={p} variant="default">
              {p}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
