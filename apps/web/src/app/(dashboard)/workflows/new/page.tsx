import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { NewWorkflowForm } from './new-workflow-form';

export const dynamic = 'force-dynamic';

/**
 * Workflow create-from-scratch — alternative to fork-from-template. User
 * picks a trigger type, names the workflow, we seed it with a minimal
 * starter graph (trigger → wait 1 day → send_email) so the canvas isn't
 * empty when they land in the editor.
 */
export default function NewWorkflowPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/workflows"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New workflow</CardTitle>
          <CardDescription>
            Start from a blank canvas. Prefer a proven recipe?{' '}
            <Link href="/workflows/gallery" className="text-primary-700 hover:text-primary-900">
              Browse the gallery
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewWorkflowForm />
        </CardContent>
      </Card>

      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-secondary-500">
        <Sparkles className="h-3 w-3" />
        Tip: the gallery has 19 ready-made recipes including CZ jmeniny + Velikonoce — much faster
        than building from zero.
      </p>
    </div>
  );
}
