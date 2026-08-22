import type { ReactNode } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { getCapabilities } from '@/lib/capabilities.server';
import { PlanUsageBanner } from '@/components/dashboard/plan-usage-banner';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // One fetch for the whole dashboard shell. Entries whose integration is not
  // configured are not rendered at all — see lib/capabilities.ts.
  const capabilities = await getCapabilities();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar capabilities={capabilities} />
      <div className="lg:pl-60">
        <main className="px-6 py-8 lg:px-10">
          <PlanUsageBanner />
          {children}
        </main>
      </div>
      <CommandPalette capabilities={capabilities} />
    </div>
  );
}
