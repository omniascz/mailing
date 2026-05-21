import type { ReactNode } from 'react';
import Link from 'next/link';
import { Shield, BarChart3, Building2, Activity, AlertTriangle, LogOut } from 'lucide-react';

/**
 * Platform admin layout. Visually distinct from tenant dashboard so the
 * operator never confuses "their org" with "platform-wide" view. Server-side
 * we don't gate here — the API routes called by these pages reject
 * non-system_admin users with 403, which the pages render as access denied.
 */
export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-800 bg-slate-900 lg:block">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-rose-400" />
            <span className="font-semibold">Mailforge Ops</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Platform admin · system_admin role</p>
        </div>
        <nav className="space-y-0.5 px-2 py-3">
          <NavLink href="/superadmin" icon={BarChart3}>
            Overview
          </NavLink>
          <NavLink href="/superadmin/orgs" icon={Building2}>
            Organizations
          </NavLink>
          <NavLink href="/superadmin/queues" icon={Activity}>
            Queues
          </NavLink>
          <NavLink href="/superadmin/abuse" icon={AlertTriangle}>
            Abuse
          </NavLink>
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 px-3 py-3">
          <Link
            href="/login?logout=1"
            className="flex items-center gap-2 rounded px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Link>
        </div>
      </aside>
      <div className="lg:pl-60">
        <main className="px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {children}
    </Link>
  );
}
