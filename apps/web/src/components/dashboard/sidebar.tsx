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
  ShieldBan,
  MoonStar,
  Gauge,
  UsersRound,
  LifeBuoy,
  Database as DatabaseIcon,
  Boxes,
  CreditCard,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  NOTHING_AVAILABLE,
  visibleSections,
  type BeyondCoreGroupName,
  type Capabilities,
  type CapabilityFlag,
} from '@/lib/capabilities';

interface NavSection {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    /** Hidden unless the API reports this capability. See lib/capabilities.ts. */
    requires?: CapabilityFlag;
    /** Hidden unless the API registered this beyond-core group. */
    requiresGroup?: BeyondCoreGroupName;
  }>;
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
      // Hidden: the multivariate feature this page lists cannot finish a test.
      // A/B testing itself works, but only through the API — campaigns.ab_config
      // has no dashboard of its own, and this page never listed those anyway.
      {
        href: '/ab-tests',
        label: 'A/B tests',
        icon: FlaskConical,
        requires: 'multivariateTests',
      },
      { href: '/media', label: 'Media library', icon: ImageIcon },
      { href: '/rss-campaigns', label: 'RSS campaigns', icon: Rss },
      { href: '/site-messages', label: 'Site messages', icon: MonitorSmartphone },
      { href: '/sms-keywords', label: 'SMS keywords', icon: Hash },
      // Without a Litmus key the preview provider is a mock that reports
      // 'completed' with screenshots on preview.mock.local. Hidden until the
      // key is set, then it comes back on its own.
      { href: '/inbox-preview', label: 'Inbox preview', icon: Eye, requires: 'inboxPreview' },
      { href: '/ai-agents', label: 'AI agents', icon: Bot, requiresGroup: 'ai-agent' },
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
      { href: '/custom-objects', label: 'Custom objects', icon: Boxes },
      { href: '/lead-scoring', label: 'Lead scoring', icon: TrendingUp },
      { href: '/signup-forms', label: 'Signup forms', icon: FileText },
      { href: '/surveys', label: 'Surveys & NPS', icon: ClipboardList, requiresGroup: 'survey' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/coupons', label: 'Coupons', icon: Ticket, requiresGroup: 'coupon' },
      { href: '/loyalty', label: 'Loyalty', icon: Gift, requiresGroup: 'loyalty-program' },
      { href: '/reviews', label: 'Reviews', icon: Star, requiresGroup: 'reviews-v2' },
      { href: '/meetings', label: 'Meetings', icon: CalendarClock, requiresGroup: 'meeting' },
      { href: '/product-feeds', label: 'Product feeds', icon: Rss, requiresGroup: 'product-feed' },
      { href: '/digital-assets', label: 'Digital assets', icon: FileDown },
      { href: '/newsletter-tiers', label: 'Paid tiers', icon: CreditCard },
      { href: '/integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/data-sets', label: 'Data sets', icon: DatabaseIcon },
    ],
  },
  {
    label: 'Support',
    items: [{ href: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy, requiresGroup: 'helpdesk' }],
  },
  {
    label: 'Deliverability',
    items: [
      { href: '/domains', label: 'Domains', icon: Globe },
      { href: '/suppressions', label: 'Suppressions', icon: ShieldBan },
      { href: '/quiet-hours', label: 'Quiet hours', icon: MoonStar },
      { href: '/frequency-rules', label: 'Frequency caps', icon: Gauge },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/brand', label: 'Brand kit', icon: Palette },
      { href: '/teams', label: 'Teams', icon: UsersRound },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({ capabilities = NOTHING_AVAILABLE }: { capabilities?: Capabilities }) {
  // One filter, two questions. `requires` asks whether the deployment is wired
  // for a feature (Litmus, geo); `requiresGroup` asks whether the API
  // registered that part of the product at all. Both used to need their own
  // pass — the second was a build-time boolean applied here, before the render
  // — and two places deciding visibility is how one of them keeps offering a
  // page the other hides.
  const nav = visibleSections(NAV, capabilities);
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-secondary-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-secondary-200 px-6">
        <div className="h-8 w-8 rounded-md bg-primary-600" aria-hidden="true" />
        <span className="text-base font-semibold text-secondary-900">ForgeMsg</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {nav.map((section) => (
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
