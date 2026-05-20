import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { WorkflowEditor } from './workflow-editor';

interface Workflow {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: Array<{
    id: string;
    type:
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
      | 'assign_task';
    config: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function WorkflowEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = await apiFetch<Workflow | null>(`/api/v1/workflows/${id}`, { fallback: null });
  if (!wf) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/workflows/${wf.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to workflow
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-secondary-900">Edit — {wf.name}</h1>
          <Badge variant="default">{wf.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-secondary-500">
          Edit step content + add or remove steps from the main flow. Branching paths are preserved
          but not yet editable here.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Workflow steps</CardTitle>
          <CardDescription>
            Drafts only. Pause an active workflow before editing to avoid breaking in-flight runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowEditor
            workflowId={wf.id}
            initialName={wf.name}
            initialNodes={wf.nodes}
            initialEdges={wf.edges}
            status={wf.status}
          />
        </CardContent>
      </Card>
    </div>
  );
}
