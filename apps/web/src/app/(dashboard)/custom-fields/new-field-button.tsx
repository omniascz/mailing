'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TYPES = [
  { value: 'text', label: 'Text', desc: 'Free-form string. Use for names, URLs, free text.' },
  { value: 'number', label: 'Number', desc: 'Integer or decimal. NPS, prices, counts.' },
  { value: 'date', label: 'Date', desc: 'ISO date. Birthdays, deadlines.' },
  { value: 'select', label: 'Select', desc: 'One of a fixed list of options. Needs values.' },
  { value: 'boolean', label: 'Boolean', desc: 'Yes/no flag. Has-trial, vip, etc.' },
] as const;

type FieldType = (typeof TYPES)[number]['value'];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

export function NewFieldButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState<string[]>(['']);
  const [required, setRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState('');

  // Auto-fill key from name until the user manually edits it
  function setNameSyncKey(value: string) {
    setName(value);
    if (!keyTouched) setKey(slugify(value));
  }

  function close() {
    setOpen(false);
    setName('');
    setKey('');
    setKeyTouched(false);
    setFieldType('text');
    setOptions(['']);
    setRequired(false);
    setDefaultValue('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      toast('error', 'Name + key required');
      return;
    }
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (fieldType === 'select' && cleanOpts.length === 0) {
      toast('error', 'Select type needs at least one option');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/custom-fields`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          key: key.trim(),
          fieldType,
          options: fieldType === 'select' ? cleanOpts : undefined,
          required,
          defaultValue: defaultValue.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Field created');
      close();
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
      >
        <Plus className="h-4 w-4" />
        New field
      </button>

      <Modal open={open} onClose={close} title="New custom field" size="md">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              placeholder="NPS score"
              value={name}
              onChange={(e) => setNameSyncKey(e.target.value)}
              autoFocus
              required
            />
            <Input
              label="Key (snake_case)"
              placeholder="nps_score"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyTouched(true);
              }}
              required
              helperText="Used in segments as custom.<key>. Immutable after create."
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Type</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFieldType(t.value)}
                  className={
                    'rounded-md border p-2.5 text-left text-sm transition-colors ' +
                    (fieldType === t.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 bg-white hover:bg-secondary-50')
                  }
                >
                  <p className="font-medium text-secondary-900">{t.label}</p>
                  <p className="mt-0.5 text-xs text-secondary-500">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {fieldType === 'select' ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">Options</label>
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) =>
                      setOptions((arr) => arr.map((o, i) => (i === idx ? e.target.value : o)))
                    }
                    placeholder={`option_${idx + 1}`}
                    className="h-9 flex-1 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                  {options.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setOptions((arr) => arr.filter((_, i) => i !== idx))}
                      aria-label="Remove option"
                      className="rounded p-1.5 text-secondary-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions((arr) => [...arr, ''])}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-secondary-300 bg-white px-2.5 py-1 text-xs font-medium text-secondary-600 hover:text-secondary-900"
              >
                <Plus className="h-3 w-3" />
                Option
              </button>
            </div>
          ) : null}

          <Input
            label="Default value (optional)"
            placeholder={fieldType === 'boolean' ? 'true / false' : ''}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-secondary-200 p-3">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="mt-0.5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="text-sm font-medium text-secondary-900">Required</p>
              <p className="mt-0.5 text-xs text-secondary-500">
                If checked, signup forms + contact create reject submissions without this field.
              </p>
            </div>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
