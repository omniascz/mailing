import { and, asc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import { emitWebhookEvent, toContactSummary, changedFields } from '../webhooks/emit.js';
import type { ContactSource } from '../webhooks/payloads.js';
import { db } from '../../db/client.js';
import { contacts, type Contact } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { parsePhonePrefix } from '../import/phone-prefix.js';
import type { UnsubscribeSource } from './unsubscribe.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ListContactsOpts {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: Contact['status'];
  list_id?: string;
  tag_id?: string;
  phone_operator?: string;
  phone_district?: string;
}

export interface CreateContactInput {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  status?: Contact['status'];
  isVip?: boolean;
  customFields?: Record<string, unknown>;
  source?: string;
  sourceDetails?: Record<string, unknown>;
  emailValidationScore?: string;
  emailValidatedAt?: Date;
  // Phone intelligence (auto-populated by enrichPhone)
  phoneType?: Contact['phoneType'];
  phoneOperator?: string;
  phoneRegion?: string;
  phoneDistrict?: string;
  phoneCountry?: string;
  phoneLookupAt?: Date;
}

export type UpdateContactInput = Partial<
  Omit<CreateContactInput, 'emailValidationScore' | 'emailValidatedAt'> & {
    leadScore?: string;
    emailValidationScore?: string;
    emailValidatedAt?: Date;
  }
