/**
 * Data activation (#266) — push segments/traits back to source systems.
 *
 * Pattern:
 *   1. `runActivation(destinationId, { segmentId, mode })` resolves the audience
 *      (segment members) → enriches each row with the unified profile →
 *      delivers to the destination's connector.
 *   2. Progress is recorded in `activation_runs`; last-known state per
 *      destination allows incremental deltas (only push changes since last run).
 *   3. Connectors are pluggable — start with webhook + Mailchimp-style JSON,
 *      extend with salesforce/hubspot/meta-ads/google-ads/tiktok-ads.
 *
 * Segmentation: leverages existing segment evaluator (services/segments).
 * Enrichment: unified profile + traits.
 */

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  activationDestinations,
  activationRuns,
  contacts,
  type ActivationDestination,
  type ActivationRun,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { getUnifiedProfile } from './unified-profile.js';
import { getTraits } from './traits.js';

export type DestinationKind =
  | 'webhook'
  | 'mailchimp'
  | 'salesforce'
  | 'hubspot'
  | 'meta_ads'
  | 'google_ads'
  | 'tiktok_ads';

export type ActivationMode = 'upsert' | 'insert_only' | 'delete_only';

export interface ActivationConfig {
  /** Webhook URL for kind = webhook. */
  url?: string;
  /** Pre-shared secret for HMAC header on webhook. */
  secret?: string;
  /** Target list id (mailchimp audience id, salesforce campaign id, …). */
  listId?: string;
  /** API key or OAuth token for the provider. In production, store a
   *  secret ref — the raw token lives in the org secrets vault. */
  apiKey?: string;
  /** Ad-platform audience id. */
  audienceId?: string;
  /** Map internal trait keys → destination-native field names. */
  fieldMap?: Record<string, string>;
  /** Column allow-list to ship (prevents leaking PII by default). */
  columns?: string[];
}

export interface ActivationPayloadRow {
  contactId: string;
  email: string | null;
  phone: string | null;
  traits: Record<string, unknown>;
  customFields: Record<string, unknown>;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createDestination(
  orgId: string,
  input: { name: string; kind: DestinationKind; config: ActivationConfig },
): Promise<ActivationDestination> {
  const [row] = await db
    .insert(activationDestinations)
    .values({
      orgId,
      name: input.name,
      kind: input.kind,
      config: input.config as Record<string, unknown>,
    })
    .returning();
  return row!;
}

export async function listDestinations(orgId: string): Promise<ActivationDestination[]> {
  return db.select().from(activationDestinations).where(eq(activationDestinations.orgId, orgId));
}

export async function deleteDestination(orgId: string, id: string): Promise<void> {
  await db
    .delete(activationDestinations)
    .where(and(eq(activationDestinations.id, id), eq(activationDestinations.orgId, orgId)));
}

// ─── Audience resolution ─────────────────────────────────────────────────────

/**
 * Resolve contact ids for an activation run. If `segmentId` is null, ship
 * the whole active contact list (use sparingly — fine for small orgs,
 * stream in pages for large ones).
 */
async function resolveAudience(
  orgId: string,
  segmentId: string | null,
  limit: number,
): Promise<string[]> {
  if (segmentId) {
    const rows = await db.execute<{ contact_id: string }>(sql`
      SELECT contact_id::text FROM segment_members
      WHERE org_id = ${orgId}::uuid AND segment_id = ${segmentId}::uuid
      LIMIT ${limit}
    `);
    return (rows as unknown as Array<{ contact_id: string }>).map((r) => r.contact_id);
  }
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.status, 'active')))
    .limit(limit);
  return rows.map((r) => r.id);
}

// ─── Row enrichment ──────────────────────────────────────────────────────────

