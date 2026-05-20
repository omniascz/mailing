import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Code2, Eye, Send } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { ToggleActiveButton } from './toggle-active-button';
import { DeleteFormButton } from './delete-form-button';
import { EmbedSnippet } from './embed-snippet';

interface FormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
}

interface SignupForm {
  id: string;
  name: string;
  embedType: 'inline' | 'popup' | 'flyout' | 'standalone';
  active: boolean;
  listId: string | null;
  fields: FormField[];
  config: Record<string, unknown>;
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

export default async function SignupFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [form, lists] = await Promise.all([
    apiFetch<SignupForm | null>(`/api/v1/signup-forms/${id}`, { fallback: null }),
    apiFetch<ListLite[]>('/api/v1/lists', { fallback: [] }),
  ]);
  if (!form) notFound();

  const listName = form.listId ? lists.find((l) => l.id === form.listId)?.name : null;
  const conv = form.viewCount > 0 ? ((form.submitCount / form.viewCount) * 100).toFixed(1) : '—';

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/signup-forms"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to forms
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-secondary-900">{form.name}</h1>
            <Badge variant={form.active ? 'success' : 'default'}>
              {form.active ? 'Active' : 'Paused'}
            </Badge>
            <Badge variant="primary">{form.embedType}</Badge>
          </div>
          <p className="mt-1 text-xs text-secondary-500">
            {listName ? (
              <>
                Auto-adds submissions to <span className="font-medium">{listName}</span> ·{' '}
              </>
            ) : null}
            Created {new Date(form.createdAt).toLocaleDateString('cs-CZ')}
          </p>
        </div>
        <div className="flex gap-2">
          <ToggleActiveButton id={form.id} active={form.active} />
          <DeleteFormButton id={form.id} name={form.name} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Views"
          value={form.viewCount.toLocaleString('cs-CZ')}
          icon={<Eye className="h-4 w-4" />}
        />
        <Kpi
          label="Submits"
          value={form.submitCount.toLocaleString('cs-CZ')}
          icon={<Send className="h-4 w-4" />}
          tone="good"
        />
        <Kpi label="Conversion" value={conv === '—' ? '—' : `${conv}%`} tone="good" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
            <CardDescription>What the form collects from visitors</CardDescription>
          </CardHeader>
          <CardContent>
            {form.fields.length === 0 ? (
              <p className="text-sm text-secondary-500">No fields configured yet.</p>
            ) : (
              <ul className="divide-y divide-secondary-100 text-sm">
                {form.fields.map((f) => (
                  <li key={f.name} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-secondary-900">{f.label}</p>
                      <p className="font-mono text-xs text-secondary-500">
                        {f.name} · {f.type}
                      </p>
                    </div>
                    {f.required ? <Badge variant="default">Required</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-secondary-400" />
              Embed snippet
            </CardTitle>
            <CardDescription>Drop this on the page where the form should appear.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmbedSnippet formId={form.id} embedType={form.embedType} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-secondary-900';
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-secondary-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
