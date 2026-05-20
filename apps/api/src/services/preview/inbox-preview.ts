/**
 * Inbox preview service (Sprint E.8).
 *
 * Workflow:
 *   1. createPreviewJob(orgId, input) — INSERT row in 'pending', call provider
 *      to start render, flip to 'running' with provider_job_id.
 *   2. getPreviewJob — if still 'running', poll provider; if provider
 *      reports completed/failed, persist + return.
 *
 * Lazy-poll on read keeps the surface tiny (no separate BullMQ worker
 * needed yet) and the typical 30–90s SLA tolerates "poll on next refresh"
 * UX in the editor. A worker can be added later without changing call
 * sites by introducing a periodic POST /internal/inbox-preview/poll.
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { inboxPreviewJobs } from '../../db/schema/index.js';
import { selectProvider, mockProvider, type PreviewClient } from './providers.js';
import { AppError } from '../../lib/app-error.js';

export interface CreatePreviewInput {
  html: string;
  subject?: string;
  campaignId?: string;
  /** Optional client list — defaults to provider's full list. */
  clients?: string[];
}

export async function listSupportedClients(): Promise<PreviewClient[]> {
  return selectProvider().listClients();
}

export async function createPreviewJob(orgId: string, input: CreatePreviewInput) {
  if (!input.html || input.html.length < 20) {
    throw new AppError({
      code: 'INVALID_HTML',
      message: 'HTML body too short for inbox preview',
      statusCode: 400,
    });
  }

  const provider = selectProvider();
  const clientList = input.clients?.length
    ? input.clients
    : provider.listClients().map((c) => c.id);

  // Insert pending row first so we have an id to attach errors to.
  const [row] = await db
    .insert(inboxPreviewJobs)
    .values({
      orgId,
      campaignId: input.campaignId,
      provider: provider.name,
      subject: input.subject,
      html: input.html,
      clients: clientList,
      status: 'pending',
    })
    .returning();

  try {
    const { providerJobId } = await provider.startJob({
      html: input.html,
      subject: input.subject,
      clients: clientList,
    });
    const [updated] = await db
      .update(inboxPreviewJobs)
      .set({ providerJobId, status: 'running' })
      .where(eq(inboxPreviewJobs.id, row!.id))
      .returning();
    return updated!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [updated] = await db
      .update(inboxPreviewJobs)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(inboxPreviewJobs.id, row!.id))
      .returning();
    return updated!;
  }
}

export async function getPreviewJob(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(inboxPreviewJobs)
    .where(and(eq(inboxPreviewJobs.orgId, orgId), eq(inboxPreviewJobs.id, id)))
    .limit(1);

  if (!row) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Preview job not found', statusCode: 404 });
  }
  if (row.status !== 'running' || !row.providerJobId) return row;

  // Lazy-poll. If the provider says "still running", we just return the
  // current row; the caller polls again. Mock returns 'completed' instantly.
  const providers = { [mockProvider.name]: mockProvider } as const;
  const provider = providers[row.provider as keyof typeof providers] ?? selectProvider();

  try {
    const polled = await provider.pollJob(row.providerJobId);
    if (polled.status === 'completed' || polled.status === 'failed') {
      const [updated] = await db
        .update(inboxPreviewJobs)
        .set({
          status: polled.status,
          results: polled.results ?? [],
          error: polled.error,
          completedAt: new Date(),
        })
        .where(eq(inboxPreviewJobs.id, row.id))
        .returning();
      return updated!;
    }
    return { ...row, results: polled.results ?? row.results };
  } catch {
    // Polling failure isn't a job failure — return row as-is so a retry
    // on next refresh can still succeed.
    return row;
  }
}

export async function listPreviewJobs(
  orgId: string,
  opts: { campaignId?: string; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 20, 100);
  const conds = [eq(inboxPreviewJobs.orgId, orgId)];
  if (opts.campaignId) conds.push(eq(inboxPreviewJobs.campaignId, opts.campaignId));

  return db
    .select()
    .from(inboxPreviewJobs)
    .where(and(...conds))
    .orderBy(desc(inboxPreviewJobs.createdAt))
    .limit(limit);
}