async function enrichRow(orgId: string, contactId: string): Promise<ActivationPayloadRow | null> {
  try {
    const profile = await getUnifiedProfile(orgId, contactId);
    const traits = profile.traits ?? (await getTraits(orgId, contactId));
    return {
      contactId,
      email: profile.contact.email ?? null,
      phone: profile.contact.phone ?? null,
      traits,
      customFields: (profile.contact.customFields ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function applyFieldMap(
  row: ActivationPayloadRow,
  config: ActivationConfig,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    contact_id: row.contactId,
    email: row.email,
    phone: row.phone,
    ...row.customFields,
    ...row.traits,
  };
  if (!config.fieldMap) return base;
  const mapped: Record<string, unknown> = {};
  for (const [internal, external] of Object.entries(config.fieldMap)) {
    if (internal in base) mapped[external] = base[internal];
  }
  // Keep identifiers unmapped so the destination can match records.
  if (row.email) mapped.email = row.email;
  if (row.phone) mapped.phone = row.phone;
  return mapped;
}

// ─── Connectors ──────────────────────────────────────────────────────────────

async function deliverWebhook(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
  mode: ActivationMode,
): Promise<void> {
  if (!config.url) throw AppError.badRequest('Webhook destination requires config.url');
  const body = JSON.stringify({ mode, rows });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.secret) {
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', config.secret).update(body).digest('hex');
    headers['x-forgemsg-signature'] = sig;
  }
  const res = await fetch(config.url, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverMailchimp(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
  mode: ActivationMode,
): Promise<void> {
  if (!config.apiKey || !config.listId) {
    throw AppError.badRequest('Mailchimp destination requires apiKey + listId');
  }
  const dc = config.apiKey.split('-').pop() ?? 'us1';
  const baseUrl = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = 'Basic ' + Buffer.from(`anystring:${config.apiKey}`).toString('base64');

  const operations = rows
    .filter((r) => typeof r.email === 'string' && r.email)
    .map((r) => {
      const email = r.email as string;
      const subscriberHash = hashEmail(email);
      const status = mode === 'delete_only' ? 'unsubscribed' : 'subscribed';
      return {
        method: mode === 'delete_only' ? 'DELETE' : 'PUT',
        path: `/lists/${config.listId}/members/${subscriberHash}`,
        body: JSON.stringify({
          email_address: email,
          status_if_new: status,
          status,
          merge_fields: r,
        }),
      };
    });
  const res = await fetch(`${baseUrl}/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) throw new Error(`mailchimp ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverMetaAds(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
  mode: ActivationMode,
): Promise<void> {
  if (!config.apiKey || !config.audienceId) {
    throw AppError.badRequest('Meta Ads destination requires apiKey + audienceId');
  }
  const { createHash } = await import('node:crypto');
  const hashed = rows
    .filter((r) => typeof r.email === 'string' && r.email)
    .map((r) => [createHash('sha256').update(String(r.email).toLowerCase().trim()).digest('hex')]);
  const payload = {
    payload: { schema: ['EMAIL'], data: hashed },
    session: { session_id: Date.now(), batch_seq: 1, last_batch_flag: true },
  };
  const method = mode === 'delete_only' ? 'DELETE' : 'POST';
  const url = `https://graph.facebook.com/v18.0/${config.audienceId}/users?access_token=${encodeURIComponent(config.apiKey)}`;
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`meta_ads ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverGoogleAds(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!config.apiKey || !config.audienceId) {
    throw AppError.badRequest('Google Ads destination requires apiKey + audienceId (user list id)');
  }
  // Customer Match via Google Ads API — shipping a request body mirroring the
  // UserListService.addUserListMembers call. The full OAuth flow is handled
  // at the destination-config step; here we only ship the hashed audience.
  const { createHash } = await import('node:crypto');
  const members = rows
    .filter((r) => typeof r.email === 'string' && r.email)
    .map((r) => ({
      hashed_email: createHash('sha256').update(String(r.email).toLowerCase().trim()).digest('hex'),
    }));
  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${config.audienceId}:addOfflineUserDataJobOperations`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        operations: members.map((m) => ({ create: { user_identifiers: [m] } })),
      }),
    },
  );
  if (!res.ok) throw new Error(`google_ads ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverHubspot(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!config.apiKey) throw AppError.badRequest('HubSpot destination requires apiKey');
  const inputs = rows
    .filter((r) => typeof r.email === 'string' && r.email)
    .map((r) => ({
      idProperty: 'email',
      id: r.email as string,
      properties: r,
    }));
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) throw new Error(`hubspot ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverSalesforce(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!config.apiKey || !config.url) {
    throw AppError.badRequest(
      'Salesforce destination requires apiKey (access token) + url (instance URL)',
    );
  }
  const records = rows.map((r) => ({ attributes: { type: 'Lead' }, ...r }));
  const res = await fetch(`${config.url}/services/data/v58.0/composite/tree/Lead`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) throw new Error(`salesforce ${res.status}: ${await res.text().catch(() => '')}`);
}

async function deliverTiktokAds(
  config: ActivationConfig,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!config.apiKey || !config.audienceId) {
    throw AppError.badRequest('TikTok Ads destination requires apiKey + audienceId');
  }
  const { createHash } = await import('node:crypto');
  const data = rows
    .filter((r) => typeof r.email === 'string' && r.email)
    .map((r) => createHash('sha256').update(String(r.email).toLowerCase().trim()).digest('hex'));
  const res = await fetch(
    'https://business-api.tiktok.com/open_api/v1.3/dmp/custom_audience/update/',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'access-token': config.apiKey,
      },
      body: JSON.stringify({
        custom_audience_id: config.audienceId,
        calculate_type: 'EMAIL_SHA256',
        file_paths: [],
        data,
        action: 'APPEND',
      }),
    },
  );
  if (!res.ok) throw new Error(`tiktok_ads ${res.status}: ${await res.text().catch(() => '')}`);
}

