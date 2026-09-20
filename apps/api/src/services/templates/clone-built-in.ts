/**
 * Cloning a shipped email template into an organisation's own list.
 *
 * This is what POST /api/v1/templates/:id/use does when a customer picks a
 * template from the gallery (routes/v1/templates.ts). Forking a flow template
 * needs the same thing — a `send_email` step can only name a template row of
 * the organisation's own, so the emails the flow sends have to exist there
 * first — and two copies of one insert would drift.
 *
 * `reuseExisting` is the one difference between the two callers. The gallery
 * button means "give me another copy to edit", so it clones every time. A fork
 * means "this flow sends this email", and a customer who forks three flows
 * from the same category should not end up with the same email three times, so
 * the fork reuses a row it already made. The match is by name within the
 * organisation, because nothing on the row records which built-in it came from
 * and adding a column would be a migration.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { getTemplateById, localeOf } from '../editor/templates/index.js';

export interface ClonedTemplate {
  id: string;
  name: string;
  /** False when an earlier clone of the same built-in was reused. */
  created: boolean;
}

export async function cloneBuiltInTemplate(
  orgId: string,
  builtInId: string,
  opts: { name?: string; reuseExisting?: boolean } = {},
): Promise<ClonedTemplate> {
  const builtIn = getTemplateById(builtInId);
  if (!builtIn) throw AppError.notFound(`Built-in template "${builtInId}"`);

  const name = opts.name ?? builtIn.name;

  if (opts.reuseExisting) {
    const [existing] = await db
      .select({ id: templates.id, name: templates.name })
      .from(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.name, name)))
      .limit(1);
    if (existing) return { id: existing.id, name: existing.name, created: false };
  }

  const schema = builtIn.schema as {
    subject?: string;
    preheader?: string;
    blocks?: unknown[];
    globalStyles?: Record<string, unknown>;
  };

  const [row] = await db
    .insert(templates)
    .values({
      orgId,
      name,
      description: builtIn.description,
      subject: schema.subject ?? '',
      preheader: schema.preheader ?? '',
      blocks: schema.blocks ?? [],
      globalStyles: schema.globalStyles ?? {},
      // The first link in the chain that carries language to the inbox — see
      // the route this was lifted from.
      locale: localeOf(builtIn),
    })
    .returning({ id: templates.id, name: templates.name });

  if (!row) throw AppError.internal(`Could not save a copy of "${builtInId}"`);
  return { id: row.id, name: row.name, created: true };
}
