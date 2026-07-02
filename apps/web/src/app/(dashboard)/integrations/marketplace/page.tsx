import Link from 'next/link';
import { ArrowLeft, Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface IntegrationEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  auth: string;
  regions?: string[];
}
interface Catalog {
  categories: string[];
  integrations: IntegrationEntry[];
}

export const dynamic = 'force-dynamic';

const AUTH_LABEL: Record<string, string> = {
  oauth2: 'OAuth',
  api_key: 'API key',
  feed: 'Feed',
  webhook: 'Webhook',
  built_in: 'Built-in',
};

const CATEGORY_LABEL: Record<string, string> = {
  ecommerce: 'E-commerce',
  crm: 'CRM',
  social: 'Social',
  ads: 'Advertising',
  productivity: 'Productivity',
  payments: 'Payments',
  shipping: 'Shipping',
  automation: 'Automation',
  developer: 'Developer',
};

export default async function MarketplacePage() {
  const catalog = await apiFetch<Catalog>('/api/v1/integrations/catalog', {
    fallback: { categories: [], integrations: [] },
  });

  const byCategory = new Map<string, IntegrationEntry[]>();
  for (const i of catalog.integrations) {
    const arr = byCategory.get(i.category) ?? [];
    arr.push(i);
    byCategory.set(i.category, arr);
  }
  const order = [
    'ecommerce', 'crm', 'social', 'ads', 'automation',
    'developer', 'productivity', 'payments', 'shipping',
  ].filter((c) => byCategory.has(c));

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/integrations"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to integrations
      </Link>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Integrations marketplace</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Browse everything ForgeMsg connects to — plus Zapier and the developer API.
        </p>
      </header>

      {order.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">Catalog unavailable</p>
          </CardContent>
        </Card>
      ) : (
        order.map((cat) => (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-secondary-400">
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(byCategory.get(cat) ?? []).map((i) => (
                <li key={i.id}>
                  <Card>
                    <CardContent>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-secondary-900">{i.name}</p>
                        <Badge variant="default">{AUTH_LABEL[i.auth] ?? i.auth}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-secondary-500">{i.description}</p>
                      {i.regions && i.regions.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {i.regions.map((r) => (
                            <span
                              key={r}
                              className="rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-medium text-secondary-600"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