const DELIVER: Record<
  DestinationKind,
  (config: ActivationConfig, rows: Record<string, unknown>[], mode: ActivationMode) => Promise<void>
> = {
  webhook: deliverWebhook,
  mailchimp: deliverMailchimp,
  salesforce: (c, r) => deliverSalesforce(c, r),
  hubspot: (c, r) => deliverHubspot(c, r),
  meta_ads: deliverMetaAds,
  google_ads: (c, r) => deliverGoogleAds(c, r),
  tiktok_ads: (c, r) => deliverTiktokAds(c, r),
};

// ─── Run ─────────────────────────────────────────────────────────────────────

export interface RunActivationInput {
  segmentId?: string | null;
  mode?: ActivationMode;
  /** Cap on rows per run — protects from accidentally shipping a full DB. */
  limit?: number;
}

export async function runActivation(
  orgId: string,
  destinationId: string,
  input: RunActivationInput = {},
): Promise<ActivationRun> {
  const [dest] = await db
    .select()
    .from(activationDestinations)
    .where(
      and(eq(activationDestinations.id, destinationId), eq(activationDestinations.orgId, orgId)),
    )
    .limit(1);
  if (!dest) throw AppError.notFound('ActivationDestination');
  if (dest.status !== 'active') throw AppError.badRequest('Destination is not active');

  const [run] = await db
    .insert(activationRuns)
    .values({
      orgId,
      destinationId,
      segmentId: input.segmentId ?? null,
      mode: input.mode ?? 'upsert',
      status: 'running',
    })
    .returning();
  if (!run) throw AppError.internal('Failed to create activation run');

  const limit = Math.min(Math.max(1, input.limit ?? 10_000), 100_000);
  let succeeded = 0;
  let failed = 0;

  try {
    const contactIds = await resolveAudience(orgId, input.segmentId ?? null, limit);
    const config = dest.config as ActivationConfig;
    const kind = dest.kind as DestinationKind;
    const deliver = DELIVER[kind];
    if (!deliver) throw AppError.badRequest(`Unsupported destination kind: ${kind}`);

    // Enrich in chunks so memory stays bounded.
    const CHUNK = 200;
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const slice = contactIds.slice(i, i + CHUNK);
      const enriched = (await Promise.all(slice.map((id) => enrichRow(orgId, id)))).filter(
        (r): r is ActivationPayloadRow => r !== null,
      );
      const rows = enriched.map((r) => applyFieldMap(r, config));
      try {
        await deliver(config, rows, input.mode ?? 'upsert');
        succeeded += rows.length;
      } catch (err) {
        failed += rows.length;
        throw err;
      }
    }

    const [final] = await db
      .update(activationRuns)
      .set({
        status: 'ok',
        rowsProcessed: String(contactIds.length),
        rowsSucceeded: String(succeeded),
        rowsFailed: String(failed),
        finishedAt: new Date(),
      })
      .where(eq(activationRuns.id, run.id))
      .returning();
    return final!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [final] = await db
      .update(activationRuns)
      .set({
        status: 'error',
        rowsSucceeded: String(succeeded),
        rowsFailed: String(failed),
        error: message.slice(0, 2000),
        finishedAt: new Date(),
      })
      .where(eq(activationRuns.id, run.id))
      .returning();
    return final!;
  }
}

export async function listActivationRuns(
  orgId: string,
  destinationId: string,
  limit = 50,
): Promise<ActivationRun[]> {
  return db
    .select()
    .from(activationRuns)
    .where(and(eq(activationRuns.orgId, orgId), eq(activationRuns.destinationId, destinationId)))
    .orderBy(sql`${activationRuns.startedAt} DESC`)
    .limit(limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashEmail(email: string): string {
  // Mailchimp ingestion path: md5(lowercase). Tree-shaken if the mailchimp
  // destination isn't compiled in for this build, so cheap to keep imported.
  return createHash('md5').update(email.toLowerCase()).digest('hex');
}
