/**
 * Viber template CRUD service.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  viberTemplates,
  type NewViberTemplate,
  type ViberTemplate,
} from '../../db/schema/index.js';

type CreateViberTemplateInput = Omit<NewViberTemplate, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>;
type UpdateViberTemplateInput = Partial<CreateViberTemplateInput>;

export async function listViberTemplates(orgId: string, status?: string): Promise<ViberTemplate[]> {
  const conditions = [eq(viberTemplates.orgId, orgId)];
  if (status) {
    conditions.push(eq(viberTemplates.status, status));
  }

  return db
    .select()
    .from(viberTemplates)
    .where(and(...conditions))
    .orderBy(viberTemplates.createdAt);
}

export async function createViberTemplate(
  orgId: string,
  data: CreateViberTemplateInput,
): Promise<ViberTemplate> {
  const [template] = await db
    .insert(viberTemplates)
    .values({ ...data, orgId })
    .returning();

  return template!;
}

export async function updateViberTemplate(
  orgId: string,
  id: string,
  data: UpdateViberTemplateInput,
): Promise<ViberTemplate | null> {
  const [template] = await db
    .update(viberTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(viberTemplates.id, id), eq(viberTemplates.orgId, orgId)))
    .returning();

  return template ?? null;
}
