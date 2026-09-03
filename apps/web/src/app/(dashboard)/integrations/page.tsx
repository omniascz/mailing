import Link from 'next/link';
import { Store, Plug, LayoutGrid } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { getCapabilities } from '@/lib/capabilities.server';
import { hasGroup } from '@/lib/capabilities';

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
  /**
   * Ask whether the group is registered before asking for its data.
   *
   * `apiFetch(..., { fallback: [] })` turns the 404 from an unregistered route
   * into an empty list, which this page then rendered as "No stores connected".
   * That is a lie with a plausible shape: the operator reads it as "nobody has
   * connected a store yet" and goes looking for a connect button, when the
   * truth is that the e-commerce group is not switched on in this deployment.
   *
   * The fallback stays — a momentarily unreachable API should still render a
   * shell rather than throw — but it is no longer the only thing standing
   * between a 404 and a sentence claiming a fact about the customer's data.
   */
  const capabilities = await getCapabilities();
  const ecommerceOn = hasGroup(capabilities, 'ecommerce');
  const connections = ecommerceOn
    ? await apiFetch<Connection[]>('/api/v1/ecommerce/connections', { fallback: [] })
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Integrations</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Connected e-commerce stores. Orders, customers and products sync in; coupon codes sync
            out for checkout redemption.
          </p>
        </div>
        <Link
          href="/integrations/marketplace"
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <LayoutGrid className="h-4 w-4" /> Browse marketplace
        </Link>
      </header>

      {!ecommerceOn ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">
              E-commerce integrations are not enabled
            </p>
            <p className="mt-1 text-sm text-secondary-500">
              This deployment does not have the e-commerce group switched on, so there is nothing to
              connect to yet. Ask your operator to add{' '}
              <code className="font-mono text-xs">ecommerce</code> to{' '}
              <code className="font-mono text-xs">BEYOND_CORE_GROUPS</code>.
            </p>
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
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
