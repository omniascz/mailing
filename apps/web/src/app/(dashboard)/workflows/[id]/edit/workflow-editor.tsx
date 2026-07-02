'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  MessageSquare,
  Clock,
  GitBranch,
  Webhook,
  Tag as TagIcon,
  ListPlus,
  ListMinus,
  Bell,
  Phone,
  UserPlus,
  UserMinus,
  Star,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type NodeType =
  | 'trigger'
  | 'send_email'
  | 'send_sms'
  | 'send_whatsapp'
  | 'send_push'
  | 'make_voice_call'
  | 'wait'
  | 'condition'
  | 'add_tag'
  | 'remove_tag'
  | 'move_to_list'
  | 'remove_from_list'
  | 'send_webhook'
  | 'assign_task'
  | 'unsubscribe'
  | 'send_review_request';

interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface AddableNodeType {
  type: Exclude<NodeType, 'trigger'>;
  label: string;
  defaults: Record<string, unknown>;
}

// Defaults MUST match the executor contract (apps/api services/workflows/actions.ts):
// wait wants { duration:number, unit }, send_sms wants { message }, condition wants
// { field, op, value }. Earlier { duration:{days,hours} } / { body } / { rule } shapes
// broke silently (NaN wait, unsent SMS, always-false condition).
const ADDABLE: AddableNodeType[] = [
  { type: 'send_email', label: 'Send email', defaults: { subject: '' } },
  { type: 'send_sms', label: 'Send SMS', defaults: { message: '' } },
  { type: 'wait', label: 'Wait', defaults: { duration: 1, unit: 'days' } },
  { type: 'condition', label: 'Condition', defaults: { field: '', op: 'eq', value: '' } },
  { type: 'add_tag', label: 'Add tag', defaults: { tagSlug: '' } },
  { type: 'remove_tag', label: 'Remove tag', defaults: { tagSlug: '' } },
  { type: 'move_to_list', label: 'Move to list', defaults: { listSlug: '' } },
  { type: 'send_webhook', label: 'Send webhook', defaults: { url: '' } },
  { type: 'unsubscribe', label: 'Unsubscribe', defaults: {} },
  {
    type: 'send_review_request',
    label: 'Request review',
    defaults: { channel: 'email', subject: 'How was your order?' },
  },
];

const NODE_ICONS: Record<NodeType, typeof Mail> = {
  trigger: GitBranch,
  send_email: Mail,
  send_sms: MessageSquare,
  send_whatsapp: MessageSquare,
  send_push: Bell,
  make_voice_call: Phone,
  wait: Clock,
  condition: GitBranch,
  add_tag: TagIcon,
  remove_tag: TagIcon,
  move_to_list: ListPlus,
  remove_from_list: ListMinus,
  send_webhook: Webhook,
  assign_task: UserPlus,
  unsubscribe: UserMinus,
  send_review_request: Star,
};

const NODE_LABELS: Record<NodeType, string> = {
  trigger: 'Trigger',
  send_email: 'Send email',
  send_sms: 'Send SMS',
  send_whatsapp: 'Send WhatsApp',
  send_push: 'Send push',
  make_voice_call: 'Voice call',
  wait: 'Wait',
  condition: 'Condition',
  add_tag: 'Add tag',
  remove_tag: 'Remove tag',
  move_to_list: 'Move to list',
  remove_from_list: 'Remove from list',
  send_webhook: 'Send webhook',
  assign_task: 'Assign task',
  unsubscribe: 'Unsubscribe',
  send_review_request: 'Request review',
};

/**
 * Walk the graph from the trigger via outgoing edges. Stops at the first
 * branch (condition with two children) — branches are kept as orphans
 * shown below the main flow so users notice them, but full branch editing
 * waits on the React-Flow canvas. For unbranched workflows (the common
 * case) this gives a clean linear list to edit.
 */
function linearize(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): {
  spine: WorkflowNode[];
  orphans: WorkflowNode[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.source) ?? [];
    arr.push(e);
    outgoing.set(e.source, arr);
  }
  const start = nodes.find((n) => n.type === 'trigger');
  if (!start) return { spine: nodes, orphans: [] };

  const spine: WorkflowNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start.id;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const node = byId.get(cur);
    if (node) spine.push(node);
    const outs: WorkflowEdge[] = outgoing.get(cur) ?? [];
    if (outs.length === 1) cur = outs[0]!.target;
    else cur = undefined; // branch or end
  }
  const orphans = nodes.filter((n) => !seen.has(n.id));
  return { spine, orphans };
}

