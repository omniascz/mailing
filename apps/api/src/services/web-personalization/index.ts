import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { webPersonalizationRules, type WebPersonalizationRule } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRule(
  orgId: string,
  input: {
    siteId?: string | null;
    name: string;
    selector: string;
    action?: WebPersonalizationRule['action'];
    value?: string | null;
    urlPattern?: string | null;
    audience?: WebPersonalizationRule['audience'];
    priority?: string;
  },
): Promise<WebPersonalizationRule> {
  const [row] = await db
    .insert(webPersonalizationRules)
    .values({
      orgId,
      siteId: input.siteId ?? null,
      name: input.name,
      selector: input.selector,
      action: input.action ?? 'swap_text',
      value: input.value ?? null,
      urlPattern: input.urlPattern ?? null,
      audience: input.audience ?? { type: 'all' },
      priority: input.priority ?? '10',
    })
    .returning();
  return row!;
}

export async function getRule(orgId: string, id: string): Promise<WebPersonalizationRule> {
  const [row] = await db
    .select()
    .from(webPersonalizationRules)
    .where(
      and(
        eq(webPersonalizationRules.id, id),
        eq(webPersonalizationRules.orgId, orgId),
        isNull(webPersonalizationRules.deletedAt),
      ),
    );
  if (!row) throw AppError.notFound('Personalization rule not found');
  return row;
}

export async function listRules(orgId: string, siteId?: string): Promise<WebPersonalizationRule[]> {
  const conditions = [
    eq(webPersonalizationRules.orgId, orgId),
    isNull(webPersonalizationRules.deletedAt),
  ];
  if (siteId) conditions.push(eq(webPersonalizationRules.siteId, siteId));
  return db
    .select()
    .from(webPersonalizationRules)
    .where(and(...conditions))
    .orderBy(desc(webPersonalizationRules.createdAt));
}

export async function updateRule(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    selector: string;
    action: WebPersonalizationRule['action'];
    value: string | null;
    urlPattern: string | null;
    audience: WebPersonalizationRule['audience'];
    priority: string;
    active: boolean;
  }>,
): Promise<WebPersonalizationRule> {
  await getRule(orgId, id);
  const [row] = await db
    .update(webPersonalizationRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(webPersonalizationRules.id, id), eq(webPersonalizationRules.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteRule(orgId: string, id: string): Promise<void> {
  await getRule(orgId, id);
  await db
    .update(webPersonalizationRules)
    .set({ deletedAt: new Date() })
    .where(and(eq(webPersonalizationRules.id, id), eq(webPersonalizationRules.orgId, orgId)));
}

// ─── Public: resolve rules for a visitor ─────────────────────────────────────

/**
 * Returns applicable personalization rules for a visitor on a given URL.
 * Called by the JS tracker to get DOM modifications to apply.
 */
export async function resolveRulesForVisitor(input: {
  siteToken: string;
  visitorId: string;
  contactId?: string;
  url?: string;
  path?: string;
}): Promise<WebPersonalizationRule[]> {
  const { getSiteByToken } = await import('../tracking/site-tracker.js');
  const site = await getSiteByToken(input.siteToken);
  if (!site) return [];

  const rules = await db
    .select()
    .from(webPersonalizationRules)
    .where(
      and(
        eq(webPersonalizationRules.orgId, site.orgId),
        eq(webPersonalizationRules.active, true),
        isNull(webPersonalizationRules.deletedAt),
      ),
    );

  return rules.filter((r) => {
    // Site scoping
    if (r.siteId && r.siteId !== site.id) return false;

    // URL pattern matching (simple glob: * matches anything)
    if (r.urlPattern && input.path) {
      const pattern = r.urlPattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (!regex.test(input.path)) return false;
    }

    // Audience matching
    const aud = r.audience as WebPersonalizationRule['audience'];
    if (aud.type === 'all') return true;
    if (aud.type === 'returning_visitor') return false; // would need visitor history
    if (aud.type === 'new_visitor') return true; // assume new by default
    if (aud.type.startsWith('segment:') && !input.contactId) return false;

    return true;
  });
}
