import Link from 'next/link';
import { Sparkles, Globe2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { ForkButton } from './fork-button';

interface Template {
  slug: string;
  name: string;
  category: string;
  description: string;
  recommendedFor: string[];
  locale: 'en' | 'cs' | 'sk';
  steps: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  welcome: 'Welcome series',
  abandoned_cart: 'Abandoned cart',
  post_purchase: 'Post-purchase',
  winback: 'Win-back',
  birthday: 'Birthday & anniversary',
  browse_abandonment: 'Browse abandonment',
  vip_loyalty: 'VIP / loyalty',
  lead_nurture: 'Lead nurture',
  event: 'Event reminders',
  feedback_nps: 'Feedback / NPS',
  cross_sell: 'Cross-sell',
  onboarding: 'Onboarding',
  churn_prevention: 'Churn prevention',
  date_triggered: 'Date-triggered (jmeniny/svátky)',
  subscription_renewal: 'Subscription renewal',
};

export const dynamic = 'force-dynamic';

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; locale?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.locale) query.set('locale', params.locale);

  const [templates, categories] = await Promise.all([
    apiFetch<Template[]>(`/api/v1/workflow-templates${query.toString() ? `?${query}` : ''}`, {
      fallback: [],
    }),
    apiFetch<CategoryCount[]>('/api/v1/workflow-templates/categories', { fallback: [] }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-secondary-900">Template gallery</h1>
        </div>
        <p className="mt-1 text-sm text-secondary-500">
          Start from a proven recipe instead of a blank canvas. Forking copies the workflow into
          your draft list — edit freely.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        {/* Filter sidebar */}
        <nav className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-secondary-400">
              Category
            </p>
            <ul className="space-y-0.5">
              <li>
                <FilterLink active={!params.category} href="/workflows/gallery">
                  All
                </FilterLink>
              </li>
              {categories.map((c) => (
                <li key={c.category}>
                  <FilterLink
                    active={params.category === c.category}
                    href={`/workflows/gallery?category=${c.category}${params.locale ? `&locale=${params.locale}` : ''}`}
                  >
                    {CATEGORY_LABELS[c.category] ?? c.category}
                    <span className="ml-1 text-xs text-secondary-400">({c.count})</span>
                  </FilterLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-secondary-400">
              Locale
            </p>
            <ul className="space-y-0.5">
              {(['', 'en', 'cs', 'sk'] as const).map((loc) => {
                const params2 = new URLSearchParams();
                if (params.category) params2.set('category', params.category);
                if (loc) params2.set('locale', loc);
                return (
                  <li key={loc || 'all'}>
                    <FilterLink
                      active={(params.locale ?? '') === loc}
                      href={`/workflows/gallery${params2.toString() ? `?${params2}` : ''}`}
                    >
                      {loc === '' ? 'All' : loc.toUpperCase()}
                    </FilterLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Template grid */}
        <div>
          {templates.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-secondary-500">No templates match these filters.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {templates.map((t) => (
                <li key={t.slug}>
                  <Card className="flex h-full flex-col">
                    <CardHeader className="mb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <Badge variant="default">
                          <Globe2 className="mr-1 h-3 w-3" aria-hidden="true" />
                          {t.locale.toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription>{t.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="default">{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                        <Badge variant="default">
                          {t.steps} step{t.steps === 1 ? '' : 's'}
                        </Badge>
                        {t.recommendedFor.slice(0, 2).map((r) => (
                          <Badge key={r} variant="default">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                    <div className="mt-4 flex items-center gap-2">
                      <ForkButton slug={t.slug} name={t.name} />
                      <Link
                        href={`/workflows/gallery/${t.slug}`}
                        className="text-sm text-primary-700 hover:text-primary-800"
                      >
                        Preview
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'block rounded-md px-3 py-1.5 text-sm transition-colors ' +
        (active
          ? 'bg-primary-50 font-medium text-primary-700'
          : 'text-secondary-600 hover:bg-secondary-50')
      }
    >
      {children}
    </Link>
  );
}
