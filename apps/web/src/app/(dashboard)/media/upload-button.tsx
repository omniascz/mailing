'use client';

/**
 * Uploading into the media library.
 *
 * A file input, not a drop zone. The brief said drag-and-drop was not needed
 * and it is the right call: an input works from a keyboard, on a phone, and
 * with the file picker people already know, and it is the control every
 * browser renders accessibly without help.
 *
 * Nothing here validates the file. The server decides what an image is by
 * reading the bytes, and a second opinion in the browser would either disagree
 * with it or repeat it — `accept` is a hint to the picker, not a check.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** What the picker offers. The server's allowlist is the one that decides. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

export function UploadButton({ folder }: { folder?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function send(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (folder) body.append('folder', folder);

      const res = await fetch(`${API_BASE}/api/v1/media`, {
        method: 'POST',
        credentials: 'include',
        body,
      });

      if (!res.ok) {
        // The server's message is the useful one — it knows why the bytes
        // were refused, and "not a format we accept" beats "failed (400)".
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        toast('error', payload?.message ?? `Upload failed (${res.status})`);
        return;
      }

      const { data } = (await res.json()) as { data: { filename: string } };
      toast('success', `Nahráno: ${data.filename}`);
      startTransition(() => router.refresh());
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      // Clear the input so the same file can be picked twice in a row.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy || pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Nahrávám…' : 'Nahrát obrázek'}
      </button>
    </>
  );
}