>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFilterConditions(orgId: string, opts: Omit<ListContactsOpts, 'cursor' | 'limit'>) {
  const conditions = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];

  if (opts.status) {
    conditions.push(eq(contacts.status, opts.status));
  }
  if (opts.phone_operator) {
    conditions.push(eq(contacts.phoneOperator, opts.phone_operator));
  }
  if (opts.phone_district) {
    conditions.push(eq(contacts.phoneDistrict, opts.phone_district));
  }
  if (opts.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(contacts.email, q),
        ilike(contacts.firstName, q),
        ilike(contacts.lastName, q),
        ilike(contacts.phone, q),
      )!,
    );
  }
  if (opts.tag_id) {
    conditions.push(
      sql`${contacts.id} IN (SELECT contact_id FROM contact_tags WHERE tag_id = ${opts.tag_id}::uuid)`,
    );
  }
  if (opts.list_id) {
    conditions.push(
      sql`${contacts.id} IN (SELECT contact_id FROM contact_lists WHERE list_id = ${opts.list_id}::uuid)`,
    );
  }

  return conditions;
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function listContacts(orgId: string, opts: ListContactsOpts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const filterConds = buildFilterConditions(orgId, opts);

  // Page query includes cursor
  const pageConds = [...filterConds];
  if (opts.cursor) pageConds.push(gt(contacts.id, opts.cursor));

  const rows = await db
    .select()
    .from(contacts)
    .where(and(...pageConds))
    .orderBy(asc(contacts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(...filterConds));
  const total = countRow?.count ?? 0;

  return { data, cursor: nextCursor, hasMore, total };
}

export async function getContact(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('Contact');
  return row;
}

/**
 * Enrich a contact input with phone prefix data (operator, type, region, country).
 * This is the same enrichment the import pipeline runs.
 */
function enrichPhone(input: CreateContactInput): CreateContactInput {
  if (!input.phone) return input;
  const info = parsePhonePrefix(input.phone);
  if (!info.isValid) return input;
  return {
    ...input,
    phone: info.normalized,
    phoneType: info.type === 'unknown' ? undefined : (info.type ?? undefined),
    phoneOperator: info.operator ?? undefined,
    phoneRegion: info.region ?? undefined,
    phoneDistrict: info.district ?? undefined,
    phoneCountry: info.country ?? undefined,
    phoneLookupAt: new Date(),
  };
}

/**
 * Webhook events are emitted from HERE rather than from the routes, because
 * these four functions are what every single-contact path goes through —
 * POST /contacts, the Zapier action, the Resend-compat audience routes, the
 * VIP toggle, archive and unarchive. Emitting at the routes would mean six
 * call sites for contact.updated alone, and the next route added would
 * silently not emit. This is the choke point.
 *
 * Paths that write to `contacts` directly (signup forms, SMS keywords, the
 * inbox, ticketing, lead ads, Calendly, CDP identity resolution) do not come
 * through here and emit for themselves. Bulk paths — CSV import, the four
 * provider migrations, e-shop sync, sandboxes — deliberately do not emit at
 * all; see docs/WEBHOOK-EVENTS.md.
 */
export async function createContact(
  orgId: string,
  input: CreateContactInput,
  source: ContactSource = 'api',
) {
  const [row] = await db
    .insert(contacts)
    .values({ orgId, ...enrichPhone(input) })
    .returning();
  emitWebhookEvent(orgId, 'contact.created', { ...toContactSummary(row!), source });
  return row!;
}

export async function createContactsBatch(
  orgId: string,
  inputs: CreateContactInput[],
  source: ContactSource = 'api',
) {
  const values = inputs.map((input) => ({ orgId, ...enrichPhone(input) }));
  const rows = await db.insert(contacts).values(values).returning();
  // Per contact: this is the API batch endpoint, which is bounded by the
  // request body, not the CSV importer that handles hundreds of thousands.
  for (const row of rows) {
    emitWebhookEvent(orgId, 'contact.created', { ...toContactSummary(row), source });
  }
  return rows;
}

/**
 * Context for a status change, when the caller is the one who knows it.
 *
 * `source` is passed in rather than guessed. This function cannot tell an
 * admin clicking in the UI from a script calling the API — both arrive as the
 * same patch — and the distinction is the whole point of recording it:
 * deliverability cares whether the recipient asked to leave or whether an
 * operator marked them.
 */
export interface UpdateContactContext {
  source?: UnsubscribeSource;
}

export async function updateContact(
  orgId: string,
  id: string,
  patch: UpdateContactInput,
  ctx: UpdateContactContext = {},
) {
  // Read before the write so a transition can be told from a no-op: patching
  // status to 'unsubscribed' on someone already unsubscribed is not an
  // unsubscribe, and must not produce a second event.
  const [before] = await db
    .select({ status: contacts.status })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  const becomingUnsubscribed =
    (patch as { status?: string }).status === 'unsubscribed' && before?.status !== 'unsubscribed';

  // Only that one transition is diverted. bounced, complained, archived, active
  // and every other patch keep the exact behaviour they had — they are not
  // unsubscribes and have their own handling elsewhere.
  if (becomingUnsubscribed) {
    const { unsubscribeContact } = await import('./unsubscribe.js');
    await unsubscribeContact(orgId, id, {
      scope: { kind: 'global' },
      source: ctx.source ?? 'api',
    });
    // unsubscribeContact has written status + suppression + the per-list rows.
    // Drop status from the patch so the update below cannot fight it, and let
    // the rest of the patch through unchanged.
    const rest = { ...(patch as Record<string, unknown>) };
    delete rest.status;
    if (Object.keys(rest).length === 0) {
      const [row] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)))
        .limit(1);
      if (!row) throw AppError.notFound('Contact');
      emitWebhookEvent(orgId, 'contact.updated', {
        ...toContactSummary(row),
        changed: changedFields(patch as Record<string, unknown>),
      });
      return row;
    }
    patch = rest as UpdateContactInput;
  }

  const [row] = await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() } as never)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Contact');
  // After the write, so an event is never emitted for an update that failed.
  emitWebhookEvent(orgId, 'contact.updated', {
    ...toContactSummary(row),
    changed: changedFields(patch as Record<string, unknown>),
  });
  return row;
}

export async function deleteContact(orgId: string, id: string) {
  const [row] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Contact');
  // Identifiers only: the rest of the row is no longer current information.
  emitWebhookEvent(orgId, 'contact.deleted', { id: row.id, email: row.email ?? null });
}
