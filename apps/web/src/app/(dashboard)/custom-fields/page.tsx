import { Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewFieldButton } from './new-field-button';
import { FieldActions } from './field-actions';

interface CustomField {
  id: string;
  name: string;
  key: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_TONE: Record<CustomField['fieldType'], 'default' | 'primary' | 'success'> = {
  text: 'default',
  number: 'primary',
  date: 'default',
  select: 'success',
  boolean: 'primary',
};

export const dynamic = 'force-dynamic';

export default async function CustomFieldsPage() {
  const fields = await apiFetch<CustomField[]>('/api/v1/custom-fields', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Custom fields</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Workspace-defined contact properties. Use them in segments (
            <code className="font-mono text-xs">custom.your_key</code>) and merge tags.
          </p>
        </div>
        <NewFieldButton />
      </header>

      {fields.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No custom fields yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Add a field to capture data unique to your business — e.g. NPS score, favorite
              product, last support ticket.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Required</th>
                <th className="px-4 py-3 font-medium">Default</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {fields.map((f) => (
                <tr key={f.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3 font-medium text-secondary-900">{f.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary-600">custom.{f.key}</td>
                  <td className="px-4 py-3">
                    <Badge variant={TYPE_TONE[f.fieldType]}>{f.fieldType}</Badge>
                    {f.options && f.options.length > 0 ? (
                      <span className="ml-2 text-xs text-secondary-500">
                        {f.options.length} option{f.options.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-600">
                    {f.required ? <Badge variant="warning">Required</Badge> : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary-500">
                    {f.defaultValue ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FieldActions field={f} />
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
