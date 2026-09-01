'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Send, LayoutGrid, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Not narrowed to these keys: campaigns.content has four shapes here and the
 * whole object is copied into every A/B variant, because the splitter passes
 * `content: variant.content` to the batch with no fallback to the campaign.
 */
type CampaignContent = {
  html?: string;
  plainText?: string;
  /** Block-tree schema produced by the visual editor. When present, HTML is its rendered output. */
  schema?: unknown;
} & Record<string, unknown>;

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
  segmentId: string | null;
  excludeSegmentId: string | null;
  abConfig: Record<string, unknown> | null;
  timewarp: TimewarpSettings | null;
  utmTracking: UtmSettings | null;
}

/**
 * UTM parameters appended to every tracked link at render time.
 *
 * Values are URL-safe by contract, not by convention: the API rejects spaces
 * and `? # & =` (utmValue in routes/v1/campaigns.ts). A campaign name with
 * diacritics is not a valid value — it has to be slugged first — which is why
 * the field below does not prefill itself from the campaign name.
 */
interface UtmSettings {
  enabled: boolean;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/** Deliver at the same local hour in each recipient's own timezone. */
interface TimewarpSettings {
  enabled: boolean;
  localHour: number;
  fallbackTimezone?: string;
}

import {
  AB_OFF,
  abFormStateFrom,
  buildAbConfig,
  defaultAbFormState,
  holdbackPercentage,
  type AbFormState,
} from './ab-config';
import { buildSavePayload } from './save-payload';

interface AudienceList {
  id: string;
  name: string;
  count: number;
}

interface AudienceSegment {
  id: string;
  name: string;
}

export function EditCampaignForm({
  campaign,
  lists,
  segments,
  editable,
}: {
  campaign: Campaign;
  lists: AudienceList[];
  segments: AudienceSegment[];
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
  const [segmentId, setSegmentId] = useState(campaign.segmentId ?? '');
  const [excludeSegmentId, setExcludeSegmentId] = useState(campaign.excludeSegmentId ?? '');
  const [html, setHtml] = useState(campaign.content?.html ?? '');
  const [plainText, setPlainText] = useState(campaign.content?.plainText ?? '');
  const [timewarpOn, setTimewarpOn] = useState(campaign.timewarp?.enabled ?? false);
  const [timewarpHour, setTimewarpHour] = useState(campaign.timewarp?.localHour ?? 9);
  const [timewarpFallback, setTimewarpFallback] = useState(
    campaign.timewarp?.fallbackTimezone ?? 'Europe/Prague',
  );
  const [utmOn, setUtmOn] = useState(campaign.utmTracking?.enabled ?? false);
  // All three start blank rather than prefilled, because the server already
  // has defaults and duplicating them here is how the two drift apart:
  // resolveUtm (services/campaigns/utm.ts:87) falls back to source `email`,
  // medium `newsletter`, and the campaign's own name slugged — so a Czech name
  // becomes a valid UTM value without the operator doing anything. The
  // placeholders below say what a blank field will become.
  const [utmSource, setUtmSource] = useState(campaign.utmTracking?.source ?? '');
  const [utmMedium, setUtmMedium] = useState(campaign.utmTracking?.medium ?? '');
  const [utmCampaign, setUtmCampaign] = useState(campaign.utmTracking?.campaign ?? '');

  const storedAb = abFormStateFrom(campaign.abConfig);
  const [abOn, setAbOn] = useState(storedAb !== null);
  const [ab, setAb] = useState<AbFormState>(storedAb ?? defaultAbFormState());
  const [abError, setAbError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();

    // Built before anything is sent: a rejected config must not leave half of
    // the form saved and the operator wondering which half.
    let abPayload: Record<string, unknown> = AB_OFF;
    if (abOn) {
      // Every variant carries the campaign's own body — the splitter passes
      // `content: variant.content` with no fallback. Re-snapshotted on every
      // save, which is what keeps it current after the body is changed in the
      // visual editor, since that editor does not know about this form.
      const built = buildAbConfig(ab, (campaign.content ?? {}) as Record<string, unknown>);
      if (!built.ok) {
        setAbError(built.error);
        toast('error', built.error);
        return;
      }
      abPayload = built.config as unknown as Record<string, unknown>;
    }
    setAbError(null);

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaign.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildSavePayload({
            subject,
            preheader,
            fromName,
            fromEmail,
            replyTo,
            listId,
            segmentId,
            excludeSegmentId,
            abConfig: abPayload,
            timewarpOn,
            timewarpHour,
            timewarpFallback,
            utmOn,
            utmSource,
            utmMedium,
            utmCampaign,
            html,
            plainText,
            hasEditorSchema: Boolean(campaign.content?.schema),
          }),
        ),
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

      {/* Segments */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Segment (optional)</label>
        {segments.length === 0 ? (
          <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-xs text-secondary-500">
            No segments yet. Create one in <code>/segments</code>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                aria-label="Include segment"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-50 disabled:text-secondary-500"
              >
                <option value="">— Include: no segment —</option>
                {segments.map((sgm) => (
                  <option key={sgm.id} value={sgm.id}>
                    {sgm.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Exclude segment"
                value={excludeSegmentId}
                onChange={(e) => setExcludeSegmentId(e.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-50 disabled:text-secondary-500"
              >
                <option value="">— Exclude: nobody —</option>
                {segments.map((sgm) => (
                  <option key={sgm.id} value={sgm.id}>
                    {sgm.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-secondary-500">
              A segment narrows the list — a contact has to be in both. It does not replace the
              list: sending is refused without one, whatever the segment says. The exclude segment
              is subtracted last.
            </p>
          </>
        )}
      </div>

      {/* A/B test */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-secondary-700">
          <input
            type="checkbox"
            checked={abOn}
            onChange={(e) => setAbOn(e.target.checked)}
            disabled={disabled}
          />
          Test subject lines against each other (A/B)
        </label>
        {abOn && (
          <div className="space-y-3 rounded-md border border-secondary-200 p-3">
            <p className="text-xs text-secondary-500">
              Each variant is sent to its share of the audience with its own subject line and the
              campaign&apos;s body. What is left over is the holdback, and it gets the winner once
              the test window closes.
            </p>

            {ab.variants.map((v, i) => (
              <div key={v.id} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1 space-y-1">
                  <label className="block text-xs text-secondary-600">
                    Variant {v.id} — subject
                  </label>
                  <Input
                    value={v.subject}
                    onChange={(e) =>
                      setAb({
                        ...ab,
                        variants: ab.variants.map((x, j) =>
                          j === i ? { ...x, subject: e.target.value } : x,
                        ),
                      })
                    }
                    disabled={disabled}
                    placeholder="Subject line for this variant"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <label className="block text-xs text-secondary-600">Share %</label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={v.percentage}
                    onChange={(e) =>
                      setAb({
                        ...ab,
                        variants: ab.variants.map((x, j) =>
                          j === i ? { ...x, percentage: e.target.value } : x,
                        ),
                      })
                    }
                    disabled={disabled}
                  />
                </div>
                {ab.variants.length > 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAb({ ...ab, variants: ab.variants.filter((_, j) => j !== i) })
                    }
                    disabled={disabled}
                    className="h-10 rounded-md border border-secondary-300 px-3 text-sm text-secondary-600 hover:bg-secondary-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setAb({
                  ...ab,
                  variants: [
                    ...ab.variants,
                    {
                      id: String.fromCharCode(97 + ab.variants.length),
                      subject: '',
                      percentage: '10',
                    },
                  ],
                })
              }
              disabled={disabled || ab.variants.length >= 6}
              className="rounded-md border border-secondary-300 px-3 py-1.5 text-sm text-secondary-700 hover:bg-secondary-50 disabled:opacity-50"
            >
              Add a variant
            </button>

            <div className="flex flex-wrap items-end gap-3 border-t border-secondary-200 pt-3">
              <div className="w-36 space-y-1">
                <label className="block text-xs text-secondary-600">Test runs for (hours)</label>
                <Input
                  type="number"
                  min={1}
                  value={ab.testDurationHours}
                  onChange={(e) => setAb({ ...ab, testDurationHours: e.target.value })}
                  disabled={disabled || holdbackPercentage(ab.variants) === 0}
                />
              </div>
              <div className="w-44 space-y-1">
                <label className="block text-xs text-secondary-600">Decide on</label>
                <select
                  value={ab.winnerCriteria}
                  onChange={(e) =>
                    setAb({
                      ...ab,
                      winnerCriteria: e.target.value === 'open_rate' ? 'open_rate' : 'click_rate',
                    })
                  }
                  disabled={disabled}
                  className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-secondary-50 disabled:text-secondary-500"
                >
                  <option value="click_rate">Click rate</option>
                  <option value="open_rate">Open rate</option>
                </select>
              </div>
              <div className="w-36 space-y-1">
                <label className="block text-xs text-secondary-600">Confidence %</label>
                <Input
                  type="number"
                  min={50}
                  max={100}
                  value={ab.confidenceThreshold}
                  onChange={(e) => setAb({ ...ab, confidenceThreshold: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <label className="flex h-10 items-center gap-2 text-sm text-secondary-700">
                <input
                  type="checkbox"
                  checked={ab.autoSendWinner}
                  onChange={(e) => setAb({ ...ab, autoSendWinner: e.target.checked })}
                  disabled={disabled}
                />
                Send the winner automatically
              </label>
            </div>

            <p className="text-xs text-secondary-500">
              {holdbackPercentage(ab.variants) === 0
                ? 'The variants cover the whole audience — no holdback, so no winner is sent afterwards and the test duration does not apply.'
                : `Holdback: ${holdbackPercentage(ab.variants)}% of the audience. Open rate is biased by Apple Mail Privacy Protection pre-fetching the tracking pixel, which is why click rate is the default.`}
            </p>

            {abError ? <p className="text-xs text-rose-600">{abError}</p> : null}
          </div>
        )}
      </div>

      {/* Time-warp */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-secondary-700">
          <input
            type="checkbox"
            checked={timewarpOn}
            onChange={(e) => setTimewarpOn(e.target.checked)}
            disabled={disabled}
          />
          Deliver at the same local hour for every recipient
        </label>
        {timewarpOn && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-secondary-200 p-3">
            <div className="space-y-1">
              <label className="block text-xs text-secondary-600">Local hour</label>
              <select
                value={timewarpHour}
                onChange={(e) => setTimewarpHour(Number(e.target.value))}
                disabled={disabled}
                className="h-9 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-secondary-600">
                Timezone for contacts whose own is unknown
              </label>
              <Input
                value={timewarpFallback}
                onChange={(e) => setTimewarpFallback(e.target.value)}
                disabled={disabled}
                placeholder="Europe/Prague"
              />
            </div>
            <p className="w-full text-xs text-secondary-500">
              Each recipient is sent at this hour in their own timezone. Contacts whose timezone we
              do not know are sent at this hour in the fallback zone — nobody is skipped.
            </p>
          </div>
        )}
      </div>

      {/* UTM */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-secondary-700">
          <input
            type="checkbox"
            checked={utmOn}
            onChange={(e) => setUtmOn(e.target.checked)}
            disabled={disabled}
          />
          Tag links with UTM parameters
        </label>
        {utmOn && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-secondary-200 p-3">
            <div className="space-y-1">
              <label className="block text-xs text-secondary-600">utm_source</label>
              <Input
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                disabled={disabled}
                placeholder="email (default)"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-secondary-600">utm_medium</label>
              <Input
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                disabled={disabled}
                placeholder="newsletter (default)"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-secondary-600">utm_campaign</label>
              <Input
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                disabled={disabled}
                placeholder="campaign name, slugged (default)"
              />
            </div>
            <p className="w-full text-xs text-secondary-500">
              No spaces and none of <code>? # &amp; =</code> — these go straight into the query
              string. Leave a field blank to use the default shown.
            </p>
          </div>
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
