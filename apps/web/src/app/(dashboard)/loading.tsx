import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-secondary-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Načítání…
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-secondary-200 bg-secondary-50"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-secondary-200 bg-secondary-50" />
    </div>
  );
}
