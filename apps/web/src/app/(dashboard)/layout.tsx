import type { ReactNode } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { PlanUsageBanner } from '@/components/dashboard/plan-usage-banner';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-60">
        <main className="px-6 py-8 lg:px-10">
          <PlanUsageBanner />
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
