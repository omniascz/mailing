import Link from 'next/link';
import { FileText, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { FolderBar, type Folder } from '@/components/folders/folder-bar';
import { FolderPicker } from '@/components/folders/folder-picker';
import { UseTemplateButton } from './use-template-button';
import { DeleteSavedButton } from './delete-saved-button';

interface SavedTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  preheader: string | null;
  category: string;
  thumbnailUrl: string | null;
  locale: string;
  folderId: string | null;
  updatedAt: string;
  createdAt: string;
}

interface BuiltInTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnailUrl: string | null;
}

const TAB_LABELS = { saved: 'Saved', browse: 'Browse built-in' } as const;
type Tab = keyof typeof TAB_LABELS;

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; folderId?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'browse' ? 'browse' : 'saved';

  const builtInQs = sp.category ? `?category=${sp.category}` : '';
  // Folders apply to the saved library only. The built-in gallery is the same
  // for every organisation, so there is nothing there to file.
  const savedQs = sp.folderId ? `?folderId=${encodeURIComponent(sp.folderId)}` : '';
  const [saved, builtIn, folders] = await Promise.all([
    apiFetch<SavedTemplate[]>(`/api/v1/saved-templates${savedQs}`, { fallback: [] }),
    apiFetch<BuiltInTemplate[]>(`/api/v1/templates${builtInQs}`, { fallback: [] }),
    apiFetch<Folder[]>('/api/v1/folders?kind=template', { fallback: [] }),
  ]);

  // Distinct categories present in the built-in set drive the filter chips.
  const categories = Array.from(new Set(builtIn.map((t) => t.category))).sort();

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Templates</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Reusable email layouts. Save your own designs or start from one of our built-in patterns.
        </p>
      </header>

      <div className="mb-6 border-b border-secondary-200">
        <nav className="-mb-px flex gap-6">
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/templates?tab=${key}`}
              className={
                'border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ' +
                (tab === key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700')
              }
            >
              {label}
              {key === 'saved' && !sp.folderId ? (
                <span className="ml-2 text-xs text-secondary-400">({saved.length})</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'saved' ? (
        <>
          <FolderBar
            kind="template"
            folders={folders}
            active={sp.folderId}
            basePath="/templates"
            carry={{ tab: 'saved' }}
          />
          {saved.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-secondary-900">
                  {sp.folderId ? 'Nothing in this folder' : 'No saved templates yet'}
                </p>
                <p className="mt-1 text-sm text-secondary-500">
                  {sp.folderId
                    ? 'Move a template here from the Folder box on its card.'
                    : "Use a built-in template to seed your library, or save a campaign's HTML as a template (coming with the next release)."}
                </p>
                <Link
                  href={sp.folderId ? '/templates?tab=saved' : '/templates?tab=browse'}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white"
                >
                  <Sparkles className="h-4 w-4" />
                  {sp.folderId ? 'Show all templates' : 'Browse built-in'}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {saved.map((t) => (
                <li key={t.id}>
                  <Card className="flex h-full flex-col">
                    <div className="-mt-6 -mx-6 mb-4 h-32 overflow-hidden rounded-t-lg bg-secondary-100">
                      {t.thumbnailUrl ? (
                        <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-secondary-300">
                          <FileText className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-secondary-900">{t.name}</p>
                        <Badge variant="default">{t.category}</Badge>
                      </div>
                      {t.subject ? (
                        <p className="mt-1 truncate text-xs text-secondary-600">
                          <span className="text-secondary-400">Subject:</span> {t.subject}
                        </p>
                      ) : null}
                      {t.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-secondary-500">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                      <FolderPicker
                        endpoint="/api/v1/saved-templates"
                        itemId={t.id}
                        folders={folders}
                        current={t.folderId}
                        emptyHint="No folders yet"
                      />
                      <DeleteSavedButton id={t.id} name={t.name} />
                    </div>
                    <p className="mt-2 text-xs text-secondary-500">
                      Updated {new Date(t.updatedAt).toLocaleDateString('cs-CZ')}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {categories.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Link
                href="/templates?tab=browse"
                className={
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                  (!sp.category
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
                }
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={`/templates?tab=browse&category=${c}`}
                  className={
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                    (sp.category === c
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
                  }
                >
                  {c}
                </Link>
              ))}
            </div>
          ) : null}

          {builtIn.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-secondary-900">
                  No built-in templates available
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {builtIn.map((t) => (
                <li key={t.id}>
                  <Card className="flex h-full flex-col">
                    <div className="-mt-6 -mx-6 mb-4 h-32 overflow-hidden rounded-t-lg bg-secondary-100">
                      {t.thumbnailUrl ? (
                        <img src={t.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-secondary-300">
                          <Sparkles className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-secondary-900">{t.name}</p>
                        <Badge variant="primary">{t.category}</Badge>
                      </div>
                      {t.description ? (
                        <p className="mt-1 line-clamp-3 text-xs text-secondary-500">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <UseTemplateButton templateId={t.id} name={t.name} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
