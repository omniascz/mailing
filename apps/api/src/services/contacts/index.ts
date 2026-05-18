import { and, asc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, type Contact } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { parsePhonePrefix } from '../import/phone-prefix.js';

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

export async function createContact(orgId: string, input: CreateContactInput) {
  const [row] = await db
    .insert(contacts)
    .values({ orgId, ...enrichPhone(input) })
    .returning();
  return row!;
}

export async function createContactsBatch(orgId: string, inputs: CreateContactInput[]) {
  const values = inputs.map((input) => ({ orgId, ...enrichPhone(input) }));
  return db.insert(contacts).values(values).returning();
}

export async function updateContact(orgId: string, id: string, patch: UpdateContactInput) {
  const [row] = await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() } as never)
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Contact');
  return row;
}

export async function deleteContact(orgId: string, id: string) {
  const [row] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Contact');
}
