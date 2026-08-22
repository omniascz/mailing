'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  ArrowRight,
  Mail,
  Users,
  Layers,
  Workflow,
  Inbox,
  FileText,
  Bot,
  TrendingUp,
  Tag,
  Database,
  Globe,
  Settings,
  Activity,
  Sparkles,
} from 'lucide-react';

import {
  NOTHING_AVAILABLE,
  visibleEntries,
  type Capabilities,
  type CapabilityFlag,
} from '@/lib/capabilities';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: 'Send' | 'Audience' | 'Automation' | 'Settings';
  icon: React.ComponentType<{ className?: string }>;
  /** Hidden unless the API reports this capability. See lib/capabilities.ts. */
  requires?: CapabilityFlag;
}

// Static navigation set. Recent items + dynamic search comes later — for
// now this gives keyboard-driven access to every top-level destination,
// which is the 80 % of palette usage.
const ITEMS: PaletteItem[] = [
  { id: 'campaigns', label: 'Kampaně', href: '/campaigns', group: 'Send', icon: Mail },
  {
    id: 'campaigns-new',
    label: 'Nová kampaň',
    hint: 'create',
    href: '/campaigns/new',
    group: 'Send',
    icon: Sparkles,
  },
  { id: 'templates', label: 'Šablony', href: '/templates', group: 'Send', icon: FileText },
  {
    id: 'inbox-preview',
    label: 'Inbox preview',
    href: '/inbox-preview',
    group: 'Send',
    icon: Inbox,
    requires: 'inboxPreview',
  },
  { id: 'contacts', label: 'Kontakty', href: '/contacts', group: 'Audience', icon: Users },
  {
    id: 'contacts-import',
    label: 'Import kontaktů',
    hint: 'CSV',
    href: '/contacts/import',
    group: 'Audience',
    icon: Users,
  },
  { id: 'segments', label: 'Segmenty', href: '/segments', group: 'Audience', icon: Layers },
  { id: 'lists', label: 'Listy', href: '/lists', group: 'Audience', icon: Inbox },
  { id: 'tags', label: 'Štítky', href: '/tags', group: 'Audience', icon: Tag },
  {
    id: 'custom-fields',
    label: 'Custom fields',
    href: '/custom-fields',
    group: 'Audience',
    icon: Database,
  },
  {
    id: 'lead-scoring',
    label: 'Lead scoring',
    href: '/lead-scoring',
    group: 'Audience',
    icon: TrendingUp,
  },
  {
    id: 'signup-forms',
    label: 'Signup formuláře',
    href: '/signup-forms',
    group: 'Audience',
    icon: FileText,
  },
  { id: 'workflows', label: 'Workflows', href: '/workflows', group: 'Automation', icon: Workflow },
  {
    id: 'workflows-gallery',
    label: 'Workflow gallery',
    href: '/workflows/gallery',
    group: 'Automation',
    icon: Sparkles,
  },
  {
    id: 'workflows-map',
    label: 'Automation map',
    href: '/workflows/map',
    group: 'Automation',
    icon: Workflow,
  },
  { id: 'ai-agents', label: 'AI agenti', href: '/ai-agents', group: 'Automation', icon: Bot },
  { id: 'domains', label: 'Domény', href: '/domains', group: 'Settings', icon: Globe },
  { id: 'settings', label: 'Nastavení', href: '/settings', group: 'Settings', icon: Settings },
  { id: 'settings-team', label: 'Tým', href: '/settings/team', group: 'Settings', icon: Users },
  {
    id: 'settings-api-keys',
    label: 'API klíče',
    href: '/settings/api-keys',
    group: 'Settings',
    icon: Settings,
  },
  {
    id: 'settings-webhooks',
    label: 'Webhooky',
    href: '/settings/webhooks',
    group: 'Settings',
    icon: Settings,
  },
  {
    id: 'settings-audit-log',
    label: 'Audit log',
    href: '/settings/audit-log',
    group: 'Settings',
    icon: Activity,
  },
  {
    id: 'settings-workspace',
    label: 'Workspace',
    href: '/settings/workspace',
    group: 'Settings',
    icon: Settings,
  },
  {
    id: 'settings-compliance',
    label: 'Compliance',
    href: '/settings/compliance',
    group: 'Settings',
    icon: Settings,
  },
];

function score(query: string, item: PaletteItem): number {
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  if (!q) return 0;
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 50;
  if (item.hint?.toLowerCase().includes(q)) return 30;
  if (item.id.includes(q)) return 20;
  return 0;
}

export function CommandPalette({
  capabilities = NOTHING_AVAILABLE,
}: {
  capabilities?: Capabilities;
}) {
  const available = visibleEntries(ITEMS, capabilities);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global Cmd+K / Ctrl+K. Listen on capture so we win over input focus
  // handlers downstream.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // wait a tick for the input to mount before focus
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return available;
    return available
      .map((item) => ({ item, s: score(query, item) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.item);
  }, [query]);

  const grouped = useMemo(() => {
    const m = new Map<PaletteItem['group'], PaletteItem[]>();
    for (const item of filtered) {
      const list = m.get(item.group) ?? [];
      list.push(item);
      m.set(item.group, list);
    }
    return Array.from(m.entries());
  }, [filtered]);

  function navigate(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlight];
      if (target) navigate(target);
    }
  }

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-secondary-900/40 px-4 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-secondary-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-secondary-200 px-3 py-2">
          <Search className="h-4 w-4 text-secondary-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Hledat stránku, kampaň, nastavení…"
            className="flex-1 bg-transparent text-sm text-secondary-900 placeholder:text-secondary-400 focus:outline-none"
          />
          <kbd className="rounded border border-secondary-300 bg-secondary-50 px-1.5 py-0.5 font-mono text-[10px] text-secondary-500">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-secondary-500">
              Pro „{query}" nic není.
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-secondary-400">
                  {group}
                </p>
                {items.map((item) => {
                  const idx = runningIdx++;
                  const Icon = item.icon;
                  const active = idx === highlight;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={
                        'flex items-center gap-2 px-3 py-2 text-sm ' +
                        (active
                          ? 'bg-primary-50 text-primary-900'
                          : 'text-secondary-700 hover:bg-secondary-50')
                      }
                    >
                      <Icon className="h-4 w-4 text-secondary-400" />
                      <span className="flex-1">{item.label}</span>
                      {item.hint ? (
                        <span className="font-mono text-[10px] text-secondary-400">
                          {item.hint}
                        </span>
                      ) : null}
                      {active ? <ArrowRight className="h-3.5 w-3.5 text-primary-500" /> : null}
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-secondary-200 bg-secondary-50 px-3 py-2 text-[11px] text-secondary-500">
          <span className="font-mono">↑↓</span> pohyb · <span className="font-mono">↵</span> otevřít
          · <span className="font-mono">⌘K</span> zavřít
        </div>
      </div>
    </div>
  );
}
