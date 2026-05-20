import Link from 'next/link';
import { Tag as TagIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { NewTagButton } from './new-tag-button';
import { TagActions } from './tag-actions';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  autoTagRules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const tags = await apiFetch<Tag[]>('/api/v1/tags', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Tags</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Free-form labels for slicing your audience — "VIP", "interested-in-X", "trial-active".
            Use tags as conditions in segments and workflows.
          </p>
        </div>
        <NewTagButton />
      </header>

      {tags.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TagIcon className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No tags yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Tags are lightweight — you can rename or delete them without affecting list
              memberships.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tag</th>
                <th className="px-4 py-3 font-medium">Color</th>
                <th className="px-4 py-3 font-medium">Auto-tag rules</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {tags.map((t) => (
                <tr key={t.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/tags/${t.id}`}
                      className="inline-flex items-center gap-2 font-medium text-secondary-900 hover:text-primary-700"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: t.color ?? '#64748b' }}
                        aria-hidden="true"
                      />
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary-500">
                    {t.color ?? <span className="text-secondary-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-500">
                    {t.autoTagRules && Object.keys(t.autoTagRules).length > 0 ? 'configured' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-500">
                    {new Date(t.createdAt).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TagActions tag={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
