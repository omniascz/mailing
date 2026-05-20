'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Show a minimal embed snippet the user can paste. Real script bundling
 * lives at /api/v1/signup-forms/:id/script — this just wraps a script
 * tag pointing at it. Standalone forms get a hosted URL instead.
 */
export function EmbedSnippet({ formId, embedType }: { formId: string; embedType: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const snippet =
    embedType === 'standalone'
      ? `${API_PUBLIC}/public/forms/${formId}/view`
      : `<script async src="${API_PUBLIC}/api/v1/signup-forms/${formId}/script"></script>${
          embedType === 'inline' ? `\n<div data-forgemsg-form="${formId}"></div>` : ''
        }`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast('success', 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="relative">
        <pre className="max-h-48 overflow-auto rounded-md bg-secondary-900 p-3 pr-12 text-xs leading-relaxed text-secondary-100">
          {snippet}
        </pre>
        <button
          onClick={copy}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-secondary-800 px-2 py-1 text-xs font-medium text-secondary-100 hover:bg-secondary-700"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-secondary-500">
        {embedType === 'inline'
          ? 'Place the snippet where the form should appear. The script renders into the data-attribute div.'
          : embedType === 'standalone'
            ? 'Hosted page URL. Link to it from anywhere — your landing page CTA, social bios, ads.'
            : "The script auto-mounts on the visitor's viewport based on rules in the form config."}
      </p>
    </div>
  );
}
