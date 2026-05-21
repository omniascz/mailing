import Link from 'next/link';
import { ArrowLeft, CreditCard, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { BillingActions } from './billing-actions';
import { UpgradeButton } from './upgrade-button';

interface Subscription {
  plan: string;
  stripeCustomerId: string | null;
  stripeStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

interface Usage {
  plan: string;
  suspended: boolean;
  contacts: { current: number; limit: number; remaining: number; pctUsed: number };
  sends: { current: number; limit: number; remaining: number; pctUsed: number };
}

interface Plan {
  tier: string;
  billingType: string;
  name: string;
  contacts: number;
  sends: number;
  priceUsd: number;
}

export const dynamic = 'force-dynamic';

export default async function BillingSettingsPage() {
  const [subscription, usage, plans] = await Promise.all([
    apiFetch<Subscription | null>('/api/v1/billing/subscription', { fallback: null }),
    apiFetch<Usage | null>('/api/v1/billing/capacity', { fallback: null }),
    apiFetch<Plan[]>('/api/v1/billing/plans', { fallback: [] }),
  ]);

  const currentPlan = usage?.plan ?? subscription?.plan ?? 'free';
  const contactPlans = plans.filter((p) => p.billingType === 'contact_based');

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Billing</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Current plan, usage, and subscription management.
        </p>
      </header>

      {usage?.suspended ? (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <p className="font-semibold text-rose-900">Account suspended</p>
            <p className="mt-1 text-rose-800">
              Sending is paused. Contact platform support to restore.
            </p>
          </div>
        </div>
      ) : null}

      {/* Current plan + usage */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-secondary-400" />
            Current plan
            <Badge variant={currentPlan === 'free' ? 'default' : 'primary'}>{currentPlan}</Badge>
            {subscription?.stripeStatus ? (
              <Badge variant={subscription.stripeStatus === 'active' ? 'success' : 'warning'}>
                {subscription.stripeStatus}
              </Badge>
            ) : null}
          </CardTitle>
          {subscription?.currentPeriodEnd ? (
            <CardDescription>
              Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('cs-CZ')}
              {subscription.cancelAtPeriodEnd ? ' (then cancels)' : ''}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {usage ? (
            <>
              <UsageBar
                label="Contacts"
                current={usage.contacts.current}
                limit={usage.contacts.limit}
                pct={usage.contacts.pctUsed}
              />
              <UsageBar
                label="Emails this month"
                current={usage.sends.current}
                limit={usage.sends.limit}
                pct={usage.sends.pctUsed}
              />
            </>
          ) : (
            <p className="text-sm text-secondary-500">Usage data unavailable.</p>
          )}

          <BillingActions
            currentPlan={currentPlan}
            hasStripeCustomer={Boolean(subscription?.stripeCustomerId)}
          />
        </CardContent>
      </Card>

      {/* Plan picker */}
      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Upgrade at any time — your billing period prorates automatically. Cancel from Stripe
            customer portal once subscribed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {contactPlans.map((p) => (
              <PlanCard
                key={p.tier}
                plan={p}
                isCurrent={p.tier === currentPlan}
                disabled={usage?.suspended ?? false}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageBar({
  label,
  current,
  limit,
  pct,
}: {
  label: string;
  current: number;
  limit: number;
  pct: number;
}) {
  const unlimited = limit < 0;
  const tone = pct >= 100 ? 'rose' : pct >= 80 ? 'amber' : 'primary';
  const barColor =
    tone === 'rose' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-primary-500';
  const visualPct = Math.min(pct, 100);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-secondary-700">{label}</span>
        <span className="text-secondary-500">
          {current.toLocaleString('cs-CZ')}
          {!unlimited ? ` / ${limit.toLocaleString('cs-CZ')}` : ' · unlimited'}
        </span>
      </div>
      {!unlimited ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary-100">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${visualPct}%` }}
          />
        </div>
      ) : null}
      {!unlimited && pct >= 80 ? (
        <p className="mt-1 text-xs text-amber-700">
          {pct >= 100 ? 'Limit reached.' : `${pct.toFixed(0)}% used — consider upgrading.`}
        </p>
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  disabled,
}: {
  plan: Plan;
  isCurrent: boolean;
  disabled: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border p-4 ' +
        (isCurrent
          ? 'border-primary-500 bg-primary-50/40 ring-1 ring-primary-500'
          : 'border-secondary-200 bg-white')
      }
    >
      <h3 className="text-sm font-semibold text-secondary-900">{plan.name}</h3>
      <p className="mt-1 text-2xl font-semibold">
        {plan.priceUsd < 0 ? 'Custom' : `$${plan.priceUsd}`}
        {plan.priceUsd > 0 ? <span className="text-xs text-secondary-400">/mo</span> : null}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-secondary-700">
        <li>
          {plan.contacts < 0
            ? 'Unlimited contacts'
            : `${plan.contacts.toLocaleString('cs-CZ')} contacts`}
        </li>
        <li>
          {plan.sends < 0 ? 'Unlimited sends' : `${plan.sends.toLocaleString('cs-CZ')} sends/mo`}
        </li>
      </ul>
      <div className="mt-4">
        {isCurrent ? (
          <span className="block w-full rounded-md border border-secondary-200 bg-white py-2 text-center text-xs text-secondary-500">
            Current plan
          </span>
        ) : plan.tier === 'enterprise' ? (
          <a
            href="mailto:sales@mailforge.cz"
            className="block w-full rounded-md border border-secondary-300 bg-white py-2 text-center text-xs font-medium text-secondary-700 hover:border-secondary-400"
          >
            Contact sales
          </a>
        ) : plan.tier === 'free' ? null : (
          <UpgradeButton tier={plan.tier} disabled={disabled} />
        )}
      </div>
    </div>
  );
}
