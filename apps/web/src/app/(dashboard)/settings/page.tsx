import Link from 'next/link';
import { Building, CreditCard, Users, KeyRound, Webhook, Shield, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface SettingsSection {
  href: string;
  title: string;
  description: string;
  icon: typeof Building;
}

const SECTIONS: SettingsSection[] = [
  {
    href: '/settings/workspace',
    title: 'Workspace',
    description: 'Name, branding, timezone, locale defaults.',
    icon: Building,
  },
  {
    href: '/settings/team',
    title: 'Team',
    description: 'Invite teammates, manage roles, audit logins.',
    icon: Users,
  },
  {
    href: '/settings/billing',
    title: 'Billing',
    description: 'Plan, payment method, invoices, usage caps.',
    icon: CreditCard,
  },
  {
    href: '/settings/api-keys',
    title: 'API keys',
    description: 'Personal + workspace tokens for the REST API and SDKs.',
    icon: KeyRound,
  },
  {
    href: '/settings/webhooks',
    title: 'Webhooks',
    description: 'Send events to your systems when contacts open, click, unsubscribe.',
    icon: Webhook,
  },
  {
    href: '/settings/compliance',
    title: 'Compliance',
    description: 'GDPR data exports, RTBF requests, DPA, sub-processors list.',
    icon: Shield,
  },
  {
    href: '/settings/audit-log',
    title: 'Audit log',
    description: 'Every write action against your workspace — required for GDPR Art. 30 records.',
    icon: Activity,
  },
];

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Settings</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Workspace configuration and account-level controls.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link href={section.href}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-secondary-900">{section.title}</p>
                        <p className="mt-1 text-sm text-secondary-500">{section.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
