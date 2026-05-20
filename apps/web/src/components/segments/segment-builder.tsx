'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Users, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Frontend mirror of the backend SegmentConditions shape from
 * apps/api/src/db/schema/segments.ts. Kept synced because the visual
 * builder serialises directly to this JSON before POST/PUT.
 *
 * MVP scope: a flat list of rules joined by a single AND/OR operator.
 * Nested groups (segments inside segments) are a follow-up — the backend
 * supports them but few users need them on day one.
 */
type RuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_set'
  | 'is_not_set'
  | 'has_tag'
  | 'not_has_tag'
  | 'opened_campaign'
  | 'not_opened_campaign'
  | 'clicked_link'
  | 'not_clicked_link';

export interface BuilderRule {
  field: string;
  op: RuleOp;
  value?: unknown;
  withinDays?: number;
}

export interface BuilderConditions {
  operator: 'AND' | 'OR';
  rules: BuilderRule[];
}

type FieldType = 'text' | 'enum' | 'number' | 'date' | 'tag' | 'campaign';

interface FieldDef {
  /** Backend field key sent in `rule.field`. */
  key: string;
  /** Friendly UI label. */
  label: string;
  /** Drives operator + value input picker. */
  type: FieldType;
  /** For enum-typed fields. */
  options?: string[];
  /** Allowed ops, defaults to type-derived set. */
  ops?: RuleOp[];
}

const FIELDS: FieldDef[] = [
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'first_name', label: 'First name', type: 'text' },
  { key: 'last_name', label: 'Last name', type: 'text' },
  {
    key: 'status',
    label: 'Status',
    type: 'enum',
    options: ['active', 'unsubscribed', 'bounced', 'complained', 'pending'],
    ops: ['eq', 'neq', 'in', 'not_in'],
  },
  {
    key: 'lifecycle_stage',
    label: 'Lifecycle stage',
    type: 'enum',
    options: ['subscriber', 'lead', 'mql', 'sql', 'customer', 'evangelist'],
    ops: ['eq', 'neq', 'in', 'not_in', 'is_set', 'is_not_set'],
  },
  { key: 'created_at', label: 'Joined date', type: 'date' },
  { key: 'total_sends', label: 'Total sends', type: 'number' },
  { key: 'total_opens', label: 'Total opens', type: 'number' },
  { key: 'total_clicks', label: 'Total clicks', type: 'number' },
  { key: 'total_orders', label: 'Total orders', type: 'number' },
  { key: 'total_revenue', label: 'Total revenue', type: 'number' },
  { key: 'tag', label: 'Tag', type: 'tag', ops: ['has_tag', 'not_has_tag'] },
  {
    key: 'campaign',
    label: 'Campaign activity',
    type: 'campaign',
    ops: ['opened_campaign', 'not_opened_campaign', 'clicked_link', 'not_clicked_link'],
  },
];

const TYPE_OPS: Record<FieldType, RuleOp[]> = {
  text: [
    'eq',
    'neq',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_set',
    'is_not_set',
  ],
  enum: ['eq', 'neq', 'in', 'not_in'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  date: ['gt', 'gte', 'lt', 'lte'],
  tag: ['has_tag', 'not_has_tag'],
  campaign: ['opened_campaign', 'not_opened_campaign', 'clicked_link', 'not_clicked_link'],
};

const OP_LABELS: Record<RuleOp, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  in: 'is one of',
  not_in: 'is not one of',
  is_set: 'is set',
  is_not_set: 'is not set',
  has_tag: 'has tag',
  not_has_tag: 'does not have tag',
  opened_campaign: 'opened campaign',
  not_opened_campaign: 'did not open campaign',
  clicked_link: 'clicked link in',
  not_clicked_link: 'did not click in',
};

function defaultRule(): BuilderRule {
  return { field: 'email', op: 'eq', value: '' };
}

