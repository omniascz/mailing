/**
 * WhatsApp template management service (task 7.7).
 *
 * Templates must be submitted to Meta for approval before use.
 * Meta API: POST /{waba_id}/message_templates
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { whatsappTemplates, type WaTemplateComponent } from '../../db/schema/whatsapp.js';
import { AppError } from '../../lib/app-error.js';

const API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${API_VERSION}`;

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listWaTemplates(orgId: string, status?: string) {
  if (status) {
    // Dynamic filter by status
    const rows = await db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.orgId, orgId));
    return rows.filter((r) => r.status === status);
  }

  return db.select().from(whatsappTemplates).where(eq(whatsappTemplates.orgId, orgId));
}

export async function getWaTemplate(id: string, orgId: string) {
  const [template] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.orgId, orgId)))
    .limit(1);

  if (!template) throw AppError.notFound('WaTemplate');
  return template;
}

export async function createWaTemplate(
  orgId: string,
  data: {
    name: string;
    category?: 'marketing' | 'utility' | 'authentication';
    language?: string;
    components: WaTemplateComponent[];
  },
) {
  const [template] = await db
    .insert(whatsappTemplates)
    .values({
      orgId,
      name: data.name.toLowerCase().replace(/\s+/g, '_'),
      category: data.category ?? 'utility',
      language: data.language ?? 'en_US',
      components: data.components,
      status: 'draft',
    })
    .returning();

  return template;
}

export async function updateWaTemplate(
  id: string,
  orgId: string,
  data: Partial<{
    category: 'marketing' | 'utility' | 'authentication';
    language: string;
    components: WaTemplateComponent[];
  }>,
) {
  const [template] = await db
    .update(whatsappTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappTemplates.id, id),
        eq(whatsappTemplates.orgId, orgId),
        eq(whatsappTemplates.status, 'draft'),
      ),
    )
    .returning();

  if (!template) throw AppError.notFound('WaTemplate (only draft templates can be edited)');
  return template;
}

export async function deleteWaTemplate(id: string, orgId: string) {
  await db
    .delete(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.orgId, orgId)));
}

// ─── Meta submission ──────────────────────────────────────────────────────────

interface MetaSubmitResponse {
  id?: string;
  status?: string;
  error?: { message: string; code: number };
}

/**
 * Submit a template to Meta for approval.
 * Updates template.status = 'pending' and stores metaTemplateId.
 */
export async function submitWaTemplateForApproval(
  id: string,
  orgId: string,
  accessToken: string,
  wabaId: string,
): Promise<typeof whatsappTemplates.$inferSelect> {
  const template = await getWaTemplate(id, orgId);

  if (template.status !== 'draft' && template.status !== 'rejected') {
    throw AppError.badRequest(`Template status '${template.status}' cannot be submitted`);
  }

  const payload = {
    name: template.name,
    category: template.category.toUpperCase(),
    language: template.language,
    components: template.components,
  };

  const httpResp = await fetch(`${META_BASE}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const resp = (await httpResp.json()) as MetaSubmitResponse;

  if (!httpResp.ok || resp.error) {
    throw new AppError({
      code: 'META_SUBMISSION_FAILED',
      message: resp.error?.message ?? `Meta API HTTP ${httpResp.status}`,
      statusCode: httpResp.status >= 500 ? 502 : 400,
      details: { metaError: resp.error },
    });
  }

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      status: 'pending',
      metaTemplateId: resp.id ?? resp.status,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappTemplates.id, id))
    .returning();

  return updated!;
}

// ─── Webhook status sync ──────────────────────────────────────────────────────

/**
 * Called when Meta sends a template_status_update webhook.
 * Updates local template status + rejection reason.
 */
export async function syncWaTemplateStatus(
  orgId: string,
  templateName: string,
  language: string,
  newStatus: string,
  rejectionReason?: string,
) {
  const status = newStatus.toLowerCase() as
    | 'approved'
    | 'rejected'
    | 'paused'
    | 'disabled'
    | 'pending';

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      status,
      ...(rejectionReason && { rejectionReason }),
      ...(status === 'approved' && { approvedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappTemplates.orgId, orgId),
        eq(whatsappTemplates.name, templateName),
        eq(whatsappTemplates.language, language),
      ),
    )
    .returning();

  return updated ?? null;
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

export async function incrementTemplateUsage(orgId: string, templateName: string) {
  await db
    .update(whatsappTemplates)
    .set({
      usageCount: db
        .select({ v: whatsappTemplates.usageCount })
        .from(whatsappTemplates)
        .where(and(eq(whatsappTemplates.orgId, orgId), eq(whatsappTemplates.name, templateName)))
        .limit(1) as unknown as number,
    })
    .where(and(eq(whatsappTemplates.orgId, orgId), eq(whatsappTemplates.name, templateName)));
}
