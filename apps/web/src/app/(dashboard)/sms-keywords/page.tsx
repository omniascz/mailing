import { Hash } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface SmsKeyword {
  id: string;
  keyword: string;
  action: string;
  listId: string | null;
  reply: string | null;
  enabled: boolean;
  hitCount: number;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SmsKeywordsPage() {
  const keywords = await apiFetch<SmsKeyword[]>('/api/v1/sms/keywords', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">SMS keywords</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Inbound SMS keywords (e.g. text JOIN to subscribe) with an auto-reply and action.
        </p>
      </header>

      {keywords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Hash className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No keywords yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {keywords.map((k) => (
            <li key={k.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-secondary-100 px-2 py-0.5 font-mono text-sm font-semibold text-secondary-900">
                        {k.keyword.toUpperCase()}
                      </code>
                      <Badge variant="primary">{k.action}</Badge>
                      {!k.enabled ? <Badge variant="default">Disabled</Badge> : null}
                    </div>
                    {k.reply ? (
                      <p className="mt-1 line-clamp-1 text-xs text-secondary-500">↳ {k.reply}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-secondary-500">
                    <span className="font-semibold tabular-nums text-secondary-900">
                      {k.hitCount.toLocaleString('cs-CZ')}
                    </span>{' '}
                    hits
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
