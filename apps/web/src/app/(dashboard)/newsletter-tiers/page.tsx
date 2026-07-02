import { CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface NewsletterTier {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number | string | null;
  currency: string | null;
  billingInterval: string | null;
  isActive: boolean;
  sortOrder: number;
}

export const dynamic = 'force-dynamic';

function price(t: NewsletterTier): string {
  const amount = Number(t.priceAmount ?? 0);
  if (!amount) return 'Free';
  const cur = (t.currency ?? 'USD').toUpperCase();
  const per = t.billingInterval ? `/${t.billingInterval}` : '';
  return `${amount.toLocaleString('cs-CZ', { style: 'currency', currency: cur })}${per}`;
}

export default async function NewsletterTiersPage() {
  const tiers = await apiFetch<NewsletterTier[]>('/api/v1/newsletter-tiers', { fallback: [] });
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Paid newsletter tiers</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Subscription tiers for paid newsletters — gated content and Stripe billing.
        </p>
      </header>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No tiers yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sorted.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-secondary-900">{t.name}</p>
                    <Badge variant={t.isActive ? 'success' : 'default'}>
                      {t.isActive ? 'Active' : 'Hidden'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-secondary-900">{price(t)}</p>
                  {t.description ? (
                    <p className="mt-2 line-clamp-3 text-xs text-secondary-500">{t.description}</p>
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
