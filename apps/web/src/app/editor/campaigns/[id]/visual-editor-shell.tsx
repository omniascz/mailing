'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Editor } from '@forgemsg/editor/canvas';
import { renderEmail, type MergeTagContext } from '@forgemsg/editor/render';
import type { EmailSchema } from '@forgemsg/editor/schema';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Static preview merge-tag context. Mirrors the `/editor` demo route so
// users get a feel for filters like `|vocative` on a known Czech name.
const PREVIEW_CONTEXT: MergeTagContext = {
  contact: {
    firstName: 'Ada',
    lastName: 'Nováková',
    email: 'ada@example.com',
    tags: ['VIP'],
    custom_fields: { plan: 'pro' },
  },
  system: {
    unsubscribeUrl: 'https://forgemsg.example/unsubscribe',
    viewInBrowserUrl: 'https://forgemsg.example/view',
  },
};

interface SaveState {
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  message?: string;
}

function isEmailSchema(value: unknown): value is EmailSchema {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.blocks) && typeof v.subject === 'string';
}

interface Props {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  initialSchema: unknown;
  initialSubject: string | null;
  initialPreheader: string | null;
}

export function VisualEditorShell({
  campaignId,
  campaignName,
  campaignStatus,
  initialSchema,
  initialSubject,
  initialPreheader,
}: Props) {
  const editable = campaignStatus === 'draft';

  // Seed an initial schema: the saved blocks when present, otherwise an
  // empty schema with the campaign's existing subject/preheader prefilled.
  const seed: EmailSchema | undefined = isEmailSchema(initialSchema)
    ? {
        ...initialSchema,
        subject: initialSchema.subject || initialSubject || 'Untitled',
        preheader: initialSchema.preheader || initialPreheader || '',
      }
    : initialSubject || initialPreheader
      ? undefined // let Editor seed defaults, we'll merge subject in below
      : undefined;

  const liveSchemaRef = useRef<EmailSchema | null>(seed ?? null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const lastSavedRef = useRef<string>(seed ? JSON.stringify(seed) : '');

  const handleChange = useCallback((email: EmailSchema) => {
    liveSchemaRef.current = email;
    const next = JSON.stringify(email);
    setSaveState((s) =>
      next === lastSavedRef.current
        ? s.status === 'saved' || s.status === 'idle'
          ? s
          : { status: 'idle' }
        : { status: 'dirty' },
    );
  }, []);

  const save = useCallback(async () => {
    const schema = liveSchemaRef.current;
    if (!schema) return;
    setSaveState({ status: 'saving' });
    try {
      const { html } = renderEmail(schema, {
        context: PREVIEW_CONTEXT,
        previewAllDynamicBranches: false,
      });
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaignId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: schema.subject,
          preheader: schema.preheader || undefined,
          content: {
            schema,
            html,
            // Plain text auto-derived on send (E.10). Leaving unset preserves
            // any plain-text override the user typed in the HTML editor view.
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setSaveState({
          status: 'error',
          message: `Save failed (${res.status}) ${text.slice(0, 120)}`,
        });
        return;
      }
      lastSavedRef.current = JSON.stringify(schema);
      setSaveState({ status: 'saved' });
      // auto-revert to idle after 2.5s so the badge doesn't stay green forever
      setTimeout(() => {
        setSaveState((s) => (s.status === 'saved' ? { status: 'idle' } : s));
      }, 2500);
    } catch (err) {
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [campaignId]);

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editable) void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, save]);

  // Warn on unload if there are unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveState.status === 'dirty' || saveState.status === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState.status]);

  return (
    <div className="flex h-screen flex-col">
      {/* Top action bar — sits above the Editor's internal toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-secondary-200 bg-white px-4">
        <Link
          href={`/campaigns/${campaignId}/edit`}
          className="inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
        >
          <ArrowLeft className="h-4 w-4" /> {campaignName}
        </Link>

        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ' +
            (editable ? 'bg-secondary-100 text-secondary-700' : 'bg-amber-100 text-amber-800')
          }
        >
          {campaignStatus}
        </span>

        {!editable ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Read-only — clone the campaign to edit.
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <SaveBadge state={saveState} />
          {editable ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={
                saveState.status === 'saving' ||
                saveState.status === 'idle' ||
                saveState.status === 'saved'
              }
              className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:bg-primary-300"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          ) : null}
        </div>
      </div>

      {/* Editor fills the remaining viewport. Its own toolbar + 3 columns
          live inside this region. Pointer events stay enabled even in
          read-only mode (block selection is fine); only persistence is gated. */}
      <div className="min-h-0 flex-1">
        <Editor initialEmail={seed} previewContext={PREVIEW_CONTEXT} onChange={handleChange} />
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state.status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-secondary-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state.status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span title={state.message} className="inline-flex items-center gap-1 text-xs text-rose-600">
        <AlertTriangle className="h-3.5 w-3.5" /> Save failed
      </span>
    );
  }
  if (state.status === 'dirty') {
    return <span className="text-xs text-amber-600">Unsaved changes</span>;
  }
  return <span className="text-xs text-secondary-400">No changes</span>;
}
