'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Users,
  Filter,
  Workflow,
  Globe,
  Sparkles,
  Settings,
  Eye,
  Inbox,
  FileText,
  Tag as TagIcon,
  Database,
  TrendingUp,
  Bot,
  BarChart3,
  Ticket,
  Star,
  Plug,
  Gift,
  FlaskConical,
  Image as ImageIcon,
  ClipboardList,
  CalendarClock,
  MonitorSmartphone,
  FileDown,
  Rss,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface NavSection {
  label: string;
  items: Array<{ href: string; label: string; icon: typeof LayoutDashboard }>;
}

const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Insights', icon: LayoutDashboard }],
  },
  {
    label: 'Send',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Send },
      { href: '/templates', label: 'Templates', icon: FileText },
      { href: '/workflows', label: 'Workflows', icon: Workflow },
      { href: '/workflows/gallery', label: 'Workflow gallery', icon: Sparkles },
      { href: '/ab-tests', label: 'A/B tests', icon: FlaskConical },
      { href: '/media', label: 'Media library', icon: ImageIcon },
      { href: '/site-messages', label: 'Site messages', icon: MonitorSmartphone },
      { href: '/sms-keywords', label: 'SMS keywords', icon: Hash },
      { href: '/inbox-preview', label: 'Inbox preview', icon: Eye },
      { href: '/ai-agents', label: 'AI agents', icon: Bot },
    ],
  },
  {
    label: 'Audience',
    items: [
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/lists', label: 'Lists', icon: Inbox },
      { href: '/segments', label: 'Segments', icon: Filter },
      { href: '/tags', label: 'Tags', icon: TagIcon },
      { href: '/custom-fields', label: 'Custom fields', icon: Database },
      { href: '/lead-scoring', label: 'Lead scoring', icon: TrendingUp },
      { href: '/signup-forms', label: 'Signup forms', icon: FileText },
      { href: '/surveys', label: 'Surveys & NPS', icon: ClipboardList },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/coupons', label: 'Coupons', icon: Ticket },
      { href: '/loyalty', label: 'Loyalty', icon: Gift },
      { href: '/reviews', label: 'Reviews', icon: Star },
      { href: '/meetings', label: 'Meetings', icon: CalendarClock },
      { href: '/product-feeds', label: 'Product feeds', icon: Rss },
      { href: '/digital-assets', label: 'Digital assets', icon: FileDown },
      { href: '/integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'Reporting',
    items: [{ href: '/reports', label: 'Reports', icon: BarChart3 }],
  },
  {
    label: 'Deliverability',
    items: [{ href: '/domains', label: 'Domains', icon: Globe }],
  },
  {
    label: 'Workspace',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-secondary-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-secondary-200 px-6">
        <div className="h-8 w-8 rounded-md bg-primary-600" aria-hidden="true" />
        <span className="text-base font-semibold text-secondary-900">ForgeMsg</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((section) => (
          <div key={section.label} className="mb-6">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-secondary-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-primary-50 font-medium text-primary-700'
                          : 'text-secondary-600 hover:bg-secondary-50',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
