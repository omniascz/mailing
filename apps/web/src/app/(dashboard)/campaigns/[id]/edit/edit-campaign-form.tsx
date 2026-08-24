'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Send, LayoutGrid, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface CampaignContent {
  html?: string;
  plainText?: string;
  /** Block-tree schema produced by the visual editor. When present, HTML is its rendered output. */
  schema?: unknown;
}

interface Campaign {
  id: string;
  status: string;
  subject: string | null;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  content: CampaignContent | null;
  listId: string | null;
}

interface AudienceList {
  id: string;
  name: string;
  count: number;
}

export function EditCampaignForm({
  campaign,
  lists,
  editable,
}: {
  campaign: Campaign;
  lists: AudienceList[];
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [subject, setSubject] = useState(campaign.subject ?? '');
  const [preheader, setPreheader] = useState(campaign.preheader ?? '');
  const [fromName, setFromName] = useState(campaign.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(campaign.fromEmail ?? '');
  const [replyTo, setReplyTo] = useState(campaign.replyTo ?? '');
  const [listId, setListId] = useState(campaign.listId ?? '');
  const [html, setHtml] = useState(campaign.content?.html ?? '');
  const [plainText, setPlainText] = useState(campaign.content?.plainText ?? '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaign.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          preheader: preheader.trim() || undefined,
          fromName: fromName.trim() || undefined,
          fromEmail: fromEmail.trim() || undefined,
          replyTo: replyTo.trim() || undefined,
          listId: listId || undefined,
          // A campaign the visual editor owns does NOT get its content written
          // from here. This form used to PUT `{ html, plainText }` whatever the
          // campaign was, which replaced the whole content object and dropped
          // the block schema — the banner above says the editor is the source
          // of truth, and this is what makes that true rather than advisory.
          // Since the send path renders from the schema, dropping it also
          // silently downgraded the campaign to the raw-HTML branch.
          ...(campaign.content?.schema
            ? {}
            : { content: { html: html || undefined, plainText: plainText || undefined } }),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Save failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Saved');
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    const to = window.prompt('Send a test to which email address?');
    if (!to?.trim()) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
      toast('error', 'Invalid email');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaign.id}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Test failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', `Test queued to ${to.trim()}`);
    } finally {
      setSendingTest(false);
    }
  }

  const disabled = !editable;

  return (
    <form onSubmit={save} className="space-y-6">
      {/* Subject + preheader */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Subject"
          placeholder="Your weekend deal is inside"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={disabled}
          required
        />
        <Input
          label="Preheader"
          placeholder="A peek at what's in this email"
          value={preheader}
          onChange={(e) => setPreheader(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Sender */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Input
          label="From name"
          placeholder="ForgeMsg Team"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          disabled={disabled}
        />
        <Input
          label="From email"
          type="email"
          placeholder="news@yourdomain.com"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          disabled={disabled}
        />
        <Input
          label="Reply-To (optional)"
          type="email"
          placeholder="hello@yourdomain.com"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Audience */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Audience (list)</label>
        {lists.length === 0 ? (
          <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-xs text-secondary-500">
            No lists yet. Create one in <code>/lists</code> first.
          </p>
        ) : (
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-50 disabled:text-secondary-500"
          >
            <option value="">— Pick a list —</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.count.toLocaleString('cs-CZ')})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* HTML body */}
      <div className="space-y-1.5">
        {campaign.content?.schema ? (
          <div className="flex items-start gap-2 rounded-md border border-primary-200 bg-primary-50 p-3 text-xs text-primary-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
            <div className="flex-1">
              <p className="font-medium">Visual editor is the source of truth.</p>
              <p className="mt-0.5 text-primary-800/80">
                This campaign's HTML below is the rendered output of the block editor. Edit content
                there to avoid overwriting blocks on next render.
              </p>
            </div>
            <Link
              href={`/editor/campaigns/${campaign.id}`}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-primary-300 bg-white px-2 py-1 text-primary-700 hover:border-primary-400"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Open
            </Link>
          </div>
        ) : null}
        <label className="block text-sm font-medium text-secondary-700">
          HTML body
          <span className="ml-2 text-xs font-normal text-secondary-400">
            ({html.length.toLocaleString('cs-CZ')} chars)
          </span>
        </label>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          disabled={disabled}
          rows={14}
          placeholder={`<!doctype html>\n<html>\n  <body>\n    <h1>Hello {{contact.first_name}}</h1>\n    ...\n  </body>\n</html>`}
          className="w-full rounded-md border border-secondary-300 bg-secondary-900 px-3 py-2 font-mono text-xs leading-relaxed text-secondary-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-70"
          spellCheck={false}
        />
        <p className="text-xs text-secondary-500">
          Liquid merge tags supported: <code className="font-mono">{'{{contact.first_name}}'}</code>
          , <code className="font-mono">{'{{contact.email}}'}</code>, plus filters like{' '}
          <code className="font-mono">|vocative</code> for CZ.
        </p>
      </div>

      {/* Plain text */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">
          Plain text body (optional)
        </label>
        <textarea
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
          disabled={disabled}
          rows={6}
          placeholder="Leave blank — we auto-derive plain text from your HTML at send time."
          className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-50 disabled:text-secondary-500"
        />
      </div>

      {editable ? (
        <div className="flex items-center gap-2 border-t border-secondary-200 pt-4">
          <Button type="submit" loading={saving || pending}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={sendTest}
            loading={sendingTest}
            disabled={!html.trim() || !subject.trim()}
          >
            <Send className="h-4 w-4" />
            Send test email
          </Button>
          <span className="ml-auto text-xs text-secondary-500">
            Test sends use the most-recently-saved content — save first.
          </span>
        </div>
      ) : null}
    </form>
  );
}
