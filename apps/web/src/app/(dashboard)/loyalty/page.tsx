import { Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface LoyaltyProgram {
  id: string;
  name: string;
  description: string | null;
  tiers: unknown;
  active: boolean;
  earningEnabled: boolean;
  redemptionEnabled: boolean;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function LoyaltyPage() {
  const programs = await apiFetch<LoyaltyProgram[]>('/api/v1/loyalty/programs', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Loyalty</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Points programs — earn on purchases/events, redeem for rewards, with optional tiers.
        </p>
      </header>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No loyalty programs yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create a program via the API to start awarding points.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {programs.map((p) => {
            const tierCount = Array.isArray(p.tiers) ? p.tiers.length : 0;
            return (
              <li key={p.id}>
                <Card>
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-secondary-900">{p.name}</p>
                      <Badge variant={p.active ? 'success' : 'default'}>
                        {p.active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    {p.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-secondary-500">
                        {p.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.earningEnabled ? <Badge variant="primary">Earning</Badge> : null}
                      {p.redemptionEnabled ? <Badge variant="primary">Redemption</Badge> : null}
                      {tierCount > 0 ? <Badge variant="default">{tierCount} tiers</Badge> : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