function freshEdgeId(): string {
  return `e-${Math.random().toString(36).slice(2, 10)}`;
}
function freshNodeId(): string {
  return `n-${Math.random().toString(36).slice(2, 10)}`;
}

interface WorkflowEditorProps {
  workflowId: string;
  initialNodes: WorkflowNode[];
  initialEdges: WorkflowEdge[];
  initialName: string;
  status: string;
}

export function WorkflowEditor({
  workflowId,
  initialNodes,
  initialEdges,
  initialName,
  status,
}: WorkflowEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName);
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialEdges);
  const [insertOpenAt, setInsertOpenAt] = useState<number | null>(null);

  const { spine, orphans } = useMemo(() => linearize(nodes, edges), [nodes, edges]);
  const locked = status !== 'draft';

  function updateNodeConfig(nodeId: string, patch: Record<string, unknown>) {
    setNodes((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n)),
    );
  }

  /**
   * Insert a new node between spine[idx-1] and spine[idx]. Idx 0 means
   * "after the trigger" (or at the start of an empty spine). We assume
   * the spine is linear — that's enforced by linearize() bailing at
   * branches, so this stays safe for the no-branch common path.
   */
  function insertAfter(
    spineIdx: number,
    type: AddableNodeType['type'],
    defaults: Record<string, unknown>,
  ) {
    const newNode: WorkflowNode = { id: freshNodeId(), type, config: { ...defaults } };
    const prev = spine[spineIdx];
    const next = spine[spineIdx + 1];

    setNodes((ns) => [...ns, newNode]);

    if (prev && next) {
      // Re-route the edge prev → next so it becomes prev → new → next.
      setEdges((es) => {
        const without = es.filter((e) => !(e.source === prev.id && e.target === next.id));
        return [
          ...without,
          { id: freshEdgeId(), source: prev.id, target: newNode.id },
          { id: freshEdgeId(), source: newNode.id, target: next.id },
        ];
      });
    } else if (prev) {
      // Appending after a tail node.
      setEdges((es) => [...es, { id: freshEdgeId(), source: prev.id, target: newNode.id }]);
    }
    setInsertOpenAt(null);
  }

  function deleteNode(nodeId: string) {
    const incoming = edges.find((e) => e.target === nodeId);
    const outgoing = edges.find((e) => e.source === nodeId);

    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => {
      const filtered = es.filter((e) => e.source !== nodeId && e.target !== nodeId);
      // If we deleted a middle node, stitch the gap.
      if (incoming && outgoing) {
        filtered.push({ id: freshEdgeId(), source: incoming.source, target: outgoing.target });
      }
      return filtered;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workflows/${workflowId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, nodes, edges }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Save failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Saved');
      startTransition(() => router.push(`/workflows/${workflowId}`));
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This workflow is <b>{status}</b>. Pause or archive it to edit the graph. Live workflows
        aren't editable to avoid breaking in-flight runs.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-secondary-700">Steps</p>
        <ol className="space-y-2">
          {spine.map((node, idx) => (
            <li key={node.id}>
              <NodeCard
                node={node}
                index={idx}
                onChange={(patch) => updateNodeConfig(node.id, patch)}
                onDelete={node.type === 'trigger' ? undefined : () => deleteNode(node.id)}
              />
              {idx < spine.length - 1 || spine.length === 1 ? null : null}
              {idx < spine.length || spine.length === 1 ? (
                <InsertSlot
                  open={insertOpenAt === idx}
                  onOpen={() => setInsertOpenAt(insertOpenAt === idx ? null : idx)}
                  onPick={(t) => insertAfter(idx, t.type, t.defaults)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {orphans.length > 0 ? (
        <div className="rounded-md border border-secondary-200 bg-secondary-50 p-3">
          <p className="text-xs font-medium text-secondary-700">
            {orphans.length} node{orphans.length === 1 ? '' : 's'} outside the main flow
          </p>
          <p className="mt-1 text-xs text-secondary-500">
            Branches and parallel paths aren't editable in this view yet — they're preserved on
            save. Use the read-only detail page to inspect them.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-secondary-200 pt-4">
        <Button onClick={save} loading={saving || pending}>
          <Save className="h-4 w-4" />
          Save workflow
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/workflows/${workflowId}`)}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-secondary-500">
          {spine.length} step{spine.length === 1 ? '' : 's'} in the main flow
        </span>
      </div>
    </div>
  );
}

// ─── Per-step card with type-specific config editor ──────────────────────────

function NodeCard({
  node,
  index,
  onChange,
  onDelete,
}: {
  node: WorkflowNode;
  index: number;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
}) {
  const Icon = NODE_ICONS[node.type] ?? GitBranch;

  return (
    <div className="flex items-start gap-3 rounded-md border border-secondary-200 bg-white p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-secondary-900">
            <span className="mr-2 text-secondary-400">{index + 1}.</span>
            {NODE_LABELS[node.type]}
          </p>
          {onDelete ? (
            <button
              onClick={onDelete}
              aria-label="Remove step"
              className="rounded p-1 text-secondary-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-2">
          <NodeConfigEditor node={node} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

function NodeConfigEditor({
  node,
  onChange,
}: {
  node: WorkflowNode;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const cfg = node.config ?? {};

  if (node.type === 'trigger') {
    return (
      <p className="text-xs text-secondary-500">
        Trigger type: <code className="font-mono">{String(cfg.triggerType ?? 'manual')}</code> —
        change on the workflow detail page.
      </p>
    );
  }

  if (node.type === 'send_email') {
    return (
      <input
        type="text"
        value={String(cfg.subject ?? '')}
        onChange={(e) => onChange({ subject: e.target.value })}
        placeholder="Subject — supports {{contact.first_name|vocative}}"
        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
      />
    );
  }

  if (node.type === 'send_sms') {
    return (
      <textarea
        value={String(cfg.body ?? '')}
        onChange={(e) => onChange({ body: e.target.value })}
        rows={2}
        placeholder="SMS body — keep under 160 chars to stay single-segment"
        className="w-full rounded-md border border-secondary-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
      />
    );
  }

  if (node.type === 'wait') {
    const dur = (cfg.duration as { days?: number; hours?: number } | undefined) ?? {};
    return (
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          min={0}
          value={dur.days ?? 0}
          onChange={(e) => onChange({ duration: { ...dur, days: Number(e.target.value) } })}
          className="h-9 w-20 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <span className="text-secondary-600">days</span>
        <input
          type="number"
          min={0}
          max={23}
          value={dur.hours ?? 0}
          onChange={(e) => onChange({ duration: { ...dur, hours: Number(e.target.value) } })}
          className="h-9 w-20 rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <span className="text-secondary-600">hours</span>
      </div>
    );
  }

  if (node.type === 'condition') {
    const rule = (cfg.rule as { description?: string } | undefined) ?? {};
    return (
      <div className="space-y-1.5">
        <input
          type="text"
          value={rule.description ?? ''}
          onChange={(e) => onChange({ rule: { ...rule, description: e.target.value } })}
          placeholder="Condition description (e.g. cart_still_abandoned)"
          className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <p className="text-xs text-secondary-500">
          Detailed rule builder uses the segment-rule schema — coming with the canvas editor.
        </p>
      </div>
    );
  }

  if (node.type === 'add_tag' || node.type === 'remove_tag') {
    return (
      <input
        type="text"
        value={String(cfg.tagSlug ?? '')}
        onChange={(e) => onChange({ tagSlug: e.target.value })}
        placeholder="tag-slug"
        className="h-9 w-full rounded-md border border-secondary-300 px-2 font-mono text-xs focus:border-primary-500 focus:outline-none"
      />
    );
  }

  if (node.type === 'move_to_list' || node.type === 'remove_from_list') {
    return (
      <input
        type="text"
        value={String(cfg.listSlug ?? '')}
        onChange={(e) => onChange({ listSlug: e.target.value })}
        placeholder="list-slug"
        className="h-9 w-full rounded-md border border-secondary-300 px-2 font-mono text-xs focus:border-primary-500 focus:outline-none"
      />
    );
  }

  if (node.type === 'send_webhook') {
    return (
      <input
        type="url"
        value={String(cfg.url ?? '')}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="https://your-service.example.com/webhook"
        className="h-9 w-full rounded-md border border-secondary-300 px-2 text-sm focus:border-primary-500 focus:outline-none"
      />
    );
  }

  return (
    <pre className="overflow-auto rounded-md bg-secondary-50 p-2 text-xs text-secondary-700">
      {JSON.stringify(cfg, null, 2)}
    </pre>
  );
}

function InsertSlot({
  open,
  onOpen,
  onPick,
}: {
  open: boolean;
  onOpen: () => void;
  onPick: (t: AddableNodeType) => void;
}) {
  return (
    <div className="my-1.5 flex items-center gap-2 pl-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Insert step"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-secondary-300 bg-white px-2.5 py-0.5 text-xs font-medium text-secondary-500 hover:border-secondary-400 hover:text-secondary-700"
      >
        <Plus className="h-3 w-3" />
        Insert
      </button>
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          {ADDABLE.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-md bg-secondary-100 px-2 py-0.5 text-xs text-secondary-700 hover:bg-secondary-200"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