function opsForField(key: string): RuleOp[] {
  const def = FIELDS.find((f) => f.key === key);
  if (!def) return TYPE_OPS.text;
  if (def.ops) return def.ops;
  return TYPE_OPS[def.type];
}

function fieldDef(key: string): FieldDef | undefined {
  return FIELDS.find((f) => f.key === key);
}

const TAKES_NO_VALUE: RuleOp[] = ['is_set', 'is_not_set'];
const TAKES_WITHIN_DAYS: RuleOp[] = [
  'opened_campaign',
  'not_opened_campaign',
  'clicked_link',
  'not_clicked_link',
];

interface SegmentBuilderProps {
  segmentId?: string;
  initialName?: string;
  initialDescription?: string;
  initialConditions?: BuilderConditions;
  tags: Array<{ id: string; name: string; color: string | null }>;
  campaigns: Array<{ id: string; name: string }>;
}

export function SegmentBuilder({
  segmentId,
  initialName = '',
  initialDescription = '',
  initialConditions,
  tags,
  campaigns,
}: SegmentBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [operator, setOperator] = useState<'AND' | 'OR'>(initialConditions?.operator ?? 'AND');
  const [rules, setRules] = useState<BuilderRule[]>(
    initialConditions?.rules?.length ? initialConditions.rules : [defaultRule()],
  );
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

  /**
   * Live count preview — debounced POST /segments/preview/count whenever
   * the rule state changes. Sequence number guards against out-of-order
   * responses landing after the user has typed further changes.
   *
   * Skipped while a rule has no value (or is otherwise empty) — backend
   * returns 400 on those, and a flickering "—" looks worse than just
   * holding the previous count.
   */
  useEffect(() => {
    const hasIncompleteRule = rules.some((r) => {
      if (r.op === 'is_set' || r.op === 'is_not_set') return false;
      return r.value === '' || r.value === undefined || r.value === null;
    });
    if (hasIncompleteRule || rules.length === 0) return;

    setPreviewError(null);
    const seq = ++previewSeq.current;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/segments/preview/count`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conditions: { operator, rules } }),
        });
        if (previewSeq.current !== seq) return; // newer request in flight
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setPreviewError(text.slice(0, 100) || `Error ${res.status}`);
          return;
        }
        const body = (await res.json()) as { data: { count: number } };
        setPreviewCount(body.data.count);
      } catch (err) {
        if (previewSeq.current === seq) {
          setPreviewError(err instanceof Error ? err.message.slice(0, 100) : 'Network error');
        }
      } finally {
        if (previewSeq.current === seq) setPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [operator, rules]);

  function updateRule(idx: number, patch: Partial<BuilderRule>) {
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function changeField(idx: number, key: string) {
    const allowedOps = opsForField(key);
    const def = fieldDef(key);
    // Reset op + value when field type changes to avoid impossible combos.
    setRules((rs) =>
      rs.map((r, i) =>
        i === idx
          ? {
              field: key,
              op: allowedOps[0]!,
              value: def?.type === 'number' ? 0 : '',
            }
          : r,
      ),
    );
  }

  function changeOp(idx: number, op: RuleOp) {
    setRules((rs) =>
      rs.map((r, i) => {
        if (i !== idx) return r;
        const next: BuilderRule = { ...r, op };
        if (TAKES_NO_VALUE.includes(op)) delete next.value;
        return next;
      }),
    );
  }

  function addRule() {
    setRules((rs) => [...rs, defaultRule()]);
  }

  function removeRule(idx: number) {
    setRules((rs) => (rs.length === 1 ? rs : rs.filter((_, i) => i !== idx)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    if (rules.length === 0) {
      toast('error', 'Add at least one rule');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      conditions: { operator, rules } satisfies BuilderConditions,
    };

    setSubmitting(true);
    try {
      const res = await fetch(
        segmentId ? `${API_BASE}/api/v1/segments/${segmentId}` : `${API_BASE}/api/v1/segments`,
        {
          method: segmentId ? 'PUT' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Save failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', segmentId ? 'Segment updated' : 'Segment created');
      startTransition(() => router.push(`/segments/${body.data.id}`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Input
        label="Name"
        placeholder="Active CZ subscribers"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        required
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What this segment captures, when to use it."
          className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="rounded-md border border-secondary-200 bg-secondary-50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-secondary-700">Match contacts where</span>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'AND' | 'OR')}
              className="h-8 rounded-md border border-secondary-300 bg-white px-2 text-xs font-medium focus:border-primary-500 focus:outline-none"
            >
              <option value="AND">all</option>
              <option value="OR">any</option>
            </select>
            <span className="text-secondary-700">of these rules match.</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs ring-1 ring-secondary-200">
            {previewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary-400" />
            ) : (
              <Users className="h-3.5 w-3.5 text-secondary-400" />
            )}
            {previewError ? (
              <span className="text-rose-600">{previewError}</span>
            ) : previewCount != null ? (
              <span>
                <span className="font-semibold tabular-nums text-secondary-900">
                  {previewCount.toLocaleString('cs-CZ')}
                </span>{' '}
                contact{previewCount === 1 ? '' : 's'} match
              </span>
            ) : (
              <span className="text-secondary-400">Preview pending…</span>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {rules.map((rule, idx) => {
            const def = fieldDef(rule.field);
            const allowedOps = opsForField(rule.field);
            const needsValue = !TAKES_NO_VALUE.includes(rule.op);
            const needsWithinDays = TAKES_WITHIN_DAYS.includes(rule.op);

            return (
              <li
                key={idx}
                className="grid grid-cols-1 items-start gap-2 rounded-md border border-secondary-200 bg-white p-2 md:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <select
                  value={rule.field}
                  onChange={(e) => changeField(idx, e.target.value)}
                  className="h-9 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                >
                  {FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  value={rule.op}
                  onChange={(e) => changeOp(idx, e.target.value as RuleOp)}
                  className="h-9 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                >
                  {allowedOps.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABELS[o]}
                    </option>
                  ))}
                </select>

                <div className="space-y-1.5">
                  {needsValue ? (
                    def?.type === 'enum' ? (
                      <select
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: e.target.value })}
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">— pick —</option>
                        {def.options!.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : def?.type === 'tag' ? (
                      <select
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: e.target.value })}
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">— pick tag —</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : def?.type === 'campaign' ? (
                      <select
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: e.target.value })}
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      >
                        <option value="">— pick campaign —</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : def?.type === 'number' ? (
                      <input
                        type="number"
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: Number(e.target.value) })}
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    ) : def?.type === 'date' ? (
                      <input
                        type="date"
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: e.target.value })}
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(idx, { value: e.target.value })}
                        placeholder={
                          rule.op === 'in' || rule.op === 'not_in' ? 'comma-separated' : ''
                        }
                        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    )
                  ) : (
                    <p className="pt-2 text-xs italic text-secondary-400">no value</p>
                  )}

                  {needsWithinDays ? (
                    <div className="flex items-center gap-1 text-xs text-secondary-600">
                      <span>in last</span>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={rule.withinDays ?? 30}
                        onChange={(e) => updateRule(idx, { withinDays: Number(e.target.value) })}
                        className="h-7 w-16 rounded-md border border-secondary-300 px-1.5 text-xs focus:border-primary-500 focus:outline-none"
                      />
                      <span>days</span>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => removeRule(idx)}
                  disabled={rules.length === 1}
                  aria-label="Remove rule"
                  className="self-center rounded p-1.5 text-secondary-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-secondary-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={addRule}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-secondary-300 bg-white px-3 py-1.5 text-xs font-medium text-secondary-600 hover:border-secondary-400 hover:text-secondary-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Add rule
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-secondary-200 pt-4">
        <Button type="submit" loading={submitting || pending}>
          <Save className="h-4 w-4" />
          {segmentId ? 'Save segment' : 'Create segment'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/segments')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
