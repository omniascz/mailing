/**
 * Partner provisioning — create (or find) a ForgeMsg org for an external partner
 * tenant (e.g. a Tixly promoter/theater) and issue an API key for it. Lets the
 * partner platform self-provision a per-tenant org so events route to the right
 * isolated org. Gated by a platform partner secret (see the route).
 *
 * Idempotent on the partner's external id (stored in org.settings). A fresh API
 * key is issued on each call (raw keys can't be retrieved later); the caller
 * stores the latest. Seeds the org's ticketing automations on first creation.
 */
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/organizations.js';
import { apiKeys } from '../../db/schema/webhooks.js';
import { createApiKey } from '../webhooks/index.js';
import { seedTicketingWorkflows } from '../ticketing/seed-workflows.js';

// Synthetic creator for partner-provisioned keys (api_keys.user_id is nullable,
// no FK — this is just an audit marker).
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'org'
  );
}

export interface ProvisionInput {
  /** The partner's stable tenant id (e.g. Tixly promoter id). */
  externalId: string;
  name: string;
  /** ISO country — CZ/SK pin the org to the EU data region. */
  country?: string;
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
}

export interface ProvisionResult {
  orgId: string;
  created: boolean;
  apiKey: string;
  seeded: string[];
}

async function findOrgByExternalId(externalId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.settings} ->> 'partnerExternalId' = ${externalId}`)
    .limit(1);
  return row?.id ?? null;
}

export async function provisionPartnerOrg(input: ProvisionInput): Promise<ProvisionResult> {
  const region = input.country && ['CZ', 'SK'].includes(input.country.toUpperCase()) ? 'eu' : 'us';

  let orgId = await findOrgByExternalId(input.externalId);
  let created = false;
  const seeded: string[] = [];

  if (!orgId) {
    const slug = `${slugify(input.name)}-${randomBytes(4).toString('hex')}`;
    const [org] = await db
      .insert(organizations)
      .values({
        name: input.name,
        slug,
        plan: input.plan ?? 'free',
        dataRegion: region,
        settings: { partnerExternalId: input.externalId, partner: 'tixly' },
      } as never)
      .returning({ id: organizations.id });
    orgId = org!.id;
    created = true;

    // First-time setup: seed the ticketing automations (draft).
    const res = await seedTicketingWorkflows(orgId).catch(() => ({ created: [] as string[] }));
    seeded.push(...res.created);
  }

  // Deactivate prior partner keys so only the latest is valid, then issue a
  // fresh one (lookupApiKey filters active = true).
  await db
    .update(apiKeys)
    .set({ active: false } as never)
    .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.name, 'tixly-integration')));

  const { rawKey } = await createApiKey(
    orgId,
    SYSTEM_USER_ID,
    'tixly-integration',
    ['ticketing:write'],
    undefined,
    'live',
  );

  return { orgId, created, apiKey: rawKey, seeded };
}
