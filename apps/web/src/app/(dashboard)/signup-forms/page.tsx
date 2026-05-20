import Link from 'next/link';
import { FileText, Eye, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewFormButton } from './new-form-button';

interface SignupForm {
  id: string;
  name: string;
  embedType: 'inline' | 'popup' | 'flyout' | 'standalone';
  active: boolean;
  listId: string | null;
  viewCount: number;
  submitCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListLite {
  id: string;
  name: string;
}

export const dynamic = 'force-dynamic';

export default async function SignupFormsPage() {
  const [forms, lists] = await Promise.all([
    apiFetch<SignupForm[]>('/api/v1/signup-forms', { fallback: [] }),
    apiFetch<ListLite[]>('/api/v1/lists', { fallback: [] }),
  ]);

  const listById = new Map(lists.map((l) => [l.id, l.name]));

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Signup forms</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Embeddable forms that capture subscribers into a list with double opt-in.
          </p>
        </div>
        <NewFormButton lists={lists} />
      </header>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No signup forms yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create a form to capture leads from your landing page, newsletter footer, or popup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {forms.map((f) => {
            const conv = f.viewCount > 0 ? ((f.submitCount / f.viewCount) * 100).toFixed(1) : '—';
            return (
              <li key={f.id}>
                <Link href={`/signup-forms/${f.id}`}>
                  <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                    <CardContent>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-secondary-900">{f.name}</p>
                          <p className="mt-0.5 text-xs text-secondary-500">
                            {f.embedType}
                            {f.listId ? (
                              <>
                                {' '}
                                · adds to{' '}
                                <span className="font-medium">
                                  {listById.get(f.listId) ?? '(deleted)'}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <Badge variant={f.active ? 'success' : 'default'}>
                          {f.active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-end justify-between text-xs">
                        <div className="flex gap-4">
                          <span className="inline-flex items-center gap-1 text-secondary-500">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="tabular-nums font-semibold text-secondary-900">
                              {f.viewCount.toLocaleString('cs-CZ')}
                            </span>{' '}
                            views
                          </span>
                          <span className="inline-flex items-center gap-1 text-secondary-500">
                            <Send className="h-3.5 w-3.5" />
                            <span className="tabular-nums font-semibold text-secondary-900">
                              {f.submitCount.toLocaleString('cs-CZ')}
                            </span>{' '}
                            submits
                          </span>
                        </div>
                        <span className="text-secondary-500">
                          {conv === '—' ? 'No data' : `${conv}% conversion`}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
