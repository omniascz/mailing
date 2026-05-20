'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FieldDef {
  id: string;
  name: string;
  key: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
}

type FieldValue = string | number | boolean | null;

/**
 * Per-contact custom fields editor. Definitions come from the workspace
 * (preloaded server-side), values from contact.customFields JSONB. We
 * write back the whole customFields object in a single PUT so partial
 * updates don't accidentally clear unrelated keys.
 */
export function CustomFieldsCard({
  contactId,
  definitions,
  initialValues,
}: {
  contactId: string;
  definitions: FieldDef[];
  initialValues: Record<string, FieldValue>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues);

  if (definitions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-secondary-400" />
            Custom fields
          </CardTitle>
          <CardDescription>Workspace-defined contact properties</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-center text-xs text-secondary-500">
            No custom fields defined. Add some in{' '}
            <a href="/custom-fields" className="text-primary-700 hover:text-primary-900">
              workspace settings
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  function setValue(key: string, val: FieldValue) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/contacts/${contactId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: values }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Save failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Custom fields saved');
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-secondary-400" />
          Custom fields
        </CardTitle>
        <CardDescription>Workspace-defined contact properties</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {definitions.map((def) => {
            const v = values[def.key] ?? null;
            return (
              <div
                key={def.id}
                className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr]"
              >
                <label className="text-sm text-secondary-700">
                  {def.name}
                  {def.required ? <span className="ml-0.5 text-rose-600">*</span> : null}
                </label>
                {def.fieldType === 'text' ? (
                  <input
                    type="text"
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => setValue(def.key, e.target.value || null)}
                    placeholder={def.defaultValue ?? ''}
                    className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                ) : def.fieldType === 'number' ? (
                  <input
                    type="number"
                    value={typeof v === 'number' ? v : ''}
                    onChange={(e) =>
                      setValue(def.key, e.target.value === '' ? null : Number(e.target.value))
                    }
                    placeholder={def.defaultValue ?? ''}
                    className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                ) : def.fieldType === 'date' ? (
                  <input
                    type="date"
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => setValue(def.key, e.target.value || null)}
                    className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                ) : def.fieldType === 'select' ? (
                  <select
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => setValue(def.key, e.target.value || null)}
                    className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {(def.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : def.fieldType === 'boolean' ? (
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={v === true}
                      onChange={(e) => setValue(def.key, e.target.checked)}
                      className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-secondary-700">{v === true ? 'Yes' : 'No'}</span>
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>

        {dirty ? (
          <div className="mt-4 flex items-center gap-2 border-t border-secondary-200 pt-3">
            <Button size="sm" onClick={save} loading={saving || pending}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setValues(initialValues)}>
              Discard
            </Button>
            <span className="ml-auto text-xs text-secondary-500">Unsaved changes</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
